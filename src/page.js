/*
 * Copyright (c) 2019, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import * as common from './common.js';

/**
 * The URL of the widget iframe.
 * @const {string}
 */
const IFRAME_URL_PATH = '/v2/iframe.html';
const IFRAME_URL_PATH_DEBUG = '/v2/iframe.debug.html'; // DEBUG

/**
 * The key under which data will be stored for the iframe (to get around
 * non-persistent iframe storage on Safari).
 * @const {string}
 */
const IFRAME_STORAGE = 'iframeStorage';

/**
 * The PsiCash widget iframe element. Will bet set when the iframe is created.
 * @type {HTMLIFrameElement}
 */
let iframeElement_;

/**
 * The PsiCashParams for this widget. Will be set during initialization.
 * @type {common.PsiCashParams}
 */
let psicashParams_;

/**
 * Get the tokens, metadata, etc. we should use for reward transactions.
 * NOTE: Not all PsiCashParams may be filled in. For example, if there are no tokens, we
 * can still load the widget, as it might have locally-stored tokens that can be used.
 * (This situation suggests that the user is visiting the landing page directly, rather
 * than it being opened by the app.)
 * @returns {!common.PsiCashParams}
 */
function getPsiCashParams() {
  const scriptURL = common.getCurrentScriptURL();
  const scriptURLComponents = common.urlComponents(scriptURL);

  // The URL for this script may dev and/or debug flags
  const urlDebug = common.getURLParam(scriptURL, common.DEBUG_URL_PARAM);
  const urlDev = common.getURLParam(scriptURL, common.DEV_URL_PARAM);

  /** @type {common.PsiCashParams} */
  let urlPsiCashParams, localPsiCashParams, finalPsiCashParams;

  // We'll look in the URL and in localStorage for the payload, but we'll prefer
  // the URL, because it's where tokens will get updated when they change.
  // The params payload is transferred as URL-encoded JSON (possibly base64).

  let urlPayload = common.getURLParam(location.href, common.PSICASH_URL_PARAM);

  // Check if the payload is base64-encoded
  try {
    if (urlPayload) {
      urlPayload = window.atob(urlPayload);
    }
  }
  catch (error) {
    // Do nothing -- not base64
  }

  urlPayload = JSON.parse(urlPayload);

  if (urlPayload) {
    urlPsiCashParams = common.PsiCashParams.fromObject(urlPayload);
    if (urlPsiCashParams.tokens) {
      urlPsiCashParams.tokensPriority = 1; // URL tokens have higher priority
    }
  }

  // Figure out if we should be looking in dev or prod storage for stored params
  const useDevStorage =  (urlDev !== null && urlDev) || (urlPsiCashParams && urlPsiCashParams.dev);

  let localPayload = common.storageGet(common.PARAMS_STORAGE_KEY, useDevStorage);
  if (localPayload) {
    localPsiCashParams = common.PsiCashParams.fromObject(localPayload);
    localPsiCashParams.tokensPriority = 0; // Locally-stored tokens have lower priority
  }

  // Prefer the payload from the URL.
  finalPsiCashParams = urlPsiCashParams || localPsiCashParams || null;
  if (finalPsiCashParams) {
    finalPsiCashParams.widgetOrigin = common.getOrigin(scriptURLComponents);
    finalPsiCashParams.pageURL = location.href;

    if (urlDebug !== null) {
      finalPsiCashParams.debug = urlDebug;
    }
    if (urlDev !== null) {
      finalPsiCashParams.dev = urlDev;
    }
  }

  // Side-effect: Store the params locally, if available and different.
  if (finalPsiCashParams && !finalPsiCashParams.equal(localPsiCashParams)) {
    common.storageSet(common.PARAMS_STORAGE_KEY, finalPsiCashParams, useDevStorage);
  }

  return finalPsiCashParams;
}

/**
 * Loads the widget iframe into the page.
 */
function loadIframe() {
  const iframeURLPath = psicashParams_.debug ? IFRAME_URL_PATH_DEBUG : IFRAME_URL_PATH;
  const paramsString = encodeURIComponent(JSON.stringify(psicashParams_));
  let iframeSrc = `${psicashParams_.widgetOrigin}${iframeURLPath}#`;
  iframeSrc += `${common.PSICASH_URL_PARAM}=${paramsString}`;
  if (psicashParams_.dev !== null && psicashParams_.dev !== undefined) {
    iframeSrc += `&dev=${psicashParams_.dev}`;
  }
  if (psicashParams_.debug !== null && psicashParams_.debug !== undefined) {
    iframeSrc += `&debug=${psicashParams_.debug}`;
  }

  iframeElement_ = document.createElement('iframe');
  iframeElement_.src = iframeSrc;

  if (psicashParams_.debug) {
    iframeElement_.style.cssText = 'width:400px;height:400px;';
  }
  else {
    // Make invisible.
    iframeElement_.style.cssText = 'width:0;height:0;border:0;border:none;position:absolute;';
  }

  document.body.appendChild(iframeElement_);
}

/**
 * Callbacks waiting for PsiCash operations being processed by the iframe.
 * @type {Object.<string, function>}
 */
let pendingMessageCallbacks = {};

/**
 * Does necessary processing on a message received from the iframe.
 * @param {object} eventData
 */
function processIframeMessage(eventData) {
  const msg = JSON.parse(eventData);

  common.log('iframe message:', msg.type, msg);

  // NOTE: Don't return early from these cases unless you're certain there can't
  // be an associated callback.
  if (msg.type === 'ready') {
    // We can now start passing on requests rather than queuing them up.
    setUpPsiCashTag();
  }
  else if (msg.type === 'store') {
    // In Safari, iframe's don't have persistent storage, so we'll store stuff for it.
    common.storageSet(IFRAME_STORAGE, msg.data, psicashParams_.dev);
  }
  else if (msg.type === psicash.Action.PageView) {
    // Indicates that the request completed (successfully or not).
  }
  else if (msg.type === psicash.Action.ClickThrough) {
    // Indicates that the request completed (successfully or not).
  }

  if (msg.id && pendingMessageCallbacks[msg.id]) {
    pendingMessageCallbacks[msg.id]();
    delete pendingMessageCallbacks[msg.id];
  }
}

/**
 * Send a message to the iframe.
 * @param {!string} type The message type
 * @param {?any} payload
 * @param {?function} callback
 */
function sendMessageToIframe(type, payload, callback) {
  if (!iframeElement_ || !iframeElement_.contentWindow || !iframeElement_.contentWindow.postMessage) {
    // Nothing we can do.
    return;
  }

  const msg = new common.Message(type, payload, common.storageGet(IFRAME_STORAGE, psicashParams_.dev));

  if (callback) {
    pendingMessageCallbacks[msg.id] = callback;
  }

  // Older IE has a limitation where only strings can be sent as the message, so we're
  // going to use JSON.
  iframeElement_.contentWindow.postMessage(JSON.stringify(msg), psicashParams_.widgetOrigin);
}

/**
 * The exposed PsiCash action function. Full description of use can be found in the README.
 * @public
 * @param {!psicash.Action} action The action to perform. Required.
 * @param {?Object} obj Optional.
 * @param {?function} callback Optional.
 */
function psicash(action, obj, callback) {
  if (typeof obj === 'function') {
    callback = obj;
    obj = {};
  }
  obj = obj || {};
  sendMessageToIframe(action, obj, callback);
}

/**
 * Possible values for the action argument of psicash().
 * @enum {string}
 * @readonly
 */
psicash.Action = common.PsiCashAction;

// Must be called after the iframe indicates that it's available.
function setUpPsiCashTag() {
  if (!window.psicash) {
    common.error('Improperly configured; window.psicash must be present; see usage instructions');
    return;
  }

  const initialQueue = (window.psicash && window.psicash.queue) || [];

  window.psicash = psicash;
  for (let i = 0; i < initialQueue.length; i++) {
    psicash.apply(null, initialQueue[i]);
  }
}

// Do the work.
(function pageInitialize() {
  if (common.inWidgetIframe()) {
    // Nothing for the page script to do
    return;
  }

  psicashParams_ = getPsiCashParams();
  if (!psicashParams_) {
    // Can't continue.
    return common.error('Failed to get PsiCashParams');
  }

  // The iframe script will inform us when the next allowed reward is.
  window.addEventListener('message', function pageMessageHandler(event) {
    // Make sure that only the widget iframe can communicate with us.
    if (event.origin !== psicashParams_.widgetOrigin) {
      return;
    }
    processIframeMessage(event.data);
  }, false);

  loadIframe();
})();

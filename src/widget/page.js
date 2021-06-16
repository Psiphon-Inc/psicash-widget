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

import '../polyfills.js';
import * as consts from '../consts.js';
import * as utils from '../utils.js';
import * as common from '../common.js';

/**
 * The URL of the widget iframe.
 * @const {string}
 */
const IFRAME_URL_PATH = '/v2/iframe.html';
const IFRAME_URL_PATH_DEBUG = '/v2/iframe.debug.html'; // DEBUG

/**
 * The URL of this script.
 */
const scriptURL_ = utils.getCurrentScriptURL();

/**
 * The origin of the widget. This is used to ensure that messages received are coming
 * from the right place.
 */
const widgetOrigin_ = utils.getOrigin(utils.urlComponents(scriptURL_));

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
  // The URL for this script may have dev and/or debug flags
  const urlDebug = utils.getURLParam(scriptURL_, common.DEBUG_URL_PARAM);
  const urlDev = utils.getURLParam(scriptURL_, common.DEV_URL_PARAM);

  // We'll look in the URL and in localStorage for the payload, preferring the one with the newest tokens

  const urlPayload = utils.getURLParam(location.href, common.PSICASH_URL_PARAM);
  const urlPsiCashParams = common.PsiCashParams.fromURLPayload(urlPayload);

  // Figure out if we should be looking in dev or prod storage for stored params
  const useDevStorage =  (urlDev !== null && urlDev) || (urlPsiCashParams && urlPsiCashParams.dev);
  const localPayload = utils.storageGet(consts.PARAMS_STORAGE_KEY, useDevStorage);
  const localPsiCashParams = common.PsiCashParams.fromObject(localPayload);

  const finalPsiCashParams = common.PsiCashParams.newest(urlPsiCashParams, localPsiCashParams) || new common.PsiCashParams();

  if (urlDebug !== null) {
    finalPsiCashParams.debug = urlDebug;
  }
  if (urlDev !== null) {
    finalPsiCashParams.dev = urlDev;
  }

  // Side-effect: Store the params locally, if available and different.
  if (!finalPsiCashParams.equal(localPsiCashParams)) {
    utils.storageSet(consts.PARAMS_STORAGE_KEY, finalPsiCashParams, useDevStorage);
  }

  return finalPsiCashParams;
}

/**
 * Loads the widget iframe into the page.
 */
function loadIframe() {
  const iframeURLPath = psicashParams_.debug ? IFRAME_URL_PATH_DEBUG : IFRAME_URL_PATH;
  const paramsString = psicashParams_.encode();
  let iframeSrc = `${widgetOrigin_}${iframeURLPath}#!`;
  iframeSrc += `${common.PSICASH_URL_PARAM}=${paramsString}`;
  if (psicashParams_.dev !== null && psicashParams_.dev !== undefined) {
    iframeSrc += `&dev=${psicashParams_.dev}`;
  }
  if (psicashParams_.debug !== null && psicashParams_.debug !== undefined) {
    iframeSrc += `&debug=${psicashParams_.debug}`;
  }

  iframeElement_ = document.createElement('iframe');
  iframeElement_.src = iframeSrc;

  // Not all browsers (Safari and Brave) respect this property, but if we _can_ use the
  // hostname+path for distinguisher validation, then we want to.
  iframeElement_.referrerPolicy = 'no-referrer-when-downgrade';

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
 * Callback for when an iframe message is done being processed.
 * @callback ActionMessageCallback
 * @param {string} error
 * @param {boolean} success
 * @param {string} detail
 */

/**
 * Callbacks waiting for PsiCash operations being processed by the iframe.
 * @type {Object.<string, ActionMessageCallback>}
 */
let pendingMessageCallbacks_ = {};

/**
 * Does necessary processing on a message received from the iframe.
 * @param {Object} eventData
 */
function processIframeMessage(eventData) {
  const msg = JSON.parse(eventData);

  utils.log('iframe message:', msg.type, JSON.stringify(msg));

  if (msg.error) {
    utils.error(msg.error);
  }

  // NOTE: Don't return early from these cases unless you're certain there can't
  // be an associated callback.
  if (msg.type === 'ready') {
    // We can now start passing on requests rather than queuing them up.
    setUpPsiCashTag();
  }
  else if (msg.type === psicash.Action.Init) {
    // Indicates that the request completed (successfully or not).
  }
  else if (msg.type === psicash.Action.PageView) {
    // Indicates that the request completed (successfully or not).
  }
  else if (msg.type === psicash.Action.ClickThrough) {
    // Indicates that the request completed (successfully or not).
  }
  else if (msg.type === 'debug-localStorage::get') {
    msg.detail = JSON.stringify(msg.payload);
  }

  if (msg.id && pendingMessageCallbacks_[msg.id]) {
    pendingMessageCallbacks_[msg.id](msg.error, msg.success, msg.detail);
    delete pendingMessageCallbacks_[msg.id];
  }
}

/**
 * Send a message to the iframe.
 * @param {!string} type The message type
 * @param {?number} timeout The time allowed for the message processing (not always applicable)
 * @param {?any} payload
 * @param {?ActionMessageCallback} callback
 * @returns {!common.Message} The message object sent.
 */
function sendMessageToIframe(type, timeout, payload, callback) {
  if (!iframeElement_ || !iframeElement_.contentWindow || !iframeElement_.contentWindow.postMessage) {
    // Nothing we can do.
    return;
  }

  const msg = new common.Message(type, timeout, payload);

  if (callback) {
    pendingMessageCallbacks_[msg.id] = callback;
  }

  // Older IE has a limitation where only strings can be sent as the message, so we're
  // going to use JSON.
  const msgJSON = JSON.stringify(msg);
  iframeElement_.contentWindow.postMessage(msgJSON, widgetOrigin_);

  return msg;
}

/**
 * Expose a function to the page, on `window._psicash`.
 * If `prodAllowed` and `devAllowed` are both false, the function will only be exposed in
 * local testing builds.
 * @param {boolean} prodAllowed Exposes the function in prod builds.
 * @param {boolean} devAllowed Exposes the function in dev builds.
 * @param {function} func
 * @param {string} funcName
 */
function exposeToWindow(prodAllowed, devAllowed, func, funcName) {
  if (!prodAllowed
      && !(devAllowed && consts.isDevBuild())
      && !consts.LOCAL_TESTING_BUILD) {
    return;
  }
  window._psicash = window._psicash || {};
  window._psicash[funcName] = func;
}

/**
 * The exposed PsiCash action function. Full description of use can be found in the README.
 * @public
 * @param {!psicash.Action} action The action to perform. Required.
 * @param {?Object} obj Optional.
 * @param {?ActionMessageCallback} callback Optional.
 */
function psicash(action, obj, callback) {
  if (!common.PsiCashActionValid(action)) {
    throw new Error('PsiCash action name is invalid: ' + action);
  }

  if (typeof obj === 'function') {
    callback = obj;
    obj = {};
  }
  obj = obj ?? {};

  /** @type {?number} */
  let timeout = obj.timeout;
  if (typeof timeout !== 'number') {
    timeout = common.PsiCashActionDefaultTimeout(action);
  }

  // No matter how catastrophically the rest of the code path fails, we still want to call
  // the callback by the timeout.
  if (callback) {
    const origCallback = callback;
    let callbackCalled = false;
    callback = function callbackWrapper() {
      if (callbackCalled) {
        return;
      }
      callbackCalled = true;
      origCallback.apply(this, arguments);
    };

    setTimeout(() => callback('timed out', false, 'safety timeout hit'), timeout);
  }

  const msg = sendMessageToIframe(action, timeout, obj, callback);

  // We want to guarantee that the callback fires within the specified time. Hopefully
  // that will happen naturally, but we'll use a callback to ensure it.
  if (timeout) {
    setTimeout(() => {
      // This timeout will always fire, even if the action has already completed.
      // We can determine if the callback should be called if it's still in
      // pendingMessageCallbacks_.
      if (msg.id && pendingMessageCallbacks_[msg.id]) {
        utils.log('action timed out: ' + action);
        // The callback has NOT already been called.
        pendingMessageCallbacks_[msg.id](null, false, 'timeout');
        // Delete the callback so it isn't called again.
        delete pendingMessageCallbacks_[msg.id];
      }
    }, timeout);
  }
}

/**
 * Possible values for the action argument of psicash().
 * @enum {string}
 */
psicash.Action = common.PsiCashAction;

/**
 * Replace the stub psicash() function that the page snippet added with the real function.
 * Also begin processing queued actions.
 * Must be called after the iframe indicates that it's available.
 */
function setUpPsiCashTag() {
  if (!window.psicash) {
    utils.error('Improperly configured; window.psicash must be present; see usage instructions');
    return;
  }

  const initialQueue = (window.psicash && window.psicash.queue) || [];

  // If the page hasn't included an 'init' action, we'll prepend one.
  if (initialQueue.length === 0 || initialQueue[0][0] !== 'init') {
    initialQueue.unshift(['init']);
  }

  window.psicash = psicash;
  for (let i = 0; i < initialQueue.length; i++) {
    psicash.apply(null, initialQueue[i]);
  }
}

// Do the work.
(function pageInitialize() {
  if (utils.inWidgetIframe()) {
    // Nothing for the page script to do
    return;
  }

  // Disallow this widget from being loaded into an iframe. This isn't a restriction of
  // the widget so much as a mitigation against an earning attack that iframes our landing
  // pages. See: https://github.com/Psiphon-Inc/psiphon-issues/issues/554
  if (utils.inIframe()) {
    throw new Error('The widget must not be put in an iframe');
  }

  psicashParams_ = getPsiCashParams();

  // Widget-using pages sometimes need to access client platform and version in order to
  // decide what to show, etc. We'll expose a copy of our parameters -- the metadata
  // contains that info.
  // NOTE: This is only exposing information that is already available to this page, just
  // in a more accessible form.
  exposeToWindow(true, true, () => JSON.parse(JSON.stringify(psicashParams_)), 'params');

  // The iframe script will inform us when the next allowed reward is.
  window.addEventListener('message', function pageMessageHandler(event) {
    // Make sure that only the widget iframe can communicate with us.
    if (event.origin !== widgetOrigin_) {
      return;
    }
    processIframeMessage(event.data);
  }, false);

  loadIframe();
})();

/////////////////////
// Testing-only code

/**
 * Clear localStorage for page and/or iframe. Used when testing.
 * @param {boolean} page Clear page localStorage.
 * @param {boolean} iframe Clear iframe localStorage
 * @param {?ActionMessageCallback} callback Callback to fire when clearing is complete.
 */
function clearLocalStorage(page, iframe, callback) {
  if (page) {
    utils.log('page local storage clearing', window.localStorage.length, 'key(s)');
    window.localStorage.clear();
  }

  if (iframe) {
    sendMessageToIframe('debug-localStorage::clear', null, null, callback);
  }
  else {
    // Ensure the callback is asynchronous.
    setTimeout(callback, 1);
  }

  // It's silly to call this with both params being false, but...
  if (!page && !iframe) {
    // Ensure the callback is asynchronous.
    setTimeout(callback, 1);
  }
}
exposeToWindow(false, true, clearLocalStorage, 'clearLocalStorage');

/**
 * Get a dump of the iframe's localStorage. Used when testing.
 * @param {?ActionMessageCallback} callback Callback to fire when retrieval is complete.
 *    The `detail` argument will be the JSON-encoded contents of localStorage.
 */
function getIframeLocalStorage(callback) {
  sendMessageToIframe('debug-localStorage::get', null, null, callback);
}
exposeToWindow(false, false, getIframeLocalStorage, 'getIframeLocalStorage');

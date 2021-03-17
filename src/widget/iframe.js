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

import * as consts from '../consts.js';
import * as utils from '../utils.js';
import * as common from '../common.js';

/**
 * Key used to store the next-allowed value in localStorage and pass it back to the
 * landing page script.
 * @const {string}
 */
const NEXTALLOWED_KEY = 'nextAllowed';

/**
 * If set, an unrecoverable error has occurred. This error will be returned with all
 * iframe->page messages.
 * @type {string}
 */
let globalFatalError_;

/**
 * The PsiCashParams for this widget. Will be set during initialization.
 * @type {common.PsiCashParams}
 */
let psicashParams_;

/**
 * The origin of the hosting page. Needed for message passing.
 * @type {string}
 */
let pageOrigin_;

/**
 * Get the tokens, metadata, etc. we should use for the reward transaction.
 * NOTE: Not all PsiCashParams may be filled in.
 * On error, the return value's error field will be populated.
 * NOTE: This is not identical to getPsiCashParams() in page.js.
 * @returns {!common.PsiCashParams}
 */
function getIframePsiCashParams() {
  // There are two URLs where the dev and debug flags could be set:
  // 1. The URL for iframe.html
  // 2. The URL for this script
  const scriptURL = utils.getCurrentScriptURL();
  let urlDebug = null, urlDev = null;
  for (let url of [location.href, scriptURL]) {
    urlDebug = urlDebug || utils.getURLParam(url, common.DEBUG_URL_PARAM);
    urlDev = urlDev || utils.getURLParam(url, common.DEV_URL_PARAM);
  }

  // The widget passes PsiCashParams via the iframe URL, and we might have stored some
  // from a previous request. We will prefer the newest tokens.

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

  // If the final params are different from the ones we had stored locally, we're going
  // to first clear anything else we had stored. This is because we could be a completely
  // different user if the tokens are changing.
  if (!localPsiCashParams || finalPsiCashParams.tokens !== localPsiCashParams.tokens) {
    utils.storageClear(finalPsiCashParams.dev);
  }
  if (!finalPsiCashParams.equal(localPsiCashParams)) {
    utils.storageSet(consts.PARAMS_STORAGE_KEY, finalPsiCashParams, finalPsiCashParams.dev);
  }

  return finalPsiCashParams;
}

/**
 * Process a posted message received from the widget page code.
 * @param {string} eventData
 */
function processPageMessage(eventData) {
  const msg = common.Message.fromJSON(eventData);

  utils.log('page message:', msg.type, JSON.stringify(msg));

  if (msg.type.startsWith('debug-localStorage')) {
    if (!consts.LOCAL_TESTING_BUILD) {
      throw new Error('only allowed when testing');
    }

    switch (msg.type) {
    case 'debug-localStorage::clear':
      utils.log('iframe local storage clearing', window.localStorage.length, 'key(s)');
      window.localStorage.clear();
      break;
    case 'debug-localStorage::get':
      msg.payload = window.localStorage;
      break;
    default:
      throw new Error(`invalid localStorage command: ${msg.type}`);
    }

    sendMessageToPage(msg);

    return;
  }

  if (globalFatalError_) {
    // Something unrecoverable has occurred. Do not try to proceed with a request.
    msg.error = globalFatalError_;
    sendMessageToPage(msg);
    return;
  }

  if (!psicashParams_.tokens) {
    // We don't have valid tokens and cannot possibly proceed with a request.
    msg.error = 'no tokens available';
    sendMessageToPage(msg);
    return;
  }

  if (msg.type === 'init') {
    // respond directly
    sendMessageToPage(msg);
    return;
  }

  // All the rest of the possible message types are transactions.

  const distinguisher = getDistinguisher(msg);
  if (!validateDistinguisher(distinguisher)) {
    // The distinguisher is bad. We cannot proceed with a reward attempt.
    msg.error = 'distinguisher is invalid for this page: ' + distinguisher;
    sendMessageToPage(msg);
    return;
  }

  // Coincidentally, the message types are also the transaction classes.
  const clazz = msg.type;

  if (!isRewardAllowed(clazz, distinguisher)) {
    // We're not going to set the error, as this is transient and expected
    msg.setSuccess(false, 'not yet allowed');
    sendMessageToPage(msg);
    // The check will log the details
    return;
  }

  const reqConfig = {
    psicashParams: psicashParams_,
    timeout: msg.timeout,
    path: '/transaction',
    method: 'POST',
    queryParams: `class=${clazz}&distinguisher=${encodeURIComponent(distinguisher)}`,
    callback: function reqCallback(result) {
      if (result.error) {
        // We failed all of our attempts and ran out of time.
        // Let the page script know that we're done.
        // We're not going to set msg.error, as this might be transient and recoverable.
        msg.setSuccess(false, `request error: ${result.error}`);
      }
      else if (result.status === 401) {
        // Our tokens are bad and we should nullify them. We will also clear all other
        // storage (for example "next allowed" items) as we might have a logout.
        psicashParams_.tokens = null;
        utils.storageClear(psicashParams_.dev);
        utils.storageSet(consts.PARAMS_STORAGE_KEY, psicashParams_, psicashParams_.dev);

        utils.log('Request failed with 401', `dev-env:${!!psicashParams_.dev}`);
        msg.setSuccess(false, '401 access denied');
      }
      else if (result.status === 200) {
        utils.log(`Successful ${clazz} reward for ${distinguisher}`, `dev-env:${!!psicashParams_.dev}`);

        // Store the NextAllowed datetime in the response to limit our future attempts.
        const response = JSON.parse(result.body);
        const nextAllowed = response &&
                            response.TransactionResponse &&
                            response.TransactionResponse.Values &&
                            response.TransactionResponse.Values.NextAllowed;
        if (nextAllowed) {
          const storageKey = `${NEXTALLOWED_KEY}::${clazz}::${distinguisher}`;
          utils.storageSet(storageKey, nextAllowed, psicashParams_.dev);
        }

        msg.setSuccess(true, String(result.status));
      }
      else {
        // We got a status we didn't expect
        msg.setSuccess(false, String(result.status));
      }

      // We're done, so let the page know.
      sendMessageToPage(msg);
    }
  };

  common.makePsiCashServerRequest(reqConfig);
}

/**
 * Send a message to the widget page code.
 * @param {common.Message} msg
 */
function sendMessageToPage(msg) {
  if (!window.parent || !window.parent.postMessage) {
    // Nothing we can do.
    utils.error('Cannot post to page');
    return;
  }

  msg.error = msg.error || globalFatalError_ || null;
  if (msg.error) {
    msg.success = false;
  }

  // Older IE has a limitation where only strings can be sent as the message, so we're
  // going to use JSON.
  window.parent.postMessage(JSON.stringify(msg), pageOrigin_);
}

/**
 * Checks if the given distinguisher is valid for the referring page.
 * @param {!string} distinguisher
 * @returns {boolean}
 */
function validateDistinguisher(distinguisher) {
  // The distinguisher may be one of:
  // hostname.com
  // hostname.com/partial/path
  //
  // We require document.referrer to not be empty, but we cannot rely on it to contain
  // more than the hostname. We have found that it's impossible to get Safari or Brave to
  // pass more than the hostname cross-origin.
  //
  // We will validate using as much referrer we have available, to help prevent widget
  // configuration mistakes, but the hostname alone will have to be sufficient for safety.
  //
  // Note that some browsers (Safari) provide an origin-only referrer without a trailing
  // slash, and some (Brave) with a trailing slash.
  //
  // If the browser or host page is configured in such a way that we don't get a referrer
  // at all, then the validation will always fail. This is by design -- otherwise it would
  // be too easy for an exploitative page to host our widget with `iframe.referrerPolicy=no-referrer`
  // and we would accept any distinguisher.

  // We're not doing a simple prefix check because that would introduce a vulnerability like:
  // If the distinguisher is hostname.com and the attacker uses a domain like hostname.com.nogood.com

  const referrerURLComponents = common.urlComponents(document.referrer);
  const referrerHost = common.getHost(referrerURLComponents);
  const referrerPath = (referrerURLComponents.pathname === '/' ? null : referrerURLComponents.pathname);

  const distinguisherComponents = distinguisher.match(/^([^/]+)(.*)$/);
  if (!distinguisherComponents || distinguisherComponents.length !== 3) {
    return false;
  }
  const distinguisherHost = distinguisherComponents[1];
  const distinguisherPath = distinguisherComponents[2];

  if (referrerHost !== distinguisherHost) {
    return false;
  }

  if (referrerPath && referrerPath.indexOf(distinguisherPath) !== 0) {
    return false;
  }

  return true;
}

/**
 * Check if the reward transaction is allowed for this page yet.
 * @param {!string} clazz
 * @param {!string} distinguisher
 * @returns {boolean}
 */
function isRewardAllowed(clazz, distinguisher) {
  const storageKey = NEXTALLOWED_KEY + '::' + clazz + '::' + distinguisher;
  let storedNextAllowed = utils.storageGet(storageKey, psicashParams_.dev);
  let nextAllowed = storedNextAllowed ? new Date(storedNextAllowed) : null;
  if (!nextAllowed) {
    return true;
  }

  const now = new Date();

  const allowedNow = nextAllowed.getTime() < now.getTime();
  if (!allowedNow) {
    utils.log(`${clazz} reward not yet allowed; next allowed = ${nextAllowed}`, `dev-env:${!!psicashParams_.dev}`);
  }

  return allowedNow;
}

/**
 * Get the distinguisher to use for, e.g., a page-view reward request.
 * If one is specified in msg's payload, that will be used. Otherwise it will
 * be derived from the page URL.
 * @param {common.Message} msg
 */
function getDistinguisher(msg) {
  if (msg.payload && msg.payload.distinguisher) {
    return msg.payload.distinguisher;
  }
  return utils.getHost(utils.urlComponents(document.referrer));
}

// Initialize
(function iframeInitialize() {
  if (!utils.inWidgetIframe()) {
    // Nothing for the iframe script to do
    return;
  }

  if (!document.referrer) {
    // The user has disabled referrers. We will never be able to validate a
    // distinguisher and basically can't proceed.
    // Setting this prevents requests from being attempted later.
    globalFatalError_ = 'document.referrer is unavailable';
    utils.error(globalFatalError_);
  }

  psicashParams_ = getIframePsiCashParams();

  // Keep a global page origin, so we don't have to keep re-parsing it.
  pageOrigin_ = utils.getOrigin(utils.urlComponents(document.referrer));

  window.addEventListener('message', function iframeMessageHandler(event) {
    // Make sure that only the parent page can communicate with us.
    if (event.origin !== pageOrigin_) {
      return;
    }
    processPageMessage(event.data);
  }, false);

  sendMessageToPage(new common.Message('ready'));
})();

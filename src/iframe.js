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
 * The NewTransaction API server endpoint, including version number.
 * @const {string}
 */
const PSICASH_TRANSACTION_URL = 'https://api.psi.cash/v1/transaction'; // PROD
const PSICASH_TRANSACTION_URL_DEV = 'https://dev-api.psi.cash/v1/transaction'; // DEV

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
  const scriptURL = common.getCurrentScriptURL();
  let urlDebug = null, urlDev = null;
  for (let url of [location.href, scriptURL]) {
    urlDebug = urlDebug || common.getURLParam(url, common.DEBUG_URL_PARAM);
    urlDev = urlDev || common.getURLParam(url, common.DEV_URL_PARAM);
  }

  // The widget passes PsiCashParams via the iframe URL, and we might have stored some
  // from a previous request. We will prefer the newest tokens.

  const urlPayload = common.getURLParam(location.href, common.PSICASH_URL_PARAM);
  const urlPsiCashParams = common.PsiCashParams.fromObject(JSON.parse(urlPayload));

  // Figure out if we should be looking in dev or prod storage for stored params
  const useDevStorage =  (urlDev !== null && urlDev) || (urlPsiCashParams && urlPsiCashParams.dev);

  const localPayload = common.storageGet(common.PARAMS_STORAGE_KEY, useDevStorage);
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
    common.storageClear(finalPsiCashParams.dev);
  }
  if (!finalPsiCashParams.equal(localPsiCashParams)) {
    common.storageSet(common.PARAMS_STORAGE_KEY, finalPsiCashParams, finalPsiCashParams.dev);
  }

  return finalPsiCashParams;
}

/**
 * Process a posted message received from the widget page code.
 * @param {string} eventData
 */
function processPageMessage(eventData) {
  const msg = common.Message.fromJSON(eventData);

  common.log('page message:', msg.type, msg);

  if (msg.type === 'clear-localStorage') {
    localStorage.clear();
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
    msg.error = 'No tokens available';
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
    msg.error = 'Distinguisher is invalid for this page: ' + distinguisher;
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

  makeTransactionRequest(msg, clazz, distinguisher, msg.timeout);
}

/**
 * Send a message to the widget page code.
 * @param {common.Message} msg
 */
function sendMessageToPage(msg) {
  if (!window.parent || !window.parent.postMessage) {
    // Nothing we can do.
    common.error('Cannot post to page');
    return;
  }

  msg.error = msg.error || globalFatalError_ || null;

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
  let storedNextAllowed = common.storageGet(storageKey, psicashParams_.dev);
  let nextAllowed = storedNextAllowed ? new Date(storedNextAllowed) : null;
  if (!nextAllowed) {
    return true;
  }

  const now = new Date();

  const allowedNow = nextAllowed.getTime() < now.getTime();
  if (!allowedNow) {
    common.log(`${clazz} reward not yet allowed; next allowed = ${nextAllowed}`, `dev-env:${!!psicashParams_.dev}`);
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
  return common.getHost(common.urlComponents(document.referrer));
}

/**
 * Make a transaction (i.e., reward) request to the PsiCash server.
 * `msg` will be modified to indicate success.
 * @param {common.Message} msg
 * @param {string} clazz The transaction class (like 'page-view')
 * @param {string} distinguisher The transaction distinguisher (like 'example.com')
 * @param {number} timeout The time allowed for this request (including retries).
 *                         Regardless of how short this is, we'll always make one attempt.
 * @param {number} start The start time for a series of request retries. Must only be set by recursive calls.
 * @param {number} attempt The count of the next attempt. Must only be set by recursive calls.
 * @param {common.PsiCashParams} psicashParams The params object to use and modify. Must only be set by recursive calls.
 */
function makeTransactionRequest(msg, clazz, distinguisher, timeout, start=Date.now(), attempt=1, psicashParams=null) {
  // We're going to interpret "no timeout" as 100s.
  timeout = timeout || 100000;
  const remainingTime = timeout - (Date.now() - start);

  function recurse() {
    if (remainingTime < 0) {
      // We failed all of our attempts and ran out of time.
      // Let the page script know that we're done.
      // We're not going to set msg.error, as this might be transient and recoverable.
      msg.setSuccess(false, 'request timeout');
      sendMessageToPage(msg);
      return;
    }

    // Wait 100ms and try again.
    setTimeout(() => makeTransactionRequest(msg, clazz, distinguisher, timeout, start, attempt+1), 100);
  }

  if (!psicashParams) {
    // Clone the global object, which we don't want to modify directly because it might be
    // used by multiple concurrent requests.
    psicashParams = JSON.parse(JSON.stringify(psicashParams_));
  }

  // We need the request metadata to exist to record the attempt count.
  if (!psicashParams.metadata) {
    psicashParams.metadata = {};
  }
  psicashParams.metadata.attempt = attempt;

  // For logging and debugging purposes, record the referrer in the metadata, but _not_
  // with any potentially-identifying query params or hash.
  psicashParams.metadata.referrer = pageOrigin_ + common.urlComponents(document.referrer).pathname;

  const psicashTransactionURL = psicashParams.dev ? PSICASH_TRANSACTION_URL_DEV : PSICASH_TRANSACTION_URL;
  const reqURL = `${psicashTransactionURL}?class=${clazz}&distinguisher=${encodeURIComponent(distinguisher)}`;

  let xhr = new(window.XMLHttpRequest || window.ActiveXObject)('MSXML2.XMLHTTP.3.0');
  xhr.timeout = remainingTime;
  xhr.open('POST', reqURL, true);
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  xhr.setRequestHeader('X-PsiCash-Auth', psicashParams.tokens);
  xhr.setRequestHeader('X-PsiCash-Metadata', JSON.stringify(psicashParams.metadata));

  xhr.onload = function xhrOnLoad() {
    msg.setSuccess(xhr.status === 200, String(xhr.status));

    common.log(msg, xhr.status, xhr.statusText, xhr.responseText, `dev-env:${!!psicashParams.dev}`);

    if (xhr.status >= 500) {
      // Retry
      common.log('Request failed with 500; retrying', `dev-env:${!!psicashParams.dev}`);
      return recurse();
    }
    else if (xhr.status === 401) {
      // Our tokens are bad and we should nullify them. We will also clear all other
      // storage (for example "next allowed" items) as we might have a logout.
      psicashParams_.tokens = null;
      common.storageClear(psicashParams_.dev);
      common.storageSet(common.PARAMS_STORAGE_KEY, psicashParams_, psicashParams_.dev);

      common.log('Request failed with 401', `dev-env:${!!psicashParams.dev}`);
    }
    else if (xhr.status === 200) {
      common.log(`Successful ${clazz} reward for ${distinguisher}`, `dev-env:${!!psicashParams.dev}`);

      // Store the NextAllowed datetime in the response to limit our future attempts.
      const response = JSON.parse(xhr.responseText);
      const nextAllowed = response &&
                          response.TransactionResponse &&
                          response.TransactionResponse.Values &&
                          response.TransactionResponse.Values.NextAllowed;
      if (nextAllowed) {
        const storageKey = `${NEXTALLOWED_KEY}::${clazz}::${distinguisher}`;
        common.storageSet(storageKey, nextAllowed, psicashParams.dev);
      }
    }

    // We're done, so let the page know.
    sendMessageToPage(msg);
  };

  xhr.onerror = function xhrOnError() {
    // Retry
    common.log('Request error; retrying', `dev-env:${!!psicashParams.dev}`);
    msg.detail = 'request error';
    return recurse();
  };

  xhr.ontimeout = function xhrOnTimeout() {
    // Retry
    common.log('Request timeout', `dev-env:${!!psicashParams.dev}`);
    msg.detail = 'request timeout';
    return recurse();
  };

  xhr.send(null);

}

// Initialize
(function iframeInitialize() {
  if (!common.inWidgetIframe()) {
    // Nothing for the iframe script to do
    return;
  }

  if (!document.referrer) {
    // The user has disabled referrers. We will never be able to validate a
    // distinguisher and basically can't proceed.
    // Setting this prevents requests from being attempted later.
    globalFatalError_ = 'document.referrer is unavailable';
    common.error(globalFatalError_);
  }

  psicashParams_ = getIframePsiCashParams();

  // Keep a global page origin, so we don't have to keep re-parsing it.
  pageOrigin_ = common.getOrigin(common.urlComponents(document.referrer));

  window.addEventListener('message', function iframeMessageHandler(event) {
    // Make sure that only the parent page can communicate with us.
    if (event.origin !== pageOrigin_) {
      return;
    }
    processPageMessage(event.data);
  }, false);

  sendMessageToPage(new common.Message('ready'));
})();

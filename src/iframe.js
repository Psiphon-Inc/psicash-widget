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
 * The maximum number of attempts allowed for a single request.
 * (To be extra clear: 3 means 1 try and 2 retries.)
 * @const {number}
 */
const MAX_REQUEST_ATTEMPTS = 3;

/**
 * Key used to store the next-allowed value in localStorage and pass it back to the
 * landing page script.
 * @const {string}
 */
const NEXTALLOWED_KEY = 'nextAllowed';

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

  // The widget passes PsiCashParams via URL, and we might have stored some from a
  // previous request. Which tokens we use will depend on the priority of the URL tokens.
  // Other fields will be merged.

  /** @type {common.PsiCashParams} */
  let urlPsiCashParams, localPsiCashParams;
  let finalPsiCashParams = new common.PsiCashParams();

  let urlPayload = common.getURLParam(location.href, common.PSICASH_URL_PARAM);
  if (!urlPayload) {
    // We cannot proceed. Even if we can get tokens from localStorage, the page
    // must send us pageURL, etc.
    finalPsiCashParams.error = 'PsiCashParams missing from URL';
    common.error(finalPsiCashParams.error);
    return finalPsiCashParams;
  }

  urlPsiCashParams = common.PsiCashParams.fromObject(JSON.parse(urlPayload));

  // At least pageURL _must_ be set.
  if (!urlPsiCashParams.pageURL) {
    finalPsiCashParams.error = 'PsiCashParams.pageURL missing from URL';
    common.error(finalPsiCashParams.error);
    return finalPsiCashParams;
  }

  // Figure out if we should be looking in dev or prod storage for stored params
  const useDevStorage =  (urlDev !== null && urlDev) || (urlPsiCashParams && urlPsiCashParams.dev);

  let localPayload = common.storageGet(common.PARAMS_STORAGE_KEY, useDevStorage);
  localPsiCashParams = common.PsiCashParams.fromObject(localPayload);

  // We prefer the contents of urlPsiCashParams over localPsiCashParams, but some fields
  // might be overridden.
  finalPsiCashParams = urlPsiCashParams;

  // If the URL tokenPriority is 0, then we should use the local tokens, if available.
  if (!finalPsiCashParams.tokensPriority // tests for undefined, null, and 0
      && localPsiCashParams && localPsiCashParams.tokens) {
    finalPsiCashParams.tokens = localPsiCashParams.tokens;
  }

  // Ensure tokens are present at this point.
  if (!finalPsiCashParams.tokens) {
    finalPsiCashParams.error = 'no tokens in PsiCashParams';
    common.error(finalPsiCashParams.error);
    return finalPsiCashParams;
  }

  if (urlDebug !== null) {
    finalPsiCashParams.debug = urlDebug;
  }
  if (urlDev !== null) {
    finalPsiCashParams.dev = urlDev;
  }

  // Side-effect: Store the finalPsiCashParams locally.
  common.storageSet(common.PARAMS_STORAGE_KEY, finalPsiCashParams, finalPsiCashParams.dev);

  return finalPsiCashParams;
}

/**
 * Process a posted message received from the widget page code.
 * @param {string} eventData
 */
function processPageMessage(eventData) {
  const msg = common.Message.fromJSON(eventData);

  // The page will have sent us data that the iframe previously asked it to store.
  // We will prefer our own locally-stored data, as it's fresher.
  if (msg.storage) {
    common.storageMerge(msg.storage, false, psicashParams_.dev);
  }

  if (msg.type === 'clear-localStorage') {
    localStorage.clear();
    sendMessageToPage(msg);
    return;
  }

  if (psicashParams_.error) {
    // Something unrecoverable has occurred. Do not try to proceed with a request.
    msg.error = psicashParams_.error;
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
    msg.success = false;
    sendMessageToPage(msg);
    // The check will log the details
    return;
  }

  makeTransactionRequest(msg, clazz, distinguisher);
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

  msg.error = msg.error || psicashParams_.error || null;

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

  // A bad match we're defending against here: If the distinguisher is
  // hostname.com and the attacker uses a domain like hostname.com.nogood.com

  const pageURLComponents = common.urlComponents(psicashParams_.pageURL);

  const pageHost = common.getHost(pageURLComponents);
  const distinguisherHost = distinguisher.split('/')[0];
  if (pageHost !== distinguisherHost) {
    return false;
  }

  const pageURLComparator = pageHost + pageURLComponents.pathname;
  return pageURLComparator.indexOf(distinguisher) === 0;
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
    common.log(`${clazz} reward not yet allowed; next allowed = ${nextAllowed}`);
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
  return common.getHost(common.urlComponents(psicashParams_.pageURL));
}

/**
 *
 * @param {common.Message} msg
 * @param {string} clazz
 */
function makeTransactionRequest(msg, clazz, distinguisher, attemptCount=1) {
  function recurse() {
    attemptCount += 1;
    if (attemptCount > MAX_REQUEST_ATTEMPTS) {
      // We failed all of our attempts. Let the page script know that we're done.
      // We're not going to set msg.error, as this might be transient and recoverable.
      msg.success = false;
      sendMessageToPage(msg);
      return;
    }
    setTimeout(() => makeTransactionRequest(msg, clazz, distinguisher, attemptCount), 1000);
  }

  // We need the request metadata to exist to record the attempt count.
  if (!psicashParams_.metadata) {
    psicashParams_.metadata = {};
  }

  // Increment the attempt count.
  psicashParams_.metadata.attempt = psicashParams_.metadata.attempt ? psicashParams_.metadata.attempt+1 : 1;

  const psicashTransactionURL = psicashParams_.dev ? PSICASH_TRANSACTION_URL_DEV : PSICASH_TRANSACTION_URL;
  const reqURL = `${psicashTransactionURL}?class=${clazz}&distinguisher=${encodeURIComponent(distinguisher)}`;

  let xhr = new(window.XMLHttpRequest || window.ActiveXObject)('MSXML2.XMLHTTP.3.0');
  xhr.open('POST', reqURL, true);
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  xhr.setRequestHeader('X-PsiCash-Auth', psicashParams_.tokens);
  xhr.setRequestHeader('X-PsiCash-Metadata', JSON.stringify(psicashParams_.metadata));

  xhr.onload = function xhrOnLoad() {
    common.log(msg, xhr.status, xhr.statusText, xhr.responseText);

    if (xhr.status >= 500) {
      // Retry
      common.log('Request failed with 500; retrying');
      return recurse();
    }
    else if (xhr.status === 200) {
      common.log(`Successful ${clazz} reward for ${distinguisher}`);

      // Store the NextAllowed datetime in the response to limit our future attempts.
      const response = JSON.parse(xhr.responseText);
      const nextAllowed = response &&
                          response.TransactionResponse &&
                          response.TransactionResponse.Values &&
                          response.TransactionResponse.Values.NextAllowed;
      if (nextAllowed) {
        const storageKey = NEXTALLOWED_KEY + '::' + clazz + '::' + distinguisher;
        common.storageSet(storageKey, nextAllowed, psicashParams_.dev);
        // Also set it into msg's storage property, to get the page to also store it
        msg.storage = {storageKey: nextAllowed};
      }
    }

    // We're done, so let the page know.
    msg.success = (xhr.status === 200);
    sendMessageToPage(msg);
  };

  xhr.onerror = function xhrOnError() {
    // Retry
    common.log('Request error; retrying');
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

  psicashParams_ = getIframePsiCashParams();

  // Also keep a global page origin, so we don't have to keep re-parsing it
  pageOrigin_ = common.getOrigin(common.urlComponents(psicashParams_.pageURL));

  window.addEventListener('message', function iframeMessageHandler(event) {
    // Make sure that only the parent page can communicate with us.
    if (event.origin !== pageOrigin_) {
      return;
    }
    processPageMessage(event.data);
  }, false);

  sendMessageToPage(new common.Message('ready'));
})();

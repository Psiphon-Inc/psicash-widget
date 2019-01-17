/*
 * Copyright (c) 2018, Psiphon Inc.
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

(function () {
  'use strict';

  /**
   * The hash param key for passing the tokens, metadata, etc. to the iframe.
   * @const {string}
   */
  var IFRAME_PSICASH_PARAM = 'psicash';

  /**
   * The NewTransaction API server endpoint, including version number.
   * @const {string}
   */
  var PSICASH_TRANSACTION_URL = 'https://api.psi.cash/v1/transaction'; // PROD
  //DEV PSICASH_TRANSACTION_URL = 'https://dev-api.psi.cash/v1/transaction'; // DEV

  /**
   * Prefix added to the everything stored in localStorage.
   * @const {string}
   */
  var LOCALSTORAGE_KEY_PREFIX = 'PsiCash::'; // PROD
  //DEV LOCALSTORAGE_KEY_PREFIX = 'PsiCash-Dev::'; // DEV
  /**
   * Key used to store the next-allowed value in localStorage and pass it back to the
   * landing page script.
   * @const {string}
   */
  var NEXTALLOWED_KEY = 'nextAllowed';

  /**
   * @typedef {Object} ReqParams
   * REFACTOR NOTE: This is identical to ReqParams in psicash.js.
   * @property {string} tokens
   * @property {number} tokensPriority Will be 0 for low and 1 for high. High priority
   *   tokens come from the landing page URL (which come from the app) and supersede any
   *   stored tokens.
   *   See https://github.com/Psiphon-Inc/psiphon-issues/issues/432 for more details.
   * @property {string} distinguisher
   * @property {Object} metadata
   */

  /**
   * Get the tokens, metadata, etc. we should use for the reward transaction.
   * NOTE: Not all ReqParams may be filled in.
   * Returns null if no tokens are available.
   * REFACTOR NOTE: This is not identical to getReqParams() in psicash.js.
   * @returns {?ReqParams}
   */
  function getIframeReqParams() {
    // The widget passes ReqParams via URL, and we might have stored some from a previous
    // request. Which tokens we use will depend on the priority of the URL tokens. Other
    // fields will be merged.

    /** @type ReqParams */
    var urlReqParams, localReqParams, finalReqParams;

    var urlPayload = getURLParam(location.href, IFRAME_PSICASH_PARAM);
    if (!urlPayload) {
      // We cannot proceed.
      log('PsiCash: No req params URL param.');
      return null;
    }

    urlReqParams = JSON.parse(urlPayload);

    // At least distinguisher _must_ be set.
    if (!urlReqParams.distinguisher) {
      log('PsiCash: URL req params distinguisher missing.');
      return null;
    }

    var localPayload;
    var localPayloadKey = LOCALSTORAGE_KEY_PREFIX + IFRAME_PSICASH_PARAM;
    if (window.localStorage) {
      localPayload = localStorage.getItem(localPayloadKey);
    }

    if (localPayload) {
      try {
        localReqParams = JSON.parse(localPayload);
      }
      catch (error) {}
    }

    // We prefer the contents of urlReqParams over localReqParams, but some fields might
    // be overridden.
    finalReqParams = urlReqParams;

    // If the URL tokenPriority is 0, then we should use the local tokens, if available.
    if (!finalReqParams.tokensPriority // tests for undefined, null, and 0
        && localReqParams && localReqParams.tokens) {
      finalReqParams.tokens = localReqParams.tokens;
    }

    // Ensure tokens are present at this point.
    if (!finalReqParams.tokens) {
      log('PsiCash: no tokens in req params.');
      return null;
    }

    // Side-effect: Store the finalReqParams locally.
    if (window.localStorage) {
      // Note that this also persists the distinguisher, even though it won't be used in
      // any following request. We could clear the field (or use a new structure), but
      // it's not worth it.
      localStorage.setItem(localPayloadKey, JSON.stringify(finalReqParams));
    }

    return finalReqParams;
  }

  /**
   * Splits the given URL into components that can be accessed with `result.hash`, etc.
   * @param {string} url
   * @returns {HTMLAnchorElement}
   */
  function urlComponents(url) {
    var parser = document.createElement('a');
    parser.href = url;
    return parser;
  }

  /**
   * Get the param value for the given name from the URL hash or query. Returns null if not found.
   * @param {string} url
   * @param {string} name
   * @returns {?string}
   */
  function getURLParam(url, name) {
    var urlComp = urlComponents(url);

    var paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

    var reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
    var re = new RegExp(reString);

    for (var i = 0; i < paramLocations.length; i++) {
      var match = re.exec(paramLocations[i]);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  }

  function log() {
    if (window.console) {
      window.console.log(Array.prototype.slice.call(arguments));
    }
  }

  /**
   * Checks if the given distinguisher is valid for the referring page.
   * @param {!string} distinguisher
   * @returns {boolean}
   */
  function validateDistinguisher(distinguisher) {
    // Distinguishers don't use scheme, so strip it off.
    var parent = new RegExp('https?://(.+)').exec(document.referrer)[1];
    return parent.indexOf(distinguisher) === 0;
  }

  /**
   * Check if the reward transaction is allowed for this page yet.
   * @param {!string} distinguisher
   * @returns {boolean}
   */
  function isRewardAllowed(distinguisher) {
    if (!window.localStorage) {
      // Can't check, so just allow.
      return true;
    }

    var storageKey = LOCALSTORAGE_KEY_PREFIX + NEXTALLOWED_KEY + '::' + distinguisher;
    var nextAllowedString = localStorage.getItem(storageKey);
    if (!nextAllowedString) {
      return true;
    }

    var nextAllowed = new Date(nextAllowedString);
    if (!nextAllowed) {
      return true;
    }

    var now = new Date();

    var allowedNow = nextAllowed.getTime() < now.getTime();
    if (!allowedNow) {
      log('PsiCash: Reward not yet allowed; next allowed = ' + nextAllowed);
    }

    return allowedNow;
  }

  // Global retry counter
  var requestRetryCount = 0;

  /**
   * Make a page-view reward request for the current distinguisher.
   * @param {!ReqParams} reqParams
   */
  function makePageViewRewardRequest(reqParams) {
    // We need the request metadata to exist to record the attempt count.
    if (!reqParams.metadata) {
      reqParams.metadata = {};
    }

    // Increment the attempt count.
    reqParams.metadata.attempt = reqParams.metadata.attempt ? reqParams.metadata.attempt+1 : 1;

    var reqURL = PSICASH_TRANSACTION_URL;
    reqURL += '?class=page-view&distinguisher=' + encodeURIComponent(reqParams.distinguisher);

    var xhr = new(window.XMLHttpRequest || window.ActiveXObject)('MSXML2.XMLHTTP.3.0');
    xhr.open('POST', reqURL, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.setRequestHeader('X-PsiCash-Auth', reqParams.tokens);
    xhr.setRequestHeader('X-PsiCash-Metadata', JSON.stringify(reqParams.metadata));

    requestRetryCount += 1;
    var delay = Math.min(1 * 60 * 60 * 1000, Math.pow(3, requestRetryCount) * 1000);

    xhr.onload = function() {
      if (xhr.status >= 500) {
        // Retry with capped back-off
        log('PsiCash: request failed with 500; retrying in ' + delay + 'ms');
        setTimeout(function () { makePageViewRewardRequest(reqParams); }, delay);
      }

      if (xhr.status === 200) {
        log('PsiCash: Successful page view reward for ' + reqParams.distinguisher);

        // Store the NextAllowed datetime in the response to limit our future attempts.
        var response = JSON.parse(xhr.responseText);
        var nextAllowed = response &&
                            response.TransactionResponse &&
                            response.TransactionResponse.Values &&
                            response.TransactionResponse.Values.NextAllowed;
        if (nextAllowed && window.localStorage) {
          var storageKey = LOCALSTORAGE_KEY_PREFIX + NEXTALLOWED_KEY + '::' + reqParams.distinguisher;
          localStorage.setItem(storageKey, nextAllowed);
        }

        // Also inform the parent landing page that it can store the NextAllowed time.
        // This is necessary because Safari doesn't persist localStorage in iframes.
        if (nextAllowed && window.parent && window.parent.postMessage) {
          var urlComp = urlComponents(document.referrer);
          var parentOrigin = urlComp.protocol + '//' + urlComp.hostname; // Note that urlComp.origin is not widely supported and in IE urlComp.host includes the port.
          var msg = {};
          msg[NEXTALLOWED_KEY] = nextAllowed;
          window.parent.postMessage(msg, parentOrigin);
        }
      }

      log(xhr.status, xhr.statusText, xhr.responseText);
    };

    xhr.onerror = function () {
      // Retry with capped back-off
      log('PsiCash: request error; retrying in ' + delay + 'ms');
      setTimeout(function () { makePageViewRewardRequest(reqParams); }, delay);
    };

    xhr.send(null);
  }

  // Do the work.
  (function () {
    var reqParams = getIframeReqParams();
    if (!reqParams) {
      // Can't continue with the earning request.
      return;
    }

    if (!validateDistinguisher(reqParams.distinguisher)) {
      // Can't continue with the earning request.
      log('PsiCash: Distinguisher invalid for landing page: ' + reqParams.distinguisher);
      return;
    }

    if (!isRewardAllowed(reqParams.distinguisher)) {
      // The check will log details.
      return;
    }

    // We're okay to make the request.
    makePageViewRewardRequest(reqParams);
  })();

})();

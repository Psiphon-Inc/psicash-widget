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
   * The hash param key for passing the tokens to the iframe.
   * @const {string}
   */
  var IFRAME_TOKENS_PARAM = 'tokens';
  /**
   * The hash param key for passing the priority of the tokens into the iframe.
   * The priority will be 0 for low and 1 for high. High priority tokens come from the
   * landing page URL (which come from the app) and supersede any stored tokens.
   * See https://github.com/Psiphon-Inc/psiphon-issues/issues/432 for more details.
   * @const {string}
   */
  var IFRAME_TOKENS_PRIORITY_PARAM = 'priority';
  /**
   * The hash param key for passing the distinguisher to the iframe.
   * @const {string}
   */
  var IFRAME_DISTINGUISHER_PARAM = 'distinguisher';

  /**
   * The NewTransaction API server endpoint, including version number.
   * @const {string}
   */
  var PSICASH_TRANSACTION_URL = 'https://api.psi.cash/v1/transaction';

  /**
   * Prefix added to the everything stored in localStorage.
   * @const {string}
   */
  var LOCALSTORAGE_KEY_PREFIX = 'PsiCash::';
  /**
   * Key used to store the next-allowed value in localStorage and pass it back to the
   * landing page script.
   * @const {string}
   */
  var NEXTALLOWED_KEY = 'nextAllowed';

  /**
   * Get the tokens we should use for the reward transaction.
   * Returns null if no tokens are available.
   * REFACTOR NOTE: This is not identical to getTokens() in psicash.js.
   * @returns {?string}
   */
  function getIframeTokens() {
    // We'll look in the URL and in localStorage for tokens. Which we use will depend on
    // the priority of the URL tokens.

    var urlTokens = getParam(location.href, IFRAME_TOKENS_PARAM);
    var urlPriority = Number(getParam(location.href, IFRAME_TOKENS_PRIORITY_PARAM) || 0);

    var localTokens;
    var tokensKey = LOCALSTORAGE_KEY_PREFIX + IFRAME_TOKENS_PARAM;
    if (window.localStorage) {
      localTokens = localStorage.getItem(tokensKey);
    }

    var tokensToUse = null;

    if (urlTokens && urlPriority > 0) {
      tokensToUse = urlTokens;
    }
    else if (localTokens) {
      tokensToUse = localTokens;
    }
    else if (urlTokens) {
      tokensToUse = urlTokens;
    }

    // Side-effect: Store the paramTokens locally, if available.
    if (tokensToUse && tokensToUse != localTokens && window.localStorage) {
      localStorage.setItem(tokensKey, tokensToUse);
    }

    return tokensToUse;
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
  function getParam(url, name) {
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
   * @param {string} distinguisher
   * @returns {boolean}
   */
  function validateDistinguisher(distinguisher) {
    // Distinguishers don't use scheme, so strip it off.
    var parent = new RegExp('https?://(.+)').exec(document.referrer)[1];
    return parent.indexOf(distinguisher) === 0;
  }

  /**
   * Check if the reward transaction is allowed for this page yet.
   * @param {string} distinguisher
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
   * @param {string} tokens
   * @param {string} distinguisher
   */
  function makePageViewRewardRequest(tokens, distinguisher) {
    var reqURL = PSICASH_TRANSACTION_URL;
    reqURL += '?class=page-view&distinguisher=' + distinguisher;

    var xhr = new(window.XMLHttpRequest || window.ActiveXObject)('MSXML2.XMLHTTP.3.0');
    xhr.open('POST', reqURL, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.setRequestHeader('X-PsiCash-Auth', tokens);

    requestRetryCount += 1;
    var delay = Math.min(1 * 60 * 60 * 1000, Math.pow(3, requestRetryCount) * 1000);

    xhr.onload = function() {
      if (xhr.status === 500) {
        // Retry with capped back-off
        log('PsiCash: request failed with 500; retrying in ' + delay + 'ms');
        setTimeout(function () { makePageViewRewardRequest(tokens, distinguisher); }, delay);
      }

      if (xhr.status === 200) {
        log('PsiCash: Success');

        // Store the NextAllowed datetime in the response to limit our future attempts.
        var response = JSON.parse(xhr.responseText);
        var nextAllowed = response &&
                            response.TransactionResponse &&
                            response.TransactionResponse.Values &&
                            response.TransactionResponse.Values.NextAllowed;
        if (nextAllowed && window.localStorage) {
          var storageKey = LOCALSTORAGE_KEY_PREFIX + NEXTALLOWED_KEY + '::' + distinguisher;
          localStorage.setItem(storageKey, nextAllowed);
        }

        // Also inform the parent landing page that it can store the NextAllowed time.
        // This is necessary because Safari doesn't persist localStorage in iframes.
        if (nextAllowed && window.parent && window.parent.postMessage) {
          var urlComp = urlComponents(document.referrer);
          var parentOrigin = urlComp.protocol + '//' + urlComp.host; // Note that urlComp.origin is not widely supported.
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
      setTimeout(function () { makePageViewRewardRequest(tokens, distinguisher); }, delay);
    };

    xhr.send(null);
  }

  // Do the work.
  (function () {
    var tokens = getIframeTokens();
    if (!tokens) {
      // Can't continue with the earning request.
      log('PsiCash: No tokens found.');
      return;
    }

    var distinguisher = getParam(location.href, IFRAME_DISTINGUISHER_PARAM);
    if (!distinguisher) {
      // Can't continue with the earning request.
      log('PsiCash: No distinguisher found.');
      return;
    }

    if (!validateDistinguisher(distinguisher)) {
      // Can't continue with the earning request.
      log('PsiCash: Distinguisher invalid for landing page: ' + distinguisher);
      return;
    }

    if (!isRewardAllowed(distinguisher)) {
      // The check will log details.
      return;
    }

    // We're okay to make the request.
    makePageViewRewardRequest(tokens, distinguisher);
  })();

})();

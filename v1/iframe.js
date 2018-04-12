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

  var TOKENS_PARAM = 'psicash';
  var DISTINGUISHER_PARAM = 'distinguisher';

  var PSICASH_SERVER_SCHEME = 'https';
  var PSICASH_SERVER_HOSTNAME = 'api.psi.cash';
  var PSICASH_API_VERSION = 'v1';

  var NEXTALLOWED_LOCALSTORAGE_KEY_PREFIX = 'NextAllowed::';

  /**
   * Get the tokens we should use for the reward transaction.
   */
  function getTokens() {
    var paramTokens = getParam(location.href, TOKENS_PARAM);

    var localTokens;
    if (window.localStorage) {
      localTokens = localStorage.getItem(TOKENS_PARAM);

      // Side-effect: Store the paramTokens locally, if available.
      if (paramTokens) {
        localStorage.setItem(TOKENS_PARAM, paramTokens);
      }
    }

    return paramTokens || localTokens;
  }

  // Splits the given URL into components that can be accessed with `result.hash`, etc.
  function urlComponents(url) {
    var parser = document.createElement('a');
    parser.href = url;
    return parser;
  }

  // Get the param value for the given name from the URL hash or query. Returns null if not found.
  // TODO: Is it okay to look in both places in all cases?
  function getParam(url, name) {
    var urlComp = urlComponents(url);

    var paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

    var reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
    var re = new RegExp(reString);

    for (var i = 0; i < paramLocations.length; i++) {
      var match = re.exec(paramLocations[i]);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function log() {
    if (window.console) {
      window.console.log(Array.prototype.slice.call(arguments));
    }
  }

  // Checks if the given distinguisher is valid for the referring page.
  function validateDistinguisher(distinguisher) {
    // Distinguishers don't use scheme, so strip it off.
    var parent = new RegExp('https?://(.+)').exec(document.referrer)[1];
    return parent.indexOf(distinguisher) === 0;
  }

  // Check if the reward transaction is allowed for this page yet.
  function isRewardAllowed(distinguisher) {
    if (!window.localStorage) {
      // Can't check, so just allow.
      return true;
    }

    var storageKey = NEXTALLOWED_LOCALSTORAGE_KEY_PREFIX + distinguisher;
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

  // Make a page-view reward request for the current distinguisher.
  function makePageViewRewardRequest(tokens, distinguisher) {
    var reqURL = PSICASH_SERVER_SCHEME + '://' + PSICASH_SERVER_HOSTNAME +
      '/' + PSICASH_API_VERSION + '/transaction';
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
          var storageKey = NEXTALLOWED_LOCALSTORAGE_KEY_PREFIX + distinguisher;
          localStorage.setItem(storageKey, nextAllowed);
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
    var tokens = getTokens();
    if (!tokens) {
      // Can't continue with the earning request.
      log('PsiCash: No tokens found.');
      return;
    }

    var distinguisher = getParam(location.href, DISTINGUISHER_PARAM);
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

(function () {
  'use strict';

  var TOKENS_PARAM = 'tokens';
  var DISTINGUISHER_PARAM = 'distinguisher';

  var PSICASH_SERVER_SCHEME = 'http'; // TODO: update
  var PSICASH_SERVER_HOSTNAME = 'localhost:51337'; // TODO: update

  var NEXTALLOWED_LOCALSTORAGE_KEY_PREFIX = 'NextAllowed::';

  // Get the tokens we should use for the reward transaction.
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
    var reqURL = PSICASH_SERVER_SCHEME + '://' + PSICASH_SERVER_HOSTNAME + '/transaction';
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

    if (isRewardAllowed(distinguisher)) {
      makePageViewRewardRequest(tokens, distinguisher);
    }
  })();

})();

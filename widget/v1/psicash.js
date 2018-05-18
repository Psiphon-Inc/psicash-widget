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
   * The query or hash param key for tokens passed by the app into the landing page.
   * The reason the value of this isn't "tokens" is to minimize confict with other page params.
   * @const {string}
   */
  var URL_TOKENS_PARAM = 'psicash';

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
   * The URL of the widget iframe.
   * @const {string}
   */
  var IFRAME_URL = 'https://widget.psi.cash/v1/iframe.html';

  /**
   * Prefix added to the everything stored in localStorage (to prevent conflicts with page stuff.)
   * @const {string}
   */
  var PSICASH_LOCALSTORAGE_KEY_PREFIX = 'PsiCash::';

  /**
   * Class that stores info about the available tokens.
   * @param {string} tokens
   * @param {number} priority
   */
  function TokensInfo(tokens, priority) {
    this.tokens = tokens;
    this.priority = priority;
  }

  /**
   * Loads the widget iframe into the page.
   * @param {?TokensInfo} tokensInfo
   * @param {string} distinguisher
   */
  function loadIframe(tokensInfo, distinguisher) {
    var iframeSrc = IFRAME_URL + '#' + IFRAME_DISTINGUISHER_PARAM + '=' + distinguisher;
    if (tokensInfo) {
      iframeSrc += '&' + IFRAME_TOKENS_PARAM + '=' + tokensInfo.tokens;
      iframeSrc += '&' + IFRAME_TOKENS_PRIORITY_PARAM + '=' + tokensInfo.priority;
    }

    var iframe = document.createElement('iframe');
    iframe.src = iframeSrc;

    // Make invisible.
    iframe.style.cssText = 'width:0;height:0;border:0;border:none;position:absolute;';

    document.body.appendChild(iframe);
  }

  /**
   * Get the src from the current script's tag. This can be used for retrieving params.
   * @returns {string}
   */
  function getCurrentScriptURL() {
    var thisScript = document.currentScript || document.querySelector('script[src*="psicash.js"]');

    // Give TS error: "Property 'src' does not exist on type 'HTMLScriptElement | SVGScriptElement'."
    // But we know it's the former (which has a src) and not the latter.
    // @ts-ignore
    return thisScript.src;
  }

  /**
   * Get the tokens we should use for the reward transaction.
   * Return null if no tokens are available.
   * @returns {?TokensInfo}
   */
  function getTokens() {
    // We'll look in the URL and in localStorage for tokens, but we'll prefer
    // the former, because it's where tokens will get updated when they change.

    var paramTokens = getParam(location.href, URL_TOKENS_PARAM);

    var localTokens;
    if (window.localStorage) {
      var tokensKey = PSICASH_LOCALSTORAGE_KEY_PREFIX + URL_TOKENS_PARAM;
      localTokens = localStorage.getItem(tokensKey);

      // Side-effect: Store the paramTokens locally, if available.
      if (paramTokens) {
        localStorage.setItem(tokensKey, paramTokens);
      }
    }

    if (paramTokens) {
      return new TokensInfo(paramTokens, 1);
    }
    else if (localTokens) {
      return new TokensInfo(localTokens, 0);
    }
    return null;
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
   * Get the param value for the given name from the URL hash or query.
   * Returns null if not found.
   * @param {string} url
   * @param {string} name
   * @returns {?string}
   */
  function getParam(url, name) {
    var urlComp = urlComponents(url);
    var paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

    var reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
    var re = new RegExp(reString);

    var match;
    for (var i = 0; i < paramLocations.length; i++) {
      match = re.exec(paramLocations[i]);
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

  // Do the work.
  (function() {
    var distinguisher = getParam(getCurrentScriptURL(), IFRAME_DISTINGUISHER_PARAM);
    // If there's no distinguisher, we can't proceed, as it's necessary for a
    // page-view reward attempt. This case suggests a bug with the page's script tag.
    if (!distinguisher) {
      log('PsiCash: Failed to find distinguisher');
      return;
    }

    var tokensInfo = getTokens();
    // If there are no tokens, we can still load the widget, as it might have
    // locally-stored tokens that can be used. This situation suggests that the
    // user is visiting the landing page directly, rather than it being opened by the app.

    loadIframe(tokensInfo, distinguisher);
  })();

})();
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
   * The query or hash param key for tokens, metadata, etc. passed by the app into the
   * landing page.
   * @const {string}
   */
  var URL_PSICASH_PARAM = 'psicash';

  /**
   * The query or hash param key used in the widget script tag to pass in an explicit
   * distinguisher (vs implicitly using the hostname).
   * @const {string}
   */
  var WIDGET_DISTINGUISHER_PARAM = 'distinguisher';

  /**
   * The hash param key for passing the tokens, metadata, etc. to the iframe.
   * @const {string}
   */
  var IFRAME_PSICASH_PARAM = 'psicash';
  /**
   * The widget (and iframe) origin.
   * @const {string}
   */
  var WIDGET_ORIGIN = 'https://widget.psi.cash'; // PROD
  //var WIDGET_ORIGIN = 'https://dev-widget.psi.cash'; // DEV
  /**
   * The URL of the widget iframe.
   * @const {string}
   */
  //var IFRAME_URL = WIDGET_ORIGIN + '/v1/iframe.html';
  var IFRAME_URL = WIDGET_ORIGIN + '/v1/iframe.debug.a1.html'; // DEBUG

  /**
   * Prefix added to the everything stored in localStorage (to prevent conflicts with page stuff.)
   * @const {string}
   */
  var LOCALSTORAGE_KEY_PREFIX = 'PsiCash::';
  /**
   * Key used in the message from the iframe and used to store the next-allowed value in
   * localStorage (prefixed).
   * @const {string}
   */
  var NEXTALLOWED_KEY = 'nextAllowed';

  /**
   * Loads the widget iframe into the page.
   * @param {!ReqParams} reqParams
   */
  function loadIframe(reqParams) {
    var reqParamsString = encodeURIComponent(JSON.stringify(reqParams));
    var iframeSrc = IFRAME_URL + '#' + IFRAME_PSICASH_PARAM + '=' + reqParamsString;

    var iframe = document.createElement('iframe');
    iframe.src = iframeSrc;

    // Make invisible.
    //iframe.style.cssText = 'width:0;height:0;border:0;border:none;position:absolute;';
    iframe.style.cssText = 'width:400px;height:400px;'; // DEBUG

    document.body.appendChild(iframe);
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

  /**
   * Does necessary processing on a message received from the iframe.
   * (I.e., store the next-allowed reward time.)
   * @param {string} distinguisher
   * @param {object} eventData
   */
  function processIframeMessage(distinguisher, eventData) {
    if (eventData && eventData[NEXTALLOWED_KEY] && window.localStorage) {
      // Store the next-allowed time so we can check it next time.
      localStorage.setItem(
        LOCALSTORAGE_KEY_PREFIX + NEXTALLOWED_KEY + '::' + distinguisher,
        eventData[NEXTALLOWED_KEY]);
    }
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
   * NOTE: Not all ReqParams may be filled in. For example, if there are no req params, we
   * can still load the widget, as it might have locally-stored tokens that can be used.
   * This situation suggests that the user is visiting the landing page directly, rather
   * than it being opened by the app.
   * @param {!string} distinguisher
   * @returns {!ReqParams}
   */
  function getReqParams(distinguisher) {
    // We'll look in the URL and in localStorage for the payload, but we'll prefer
    // the URL, because it's where tokens will get updated when they change.
    // They params payload is transferred as URL-encoded JSON.

    var urlPayload = getURLParam(location.href, URL_PSICASH_PARAM);

    /** @type {string} */
    var localPayload;
    if (window.localStorage) {
      var localPayloadKey = LOCALSTORAGE_KEY_PREFIX + URL_PSICASH_PARAM;
      localPayload = localStorage.getItem(localPayloadKey);

      // Side-effect: Store the urlPayload locally, if available.
      // We're not going to parse first, and just store the JSON string.
      if (urlPayload && urlPayload != localPayload) {
        localStorage.setItem(localPayloadKey, urlPayload);
      }
    }

    var jsonPayload = urlPayload ? urlPayload : localPayload;
    var tokensPriority = urlPayload ? 1 : 0;

    return makeReqParams(jsonPayload, tokensPriority, distinguisher);
  }

  /**
   * Creates (or hydrates) ReqInfo object.
   * @param {?string} jsonPayload
   * @param {!number} tokensPriority
   * @param {!string} distinguisher
   * @returns {!ReqParams}
   */
  function makeReqParams(jsonPayload, tokensPriority, distinguisher) {
    /** type ReqParams */
    var reqParams;

    if (jsonPayload) {
      try {
        reqParams = JSON.parse(jsonPayload);
      }
      catch {
        // Old-style payload, with just the tokens. We'll construct a partial object.
        reqParams = {
          tokens: jsonPayload,
          metadata: null
        };
      }
    }
    else {
      // We can proceed with no payload, as the iframe might have stored the tokens.
      reqParams = {
        tokens: null,
        metadata: null
      };
    }

    reqParams.tokensPriority = tokensPriority;
    reqParams.distinguisher = distinguisher;

    return reqParams;
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
  function getURLParam(url, name) {
    var urlComp = urlComponents(url);
    var paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

    var reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
    var re = new RegExp(reString);

    var match;
    for (var i = 0; i < paramLocations.length; i++) {
      match = re.exec(paramLocations[i]);
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

  // Do the work.
  (function() {
    var distinguisher = getURLParam(getCurrentScriptURL(), WIDGET_DISTINGUISHER_PARAM);
    if (!distinguisher) {
      // If there's no explicit distinguisher in the script tag, then we'll use the
      // current hostname as the distinguisher. This will work fine for sites that don't
      // use per-page rewards.
      distinguisher = urlComponents(location.href).host;
    }

    if (!isRewardAllowed(distinguisher)) {
      return;
    }

    var reqParams = getReqParams(distinguisher);

    loadIframe(reqParams);

    // The iframe script will inform us when the next allowed reward is.
    window.addEventListener('message', function(event) {
      // Make sure that only the widget iframe can communicate with us.
      if (event.origin !== WIDGET_ORIGIN) {
        return;
      }

      processIframeMessage(distinguisher, event.data);
    }, false);
  })();

})();

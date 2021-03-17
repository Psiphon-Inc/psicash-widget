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

import * as consts from './consts.js';
import * as utils from './utils.js';

/**
 * The query or hash param key for tokens, metadata, etc. passed by the app into the
 * landing page, and the page script into the iframe.
 * @const {string}
 */
export const PSICASH_URL_PARAM = 'psicash';

export const DEBUG_URL_PARAM = 'debug';
export const DEV_URL_PARAM = 'dev';

/**
 * PsiCashParams captures the intial configuration state of the widget. It is shared
 * between the page and iframe.
 */
export class PsiCashParams {
  constructor(timestamp, tokens, metadata, dev, debug) {
    /**
     * Timestamp of when the package was created; used to prioritize which tokens should be used.
     * This will be undefined for params from older clients or stored previously.
     * @type {string}
     */
    this.timestamp = timestamp;
    /** @type {string} */
    this.tokens = tokens;
    /**
     * This is information that is included in requests to the PsiCash server, provided by
     * the app.
     * @type {Object}
     */
    this.metadata = metadata;
    /** @type {any} */
    this.dev = dev;
    /** @type {any} */
    this.debug = debug;
  }

  /**
   * Create a new PsiCashParams instance from obj. Returns null if obj is falsy.
   * @param {?Object} obj
   */
  static fromObject(obj) {
    if (!obj) {
      return null;
    }

    const { timestamp, tokens, metadata, dev, debug } = obj;
    return new PsiCashParams(timestamp, tokens, metadata, dev, debug);
  }

  /**
   * Create a new PsiCashParams instance from an encoded payload string.
   * Returns null if `payloadStr` is falsy, a parse error occurs, or the timestamp is unacceptable.
   * @param {String} payloadStr
   */
  static fromURLPayload(payloadStr) {
    if (!payloadStr) {
      return null;
    }

    // The params payload is transferred as URL-encoded JSON (possibly base64).
    try {
      payloadStr = window.atob(payloadStr);
    }
    catch (error) {
      // Do nothing -- not base64
    }

    let payloadObj;
    try {
      payloadObj = JSON.parse(payloadStr);
    }
    catch (error) {
      // Don't let this just throw. We want this function to return in a controlled
      // manner, in case there are checks to be done higher up the stack.
      utils.log('PsiCashParams.fromURLPayload: JSON.parse failed', error);
      return null;
    }

    const urlParams =  PsiCashParams.fromObject(payloadObj);
    if (!urlParams) {
      utils.log('PsiCashParams.fromURLPayload: fromObject returned null');
      return null;
    }

    // Older clients don't include a timestamp in the params, but if there is one present
    // we have to make sure it's valid. To prevent stored-tokens-poisoning attacks
    // (https://github.com/Psiphon-Inc/psiphon-issues/issues/555), we don't want to accept
    // any URL params that have a timestamp too far in the past (because it should have
    // just been generated, not a link in an email or something), nor in the future (we
    // don't want bad tokens to get stored forever and never be flushed out by good
    // tokens).
    if (urlParams.timestamp) {
      const nowTimestamp = new Date().getTime();
      const urlTimestamp = Date.parse(urlParams.timestamp);
      if (isNaN(urlTimestamp)) {
        utils.log('PsiCashParams.fromURLPayload: URL params timestamp cannot be parsed');
        return null;
      }
      if (urlTimestamp > nowTimestamp) {
        utils.log('PsiCashParams.fromURLPayload: URL params timestamp is in the future');
        return null;
      }

      // We need to give enough time for the app to send the URL to the browser (fast),
      // the browser to load the page and start processing JS (slow), and the page to send
      // load the iframe (slow-ish). If we don't give enough time for that, then the user
      // can't do anything with their tokens. But if we leave _too much_ time, then an
      // attacker has too big a window to poison a user's tokens.
      if ((nowTimestamp - urlTimestamp) > 60000) {
        utils.log('PsiCashParams.fromURLPayload: URL params timestamp is too old');
        return null;
      }
    }

    return urlParams;
  }

  /**
   * Returns the base64-encoded JSON of this object.
   * @returns {!String}
   */
  encode() {
    return window.btoa(JSON.stringify(this));
  }

  /**
   * Checks if the properties of cmp are equal to this object's.
   * @param {PsiCashParams} cmp
   * @returns {boolean}
   */
  equal(cmp) {
    return JSON.stringify(this) === JSON.stringify(cmp);
  }

  /**
   * Compares `urlParams` and `localParams` and returns the object that has the newest tokens.
   * Comparing timestamps is preferred, otherwise `urlParams` takes priority (as it's
   * more likely to be new than the locally-stored params).
   * Note that the value of `params.tokens` is _not_ checked; null tokens are treated the same as non-null.
   * Returns null if both are null.
   * @param {?PsiCashParams} urlParams
   * @param {?PsiCashParams} localParams
   * @returns {?PsiCashParams}
   */
  static newest(urlParams, localParams) {
    if (!urlParams || !localParams) {
      // May return null
      return urlParams || localParams;
    }
    else if (!urlParams.timestamp || !localParams.timestamp) {
      // Prefer localParams only if it has a timestamp and urlParams doesn't.
      return localParams.timestamp ? localParams : urlParams;
    }

    return (urlParams.timestamp > localParams.timestamp) ? urlParams : localParams;
  }
}

/**
 * Defines the structure of messages passed/posted between the page and iframe scripts.
 */
export class Message {
  /**
   * Constructs a Message.
   * @param {string} type
   * @param {number} timeout
   * @param {any} payload
   * @param {string} error
   * @param {boolean} success
   * @param {string} detail
   */
  constructor(type, timeout=null, payload=null, error=null, success=true, detail='') {
    /** @type {string} */
    this.id = String(Math.random());
    /** @type {string} */
    this.type = type;
    /**
     * The amount of time allowed for an action. May not be applicable to all messages.
     * @type {number}
     */
    this.timeout = timeout;
    /** @type {any} */
    this.payload = payload;

    /**
     * If this is set, an unrecoverable error has occurred.
     * @type {string}
     * */
    this.error = error;

    /**
     * Valid only in the iframe->page direction. Indicates if a requested action was successful.
     * @type {boolean}
     */
    this.success = success;

    /**
     * Additional detail about the success or failure of message processing.
     * @type {string}
     */
    this.detail = detail;
  }

  /**
   * Set the success information. Detail is optional; if not supplied, `this.detail` will
   * not be modified.
   * @param {boolean} success
   * @param {?string} detail Optional
   */
  setSuccess(success, detail=undefined) {
    this.success = success;
    if (typeof detail !== 'undefined') {
      this.detail = detail;
    }
  }

  /**
   * Create a Message object from the object in a JSON string.
   * @param {string} jsonString
   * @returns {?Message} Returns null if jsonString is null or empty.
   */
  static fromJSON(jsonString) {
    if (!jsonString) {
      return null;
    }
    let j = JSON.parse(jsonString);
    let m = new Message(j.type, j.timeout, j.payload, j.error, j.success, j.detail);
    // The JSON will have its own id
    m.id = j.id;
    return m;
  }
}

/**
 * Possible values for the action argument of psicash().
 * @enum {string}
 * @readonly
 */
export const PsiCashAction = {
  Init: 'init',
  PageView: 'page-view',
  ClickThrough: 'click-through'
};

/**
 * Check if the given action name is valid -- that is, present in PsiCashAction.
 * @param {string} action Possibly value action name
 * @returns {boolean}
 */
export function PsiCashActionValid(action) {
  return Object.values(PsiCashAction).indexOf(action) >= 0;
}

/**
 * Get the default timeout for each action.
 * @param {PsiCashAction} action
 * @returns {number} Milliseconds
 */
export function PsiCashActionDefaultTimeout(action) {
  switch (action) {
  case PsiCashAction.Init:
    return 10000;
  case PsiCashAction.PageView:
    return 10000;
  case PsiCashAction.ClickThrough:
    // This is typically going to block the next page from loading, so we don't want it to take too long.
    return 1000;
  }
  return 2000;
}

/**
 * Callback for when an iframe message is done being processed.
 * @callback PsiCashServerRequestCallback
 * @param {Object} result
 * @param {?string} result.error Null if no error, otherwise has error message
 * @param {number} result.status Like 200, 401, etc. (but not 5xx -- that will just populate `error`)
 * @param {string} result.body The body of the response
 */

/**
 * @param {Object} config Configuration for the request
 * @param {!PsiCashServerRequestCallback} config.callback
 * @param {!PsiCashParams} config.psicashParams
 * @param {number} config.timeout Milliseconds; if falsy, a default will be used
 * @param {!string} config.path Like `/transaction`
 * @param {!string} config.method Like `GET`, `POST`, etc.
 * @param {!string} config.queryParams In `a=b&c=d` form
 */
export function makePsiCashServerRequest(config) {
  return makePsiCashServerRequestHelper(config);
}

function makePsiCashServerRequestHelper(config, start=Date.now(), attempt=1, lastError=null) {
  // We're going to interpret "no timeout" as 100s.
  config.timeout = config.timeout || 100000;
  const remainingTime = config.timeout - (Date.now() - start);

  function recurse() {
    if (remainingTime < 0) {
      // We failed all of our attempts and ran out of time.
      const cbResult = {
        error: lastError || 'timed out'
      };
      config.callback(cbResult);
      return;
    }

    // Wait 100ms and try again.
    setTimeout(() => makePsiCashServerRequestHelper(config, start, attempt+1, lastError), 100);
  }

  // We're going to be modifying this object as we make request attempts, so clone it.
  config.psicashParams = JSON.parse(JSON.stringify(config.psicashParams));

  // We need the request metadata to exist to record the attempt count.
  if (!config.psicashParams.metadata) {
    config.psicashParams.metadata = {};
  }
  config.psicashParams.metadata.attempt = attempt;

  // For logging and debugging purposes, record the referrer in the metadata, but _not_
  // with any potentially-identifying query params or hash.
  const pageOrigin = utils.getOrigin(utils.urlComponents(document.referrer));
  config.psicashParams.metadata.referrer = pageOrigin + utils.urlComponents(document.referrer).pathname;

  const psicashAPIPrefix = config.psicashParams.dev ? consts.PSICASH_API_PREFIX_DEV : consts.PSICASH_API_PREFIX;
  let reqURL = `${psicashAPIPrefix}${config.path}`;
  if (config.queryParams) {
    reqURL += `?${config.queryParams}`;
  }

  let xhr = new(window.XMLHttpRequest || window.ActiveXObject)('MSXML2.XMLHTTP.3.0');
  xhr.timeout = remainingTime;
  xhr.open(config.method, reqURL, true);
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  xhr.setRequestHeader('X-PsiCash-Auth', config.psicashParams.tokens);
  xhr.setRequestHeader('X-PsiCash-Metadata', JSON.stringify(config.psicashParams.metadata));

  xhr.onload = function xhrOnLoad() {
    utils.log(xhr.status, xhr.statusText, xhr.responseText, `dev-env:${!!config.psicashParams.dev}`);

    if (xhr.status >= 500) {
      // Retry
      utils.log(`Request to '${config.path}' failed with 500; retrying`, `dev-env:${!!config.psicashParams.dev}`);
      lastError = `server error ${xhr.status}`;
      return recurse();
    }

    utils.log(`Request to '${config.path}' completed with ${xhr.status}`, `dev-env:${!!config.psicashParams.dev}`);

    const cbResult = {
      status: xhr.status,
      body: xhr.responseText
    };
    config.callback(cbResult);
  };

  xhr.onerror = function xhrOnError() {
    // Retry
    utils.log(`Request to '${config.path}' error; retrying`, `dev-env:${!!config.psicashParams.dev}`);
    lastError = 'request error';
    return recurse();
  };

  xhr.ontimeout = function xhrOnTimeout() {
    // Retry
    utils.log(`Request to '${config.path}' timeout`, `dev-env:${!!config.psicashParams.dev}`);
    lastError = 'request timeout';
    return recurse();
  };

  xhr.send(null);
}

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
  constructor(tokens, tokensPriority, metadata, dev, debug) {
    /** @type {string} */
    this.tokens = tokens;
    /**
     * Will be 0 for low and 1 for high. High priority
     *   tokens come from the landing page URL (which come from the app) and supersede any
     *   stored tokens.
     *   See https://github.com/Psiphon-Inc/psiphon-issues/issues/432 for more details.
     * @type {number}
     */
    this.tokensPriority = tokensPriority;
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
   * Create a new PsiCashParams instance from obj.
   * @param {Object} obj
   */
  static fromObject(obj) {
    if (!obj) {
      return null;
    }

    let {tokens, tokensPriority, metadata, dev, debug} = obj;
    return new PsiCashParams(tokens, tokensPriority, metadata, dev, debug);
  }

  /**
   * Checks if the properties of cmp are equal to this object's.
   * @param {PsiCashParams} cmp
   * @returns {boolean}
   */
  equal(cmp) {
    return JSON.stringify(this) === JSON.stringify(cmp);
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
   * @param {Object} storage
   * @param {string} error
   * @param {boolean} success
   * @param {string} detail
   */
  constructor(type, timeout=null, payload=null, storage=null, error=null, success=true, detail='') {
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
    /** @type {Object} */
    this.storage = storage;

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
    let m = new Message(j.type, j.timeout, j.payload, j.storage, j.error, j.success, j.detail);
    // The JSON will have its own id
    m.id = j.id;
    return m;
  }
}

/**
 * Prefix added to the everything stored in localStorage (to prevent conflicts with other page stuff.)
 * @const {string}
 */
const LOCALSTORAGE_KEY_PREFIX = 'PsiCash::v2::';
const LOCALSTORAGE_KEY_PREFIX_DEV = 'PsiCash-Dev::v2::';

/**
 * Storage key for getting/settings PsiCashParams.
 * @const {string}
 */
export const PARAMS_STORAGE_KEY = 'PsiCashParams';

/**
 * Construct a localStorage key based on the given suffix.
 * @param {string} keySuffix The unique part of the key. Will be appended to the prefix.
 * @param {any} dev Truthy value indicating if the widget is currently talking to a dev server.
 * @returns {string}
 */
function localStorageKey(keySuffix, dev) {
  const keyPrefix = dev ? LOCALSTORAGE_KEY_PREFIX_DEV : LOCALSTORAGE_KEY_PREFIX;
  if (keySuffix.indexOf(keyPrefix) !== 0) {
    keySuffix = keyPrefix + keySuffix;
  }

  return keySuffix;
}

let localStorageOKLogged = false;
/**
 * Check if we can use localStorage. This is commonly the case when privacy-enchanced
 * browsers (Brave, or Chrome with certain settings) deny access to it from iframes.
 * @returns {boolean}
 */
function localStorageOK() {
  try {
    if (!window.localStorage) {
      if (!localStorageOKLogged) {
        log('window.localStorage unavailable');
        localStorageOKLogged = true;
      }
      return false;
    }
  }
  catch (e) {
    // Attempting to access window.localStorage may throw an exception. See:
    // https://www.chromium.org/for-testers/bug-reporting-guidelines/uncaught-securityerror-failed-to-read-the-localstorage-property-from-window-access-is-denied-for-this-document
    if (!localStorageOKLogged) {
      log('window.localStorage inaccessible: ' + e);
      localStorageOKLogged = true;
    }
    return false;
  }
  return true;
}

/**
 * Retrieve data from local storage.
 * @param {!string} key
 * @param {any} dev Truthy, indicates if this is using PsiCash-Dev rather than Prod.
 * @returns {?any} null if the key wasn't set (or if null was stored).
 */
export function storageGet(key, dev) {
  if (!localStorageOK()) {
    return null;
  }

  key = localStorageKey(key, dev);

  let val = window.localStorage.getItem(key);
  if (typeof val === 'string') {
    val = JSON.parse(val);
  }
  return val;
}

/**
 * Sets val into local storage at key.
 * @param {!string} key
 * @param {any} val
 * @param {any} dev Truthy, indicates if this is using PsiCash-Dev rather than Prod.
 */
export function storageSet(key, val, dev) {
  if (!localStorageOK()) {
    return;
  }

  key = localStorageKey(key, dev);

  window.localStorage.setItem(key, JSON.stringify(val));
}

/**
 * Merges the keys of obj into localstorage, selectively overwriting according to preferObj.
 * @param {Object} obj
 * @param {boolean} preferObj If true, will always overwrite.
 * @param {any} dev Truthy, indicates if this is using PsiCash-Dev rather than Prod.
 */
export function storageMerge(obj, preferObj, dev) {
  for (let k of Object.keys(obj)) {
    if (!preferObj && storageGet(k, dev)) {
      // There's already a locally-stored item with this key
      continue;
    }

    storageSet(k, obj[k], dev);
  }
}

/**
 * Logs arguments to console.
 * Just a wrapper for console.log to prevenst trying to use it if it doesn't exist.
 */
export function log() {
  let argsArray = Array.prototype.slice.call(arguments);
  argsArray.unshift('PsiCash:');
  if (window.console) {
    window.console.log.apply(null, argsArray);
  }
}

/**
 * Logs an error to console.
 * Just a wrapper for console.error to prevents trying to use it if it doesn't exist.
 */
export function error() {
  let argsArray = Array.prototype.slice.call(arguments);
  argsArray.unshift('PsiCash:');
  if (window.console) {
    let logger = window.console.error || window.console.log;
    logger.apply(null, argsArray);
  }
}

/**
 * Splits the given URL into components that can be accessed with `result.hash`, etc.
 * @param {string} url
 * @returns {HTMLAnchorElement}
 */
export function urlComponents(url) {
  const parser = document.createElement('a');
  parser.href = url;
  return parser;
}

/**
 * Get the host string from urlComp in a way that is consistent across platforms.
 * @param {!HTMLAnchorElement} urlComp
 * @returns {!string}
 */
export function getHost(urlComp) {
  // IE puts the port on urlComp.host, while Chrome only puts it there for
  // non-standard ports. We want the Chrome behaviour.
  if (String(urlComp.port) !== '' && String(urlComp.port) !== '80' && String(urlComp.port) !== '443') {
    return urlComp.hostname + ':' + urlComp.port;
  }
  else {
    return urlComp.hostname;
  }
}

/**
 * Get the origin string from urlComp in a way that is consistent across platforms.
 * @param {!HTMLAnchorElement} urlComp
 * @returns {!string}
 */
export function getOrigin(urlComp) {
  // urlComp.origin is not widely supported.
  return urlComp.protocol + '//' + getHost(urlComp);
}

/**
 * Get the param value for the given name from the URL hash or query.
 * Returns null if not found.
 * @param {string} url
 * @param {string} name
 * @returns {?string}
 */
export function getURLParam(url, name) {
  const urlComp = urlComponents(url);

  // urlComp.search is like "?psicash=etc"
  const qp = urlComp.search.slice(1);
  // urlComp.hash is like "#psicash=etc" or "#!psicash=etc"
  let hash = urlComp.hash.slice(1);
  if (hash.slice(0, 1) === '!') {
    hash = hash.slice(1);
  }

  const paramLocations = [hash, qp];

  const reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
  const re = new RegExp(reString);

  let match;
  for (let i = 0; i < paramLocations.length; i++) {
    match = re.exec(paramLocations[i]);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Get the src from the current script's tag. This can be used for retrieving params.
 * @returns {string}
 */
export function getCurrentScriptURL() {
  const thisScript = document.currentScript || document.querySelector('script[src*="psicash.js"]');

  // Give TS error: "Property 'src' does not exist on type 'HTMLScriptElement | SVGScriptElement'."
  // But we know it's the former (which has a src) and not the latter.
  // @ts-ignore
  return thisScript.src;
}

/**
 * Check if the code is in the widget iframe (vs the widget page code).
 * @returns {boolean}
 */
export function inWidgetIframe() {
  // We're not going to do an inIFrame() check because it returns an incorrect result
  // during Cypress testing, and because it doesn't add any extra important info to the check.

  const scriptURLComp = urlComponents(getCurrentScriptURL());
  const pageURLComp = urlComponents(location.href);
  return getHost(scriptURLComp) === getHost(pageURLComp);
}

/**
 * Check if the current script is running in an iframe.
 * From: https://stackoverflow.com/a/326076
 * @returns {boolean}
 */
export function inIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
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
    return 1000;
  }
  return 2000;
}
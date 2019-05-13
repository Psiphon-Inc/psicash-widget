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

export class PsiCashParams {
  constructor(tokens, tokensPriority, metadata, widgetOrigin, pageURL, dev, debug) {
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
    /** @type {Object} */
    this.metadata = metadata;
    /** @type {string} */
    this.widgetOrigin = widgetOrigin;
    /** @type {string} */
    this.pageURL = pageURL;
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

    let {tokens, tokensPriority, metadata, widgetOrigin, pageURL, dev, debug} = obj;
    return new PsiCashParams(tokens, tokensPriority, metadata, widgetOrigin, pageURL, dev, debug);
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

export class Message {
  constructor(type, payload, storage) {
    /** @type {string} */
    this.id = String(Math.random());
    /** @type {string} */
    this.type = type;
    /** @type {any} */
    this.payload = payload;
    /** @type {Object} */
    this.storage = storage;
  }

  static fromJSON(jsonString) {
    if (!jsonString) {
      return null;
    }
    let j = JSON.parse(jsonString);
    let m = new Message(j.type, j.payload, j.storage);
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

export const PARAMS_STORAGE_KEY = 'PsiCashParams';

function localStorageKey(keySuffix, dev) {
  const keyPrefix = dev ? LOCALSTORAGE_KEY_PREFIX_DEV : LOCALSTORAGE_KEY_PREFIX;
  if (keySuffix.indexOf(keyPrefix) !== 0) {
    keySuffix = keyPrefix + keySuffix;
  }

  return keySuffix;
}

/**
 * Retrieve data from local storage.
 * @param {!string} key
 * @param {any} dev Truthy, indicates if this is using PsiCash-Dev rather than Prod.
 * @returns {?any} null if the key wasn't set (or if null was stored).
 */
export function storageGet(key, dev) {
  if (!window.localStorage) {
    // The widget probably isn't going to function, but we'll try to behave gracefully
    log('window.localStorage unavailable');
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
  if (!window.localStorage) {
    // The widget probably isn't going to function, but we'll try to behave gracefully
    log('window.localStorage unavailable');
    return null;
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
 * Just a wrapper for console.log to prevent trying to use it if it doesn't exist.
 */
export function log() {
  let argsArray = Array.prototype.slice.call(arguments);
  argsArray.unshift('PsiCash:');
  if (window.console) {
    window.console.log.apply(null, argsArray);
  }
}

/**
 * Logs a message and throws an exception.
 * All arguments are used in the message.
 */
export function error() {
  let argsArray = Array.prototype.slice.call(arguments);
  argsArray.unshift('Error:');
  log.apply(null, argsArray);
  throw new Error(argsArray.join(' '));
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
  const paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

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
  const scriptURLComp = urlComponents(getCurrentScriptURL());
  const pageURLComp = urlComponents(location.href);
  return getHost(scriptURLComp) === getHost(pageURLComp);
}

/**
 * Possible values for the action argument of psicash().
 * @enum {string}
 * @readonly
 */
export const PsiCashAction = {
  PageView: 'page-view',
  ClickThrough: 'click-through'
};

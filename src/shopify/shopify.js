/*
 * Copyright (c) 2021, Psiphon Inc.
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

/* eslint-env jquery */

import * as consts from '../consts.js';
import * as utils from '../utils.js';
import * as common from '../common.js';

/**
 * The CSS (jQuery) selector for the product add-to-cart form. May need to be changed
 * depending on the theme.
 */
const PRODUCT_FORM_SELECTOR = 'form[action="/cart/add"]';

/**
 * Get the parameters (tokens, metadata, etc.) that should be passed to the PsiCash server
 * for the reward transactions. The value returned from this function is not guaranteed to
 * have valid tokens and should be validated.
 * @returns {!common.PsiCashParams}
 */
function getPsiCashParams() {
  const scriptURL = utils.getCurrentScriptURL();

  // The URL for this script may have dev and/or debug flags
  const urlDebug = utils.getURLParam(scriptURL, common.DEBUG_URL_PARAM);
  const urlDev = utils.getURLParam(scriptURL, common.DEV_URL_PARAM);

  // We'll look in the URL and in localStorage for the payload, preferring the one with
  // the newest tokens.
  // Even though we require that this site be loaded with params in the URL, there's no
  // guarantee that the params are the newest -- they could be from a stale tab -- so we
  // have to also consider localStorage (like we do with the widget).

  const urlPayload = utils.getURLParam(location.href, common.PSICASH_URL_PARAM);
  const urlPsiCashParams = common.PsiCashParams.fromURLPayload(urlPayload);

  // Figure out if we should be looking in dev or prod storage for stored params
  const useDevStorage =  (urlDev !== null && urlDev) || (urlPsiCashParams && urlPsiCashParams.dev);
  const localPayload = utils.storageGet(consts.PARAMS_STORAGE_KEY, useDevStorage);
  const localPsiCashParams = common.PsiCashParams.fromObject(localPayload);

  const finalPsiCashParams = common.PsiCashParams.newest(urlPsiCashParams, localPsiCashParams) || new common.PsiCashParams();

  if (urlDebug !== null) {
    finalPsiCashParams.debug = urlDebug;
  }
  if (urlDev !== null) {
    finalPsiCashParams.dev = urlDev;
  }

  // Side-effect: Store the params locally, if available and different.
  if (!finalPsiCashParams.equal(localPsiCashParams)) {
    utils.storageSet(consts.PARAMS_STORAGE_KEY, finalPsiCashParams, useDevStorage);
  }

  return finalPsiCashParams;
}

/**
 * Callback passed to validatePsiCashParams.
 * @callback ValidatePsiCashParamsCallback
 * @param {?string} error Null if no error, otherwise has error message. And error means
 *    the validation attempt (not that the tokens are invalid) and could be retried.
 * @param {?boolean} valid Whether or not the tokens are valid (null if error)
 */

/**
 * Validate the tokens in the given `psicashParams` with the PsiCash server.
 * @param {common.PsiCashParams} psicashParams Contains the tokens to validate
 * @param {ValidatePsiCashParamsCallback} callback Will be called when complete.
 */
function validatePsiCashParams(psicashParams, callback) {
  if (!psicashParams.tokens) {
    // Make the response async
    setTimeout(() => callback(null, false), 1);
    return;
  }

  common.makePsiCashServerRequest({
    psicashParams: psicashParams,
    timeout: 10000,
    path: '/validate-tokens',
    method: 'GET',
    queryParams: null,
    callback: function reqCallback(result) {
      if (result.error) {
        // We failed all of our attempts and ran out of time.
        callback(result.error, null);
        return;
      }
      else if (result.status === 200) {
        const response = JSON.parse(result.body);
        for (const token in response.TokensValid) {
          if (!response.TokensValid.hasOwnProperty(token)) {
            continue;
          }

          // We are leveraging the knowledge that we are only given one token by the app:
          // the earner token. So as long as one token is valid, we are good to proceed.
          if (response.TokensValid[token]) {
            callback(null, true);
            return;
          }
        }

        // The token we checked is _not_ valid.
        callback(null, false);
        return;
      }

      // We got a status we didn't expect; treat it as a rejection
      callback(null, false);
    }
  });
}

/**
 * Modify all links to other pages on our website to contain psicashParams.
 * See the comments in pageInitialize() for why we do this.
 * @param {!string} ourOrigin The origin of the current website
 * @param {!common.PsiCashParams} psicashParams
 */
function addPsiCashParamsToLinks(ourOrigin, psicashParams) {
  // Note: We are only processing `<a>` elements. modifyLink will filter for this, while
  // other code will look for anything with an `href` property. This is a tiny bit
  // inefficient, but allows us to have a single point of deciding.

  const modifyLink = function(elem) {
    if (!elem || elem.nodeName.toLowerCase() !== 'a') {
      // Sanity check to make sure we have a valid link (anchor) element
      return;
    }

    if (elem.href.indexOf(`${common.PSICASH_URL_PARAM}=`) >= 0) {
      // Make sure we don't change an already modified link
      return;
    }

    let linkURL = utils.urlComponents(elem.href);
    const linkOrigin = utils.getOrigin(linkURL);
    if (linkOrigin !== ourOrigin) {
      // Only modify internal links
      return;
    }

    if (!linkURL.hash) {
      linkURL.hash = `!${common.PSICASH_URL_PARAM}=${psicashParams.encode()}`;
    }
    else {
      if (linkURL.search) {
        linkURL.search += '&';
      }
      linkURL.search = `${common.PSICASH_URL_PARAM}=${psicashParams.encode()}`;
    }

    elem.href = linkURL.href;
  };

  // Modify links already present in the page
  const links = document.querySelectorAll('[href]');
  for (let i = 0; i < links.length; i++) {
    modifyLink(links[i]);
  }

  // Watch for changes to the page to make sure we modify any new or updated links
  const mutationObserver = new MutationObserver(function mutationObserverCallback(mutationsList, observer) {
    for (let i = 0; i < mutationsList.length; i++) {
      const mutation = mutationsList[i];
      if (mutation.type === 'childList') {
        // Note that an added node might include a whole subtree (including links) -- we
        // don't get separate elements in the addedNodes list for each subtree member.
        // So we need to look at the nodes themself, and any children they might have.
        for (let j = 0; j < mutation.addedNodes.length; j++) {
          const addedNode = mutation.addedNodes[j];
          if (addedNode.nodeType !== Node.ELEMENT_NODE) {
            continue;
          }

          // addedNode is of type Node, so we're checking for (and using) Element
          // properties by string to avoid linter warnings. (This looks dirty but is okay.)
          if (addedNode['href']) {
            modifyLink(addedNode);
          }

          if (addedNode['querySelectorAll']) {
            const addedNodeChildLinks = addedNode['querySelectorAll']('[href]');
            for (let k = 0; k < addedNodeChildLinks.length; k++) {
              modifyLink(addedNodeChildLinks[k]);
            }
          }
        }
      }
      else if (mutation.type === 'attributes') {
        modifyLink(mutation.target);
      }
    }
  });
  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributeFilter: ['href']
  });
}

/**
 * Set the PsiCash user data (tokens, etc.) into the product form. This enables them to
 * pass through to the PsiCash server via the Shopify webhook.
 * @param {!common.PsiCashParams} psicashParams
 */
function addPsiCashParamsToProduct(psicashParams) {
  const productForms = document.querySelectorAll(PRODUCT_FORM_SELECTOR);
  for (let i = 0; i < productForms.length; i++) {
    const inputElem = document.createElement('input');
    inputElem.type = 'hidden';
    inputElem.name = 'properties[_psicash]';
    inputElem.value = psicashParams.encode();

    productForms[i].appendChild(inputElem);
  }
}

/**
 * Show an message that blocks the page (and is not dismissable).
 * If this is not an error message (i.e., it's our "validating tokens" message), we will
 * delay a little before showing the message.
 * @param {boolean} error Whether the message is an error or a non-error status
 * @param {string} msg The text of the message
 * @returns {HTMLElement} The HTML element created. Can be removed with `.remove()`.
 */
function showBlockingMessage(error, msg) {
  const outer = document.createElement('div');
  outer.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,0.8);height:100%;width:100%;z-index:999;overflow:hidden;';

  const inner = document.createElement('div');
  inner.style.cssText = 'background:#FFF;padding:30px;text-align:center;top:45%;position:relative;font-size:30px;font-weight:bold;';
  inner.style.color = error ? '#9c0000' : '#000';
  inner.style.boxShadow = `0 0 15px ${inner.style.color}`;
  inner.textContent = msg;

  if (!error) {
    // Delay showing the message. Hopefully we finish our background activity and clear
    // the message before it needs to shown. Note that we're still putting up the overlay
    // to block the page, but with opacity of zero, so it's fully transparent. If we
    // didn't put it up at all, we'd run the risk that the user could take page actions
    // that we don't want before we've validated their tokens.
    const initialOpacity = outer.style.opacity;
    outer.style.opacity = '0';
    setTimeout(() => {
      // We can do this unconditionally. If outer.remove() has been called, then it won't
      // be displayed.
      outer.style.opacity = initialOpacity;
    }, 500);
  }

  outer.appendChild(inner);
  document.body.appendChild(outer);

  return outer;
}

// Do the work.
(function pageInitialize() {
  // Disallow iframing of this site
  if (utils.inIframe()) {
    // This is not a benign state and we won't try to handle it gracefully.
    // We must not proceed if it occurs.
    throw new Error('The site must not be put in an iframe');
  }

  // If this page is being arrived at from anywhere but another page on this site, we have
  // additional restrictions to check.
  // For details: https://github.com/Psiphon-Inc/psiphon-issues/issues/702#issuecomment-786842326
  const ourOrigin = utils.getOrigin(utils.urlComponents(location.href)); // this is more widely supported than location.origin
  const referrerOrigin = document.referrer && utils.getOrigin(utils.urlComponents(document.referrer));
  if (referrerOrigin !== ourOrigin) {
    // This site must be launched directly from our app, so we require the referrer to be empty.
    // This helps prevent token poisoning.
    // (This check can be circumvented by browser settings, etc., but we should still check it.)
    if (referrerOrigin) {
      showBlockingMessage(true, 'This site must be launched directly from the Psiphon app.');
      throw new Error(`PsiCash: Bad referrer; must be empty or "${ourOrigin}"; got "${referrerOrigin}"`);
    }

    // The URL must contain the `psicash=` parameter. This also helps us ensure that this
    // site is opened via the app, and with the freshest possible tokens. It also helps
    // prevent using poisoned stored tokens.
    const urlParams = common.PsiCashParams.fromURLPayload(utils.getURLParam(location.href, common.PSICASH_URL_PARAM));
    if (!urlParams) {
      // Either the URL param is missing, or the couldn't be parsed.
      showBlockingMessage(true, 'This site must be launched directly from the Psiphon app.');
      throw new Error(`PsiCash: If referrer isn't "${ourOrigin}" then params must be in URL; got referrer "${referrerOrigin}" but URL params are bad.`);
    }
  }

  const psicashParams = getPsiCashParams();
  const validationWaitElem = showBlockingMessage(false, 'Validating your PsiCash tokens. Please wait...');
  validatePsiCashParams(psicashParams, function validatePsiCashParamsCallback(error, valid) {
    validationWaitElem.remove();

    if (error) {
      // Note that this is _not_ that the tokens are invalid, but that we failed to make
      // the request to the server. So reloading to retry is the best course of action.
      showBlockingMessage(true, 'Failed to validate PsiCash tokens. Please reload this page.');
      throw new Error(`PsiCash: validatePsiCashParams returned error: ${error}`);
    }
    else if (!valid) {
      // Our tokens are bad or missing.
      // Nullify any invalid tokens we may have stored.
      psicashParams.tokens = null;
      utils.storageSet(consts.PARAMS_STORAGE_KEY, psicashParams, psicashParams.dev);

      showBlockingMessage(true, 'PsiCash tokens are not valid. Reopen this site from the Psiphon app.');
      throw new Error('PsiCash: Tokens are not valid');
    }

    // We're okay to proceed
    addPsiCashParamsToLinks(ourOrigin, psicashParams);
    addPsiCashParamsToProduct(psicashParams);
  });
})();

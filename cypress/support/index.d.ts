/// <reference types="cypress" />

declare namespace Cypress {
  interface Chainable<Subject> {
    /**
     * Like the default `visit()`, but guarantees the page will be reloaded (which the
     * default doesn't do for hash changes).
     */
   psivisit(url: string): Chainable<JQuery<E>>

    /**
     * Clear localStorage of the page and/or the iframe.
     * NOTE: This loads a fresh page, but this page will load with whatever storage was
     * initially present, so a `psivisit()` should still be used after clearing.
     * @param page If true, the page's localStorage will be cleared
     * @param iframe If true, the iframe's localStorage will be cleared
     */
    clearLocalStorage(page: boolean, iframe: boolean): Chainable<JQuery<E>>

    /**
     * Retrieve the contents of the iframe's localStorage.
     * @returns {object}
     */
    getIframeLocalStorage(): Chainable<JQuery<E>>

    /**
     * Make and test a PsiAction action request. Expect success.
     * @param action Name of the PsiCash action type; like 'init', 'page-view', 'click-through'
     * @param options Options to be passed to the request
     * @param require200 If true, the response must be 200; otherwise 429 is allowed
     */
    psiTestRequestSuccess(action: string, options?: object, require200?: boolean): Chainable<JQuery<E>>

    /**
     * Make and test a PsiAction action request. Expect failure.
     * @param action Name of the PsiCash action type; like 'init', 'page-view', 'click-through'
     * @param expectedError The error message that is expected to result; may be null
     * @param expectedDetail The detail message that is expected to result; optional
     * @param options Options to be passed to the request; optional
     */
    psiTestRequestFailure(action: string, expectedError: string, expectedDetail?: string, options?: object): Chainable<JQuery<E>>
  }
}
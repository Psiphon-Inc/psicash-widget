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
     */
    clearLocalStorage(page: boolean, iframe: boolean): Chainable<JQuery<E>>
  }
}
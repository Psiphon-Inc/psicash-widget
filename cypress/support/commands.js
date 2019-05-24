/// <reference types="Cypress" />

import * as helpers from '../support/helpers';

// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This is will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

// SEE INDEX.D.TS FOR FUNCTION COMMENTS/DOCUMENTATION

// The built-in visit() won't load a page if it differs only by hash. But we want hard
// reloads every time, we're simulating different visits.
Cypress.Commands.add('psivisit', (url) => {
  cy.log(`psivisit; url:${url}`);

  if (url.indexOf('#') < 0) {
    // There's no hash in URL, so no special handling necessary
    cy.visit(url);
    return;
  }

  // Because our tests all use the same page, assume that the presence of a hash means
  // we need to force the reload.
  cy.visit(url).reload();
});

Cypress.Commands.add('clearLocalStorage', (page, iframe) => {
  cy.log(`clearLocalStorage; page:${page}, iframe:${iframe}`);
  cy.psivisit(helpers.url()).get('#init-done').should('have.text', 'DONE').window().then(win => {
    return new Cypress.Promise((resolve, reject) => {
      win._psicash.clearLocalStorage(page, iframe, () => {
        resolve();
      });
    });
  });
});

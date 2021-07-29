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

  // Because our tests all use the same page, assume that the presence of a hash means
  // we need to force the reload.
  if (url.indexOf('#') < 0) {
    // There's no hash in URL, so no special handling necessary
    cy.visit(url);
    return;
  }

  // We'll force a hard navigation by first going to a nonexistent page, then to the
  // actual URL.
  cy.visit('/psivisit-nonexistent', {failOnStatusCode: false}).visit(url);
});

Cypress.Commands.add('clearLocalStorage', (page, iframe) => {
  cy.log(`clearLocalStorage; page:${page}, iframe:${iframe}`);
  cy.psivisit(helpers.url()).window().then(win => {
    return new Cypress.Promise((resolve, reject) => {
      win.psicash('init', (err, success, detail) => { // TODO: put in a const somewhere (deduplicate with the const in the spec)
        // We don't care what the 'init' response is, just that it finished
        win._psicash.clearLocalStorage(page, iframe, () => {
          resolve();
        });
      });
    });
  });
});

Cypress.Commands.add('getIframeLocalStorage', (loadPage=true) => {
  cy.log('getIframeLocalStorage');
  // Future: We might already have a page loaded, so consider not always doing this
  if (loadPage) {
    cy.psivisit(helpers.url()).window().then(win => {
      return new Cypress.Promise((resolve, reject) => {
        win.psicash('init', (err, success, detail) => { // TODO: put in a const somewhere (deduplicate with the const in the spec)
          // We don't care what the 'init' response is, just that it finished
          win._psicash.getIframeLocalStorage((error, success, detail) => {
            resolve(JSON.parse(detail));
          });
        });
      });
    });
  }
  else {
    cy.window().then(win => {
      return new Cypress.Promise((resolve, reject) => {
        win.psicash('init', (err, success, detail) => { // TODO: put in a const somewhere (deduplicate with the const in the spec)
          // We don't care what the 'init' response is, just that it finished
          win._psicash.getIframeLocalStorage((error, success, detail) => {
            resolve(JSON.parse(detail));
          });
        });
      });
    });
  }
});

Cypress.Commands.add('psiTestRequestSuccess', (action, options=undefined, require200=false) => {
  cy.log('psiTestRequestSuccess', action, options, require200);

  cy.window().then(win => {
    return new Cypress.Promise((resolve, reject) => {
      win.psicash(action, options, (err, success, detail) => {
        cy.log('psiTestRequestSuccess result', err, success, detail);

        expect(err).to.be.null;
        if (require200) {
          expect(success).to.be.true;
          if (action !== 'init') { // TODO: put in a const somewhere (deduplicate with the const in the spec)
            expect(detail).to.equal('200');
          } // otherwise init, which has no `detail`
        }
        else {
          if (action !== 'init') { // TODO: put in a const somewhere (deduplicate with the const in the spec)
            expect(detail).to.be.oneOf(['200', '429']);
          } // otherwise init, which has no `detail`
        }

        resolve();
      });
    });
  });
});

Cypress.Commands.add('psiTestRequestFailure', (action, expectedError, expectedDetail=null, options=undefined) => {
  cy.log(`psiTestRequestFailure: action=${action}; expectedError=${expectedError}; options=${options}`);

  cy.window().then(win => {
    return new Cypress.Promise((resolve, reject) => {
      win.psicash(action, options, (err, success, detail) => {
        console.log(`psiTestRequestFailure result: action=${action}; err=${err}; success=${success}; detail=${detail}`);
        cy.log(`psiTestRequestFailure result: action=${action}; err=${err}; success=${success}; detail=${detail}`);
        expect(success).to.be.false;
        if (expectedError) {
          expect(err).to.include(expectedError);
        }
        if (expectedDetail) {
          expect(detail).to.include(expectedDetail);
        }
        resolve();
      });
    });
  });
});

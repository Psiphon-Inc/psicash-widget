/// <reference types="Cypress" />
/// <reference types="../support" />

import * as helpers from '../support/helpers';

/*
NOTES
- We're not going to be checking for success, since we'll be hitting the rate limit on
  most of the test. The very last test will sleep and then do a want-success test.
*/

const initAction = 'init';
const transActions = ['page-view', 'click-through'];
const allActions = [initAction].concat(transActions);

before(function() {
  cy.fixture('params').as('psicashParams');
});

describe('no params (error)', function() {
  before(function() {
    // This is also sort of a test for the clearing function, so we're going to load some params first
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, false)).get('#init-done').should('have.text', 'DONE');
    // Clear the iframe's localStorage to get rid of params/tokens
    cy.clearLocalStorage(true, true);
    cy.psivisit(helpers.url()).get('#init-done').should('have.text', 'DONE');
  });

  it('successfully loads', function() {
    // beforeEach loaded page
  });

  it('has init error', function() {
    cy.get('#init-error').should('contain', 'no tokens');
  });

  it('gives errors for transaction attempts', function() {
    cy.get('#page-view-error').should('contain', 'no tokens');
    cy.get('#click-through-error').should('contain', 'no tokens');
  });

  it('gives errors for direct JS calls', function() {
    cy.get('#init-done').should('have.text', 'DONE')
    cy.window().then(win => {
      return Cypress.Promise.all(allActions.map(action => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.contain('no tokens');
            resolve();
          });
        });
      }));
    });
  });
});

describe('raw params (not base64)', function() {
  before(function() {
    // Clear the iframe's localStorage to get rid of params/tokens
    cy.clearLocalStorage(true, true);
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, false)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });
});

describe('base64 hashbang params', function() {
  before(function() {
    // Clear the iframe's localStorage to get rid of params/tokens
    cy.clearLocalStorage(true, true);
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });

  it('should succeed for direct JS calls', function() {
    cy.window().then(win => {
      return Cypress.Promise.all(allActions.map(action => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      }));
    });
  });
});

describe('base64 hash params', function() {
  before(function() {
    // Clear the iframe's localStorage to get rid of params/tokens
    cy.clearLocalStorage(true, true);
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASH, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });
});

describe('base64 query params', function() {
  before(function() {
    // Clear the iframe's localStorage to get rid of params/tokens
    cy.clearLocalStorage(true, true);
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.QUERY, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });
});

describe('no iframe storage (like Safari)', function() {
  before(function() {
    // Load params into storage
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
    // Clear iframe storage.
    cy.clearLocalStorage(false, true);
    cy.psivisit(helpers.url()).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });

  it('should succeed for direct JS calls', function() {
    cy.window().then(win => {
      return Cypress.Promise.all(allActions.map(action => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      }));
    });
  });
});

describe('no page storage (like direct visit to new landing page)', function() {
  before(function() {
    // Load params into storage
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
    // Clear iframe storage.
    cy.clearLocalStorage(true, false);
    cy.psivisit(helpers.url()).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {

    // We're not going to check for "success" for these, as they may get 429, which is still fine.
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#click-through-error').should('have.text', '(none)');
  });

  it('should succeed for direct JS calls', function() {
    cy.window().then(win => {
      return Cypress.Promise.all(allActions.map(action => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      }));
    });
  });
});

describe('actual success (after wait)', function() {
  before(function() {
    cy.clearLocalStorage(true, true);

    // Wait for a full minute, so that our requests will succeed
    cy.log('Waiting for one minute, to ensure success').wait(61000);
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, false)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions', function() {
    cy.get('#page-view-error').should('have.text', '(none)');
    cy.get('#page-view-success').should('have.text', 'true');

    cy.get('#click-through-error').should('have.text', '(none)');
    cy.get('#click-through-success').should('have.text', 'true');
  });
});
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
const LONG_ENOUGH_WAIT = 10000; // depends on the earning timeout for the page

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
      return Cypress.Promise.map(allActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.contain('no tokens');
            resolve();
          });
        });
      });
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
      return Cypress.Promise.map(allActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      });
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
      return Cypress.Promise.map(allActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      });
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
      return Cypress.Promise.map(allActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success) {
            expect(err).to.be.null;
            resolve();
          });
        });
      });
    });
  });
});

describe('forced action timeouts', function() {
  before(function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, true)).get('#init-done').should('have.text', 'DONE');
  });

  it('should timeout', function() {
    // Sleep so that we don't hit a local 'not yet allowed' check that might return
    // quicker than our timeout.
    cy.log('Waiting for one minute, to ensure success').wait(LONG_ENOUGH_WAIT);
    cy.window().then(win => {
      // We're not going to include 'init' in this test, as it will already have completed.
      return Cypress.Promise.map(transActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          // Force a very short timeout
          win.psicash(action, {timeout: 1}, function(err, success, detail) {
            expect(err).to.be.null;
            expect(success).to.be.false;
            expect(detail).to.eq('timeout');
            resolve();
          });
        });
      });
    });
  });
});

describe('distinguisher mismatch', function() {
  before(function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, false)).get('#init-done').should('have.text', 'DONE');
  });

  it('should disallow a bad distinguisher', function() {
    cy.window().then(win => {
      // We're not going to include 'init' in this test, as it will already have completed.
      return Cypress.Promise.map(transActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, {distinguisher: 'mismatch.com/nope'}, function(err, success, detail) {
            expect(err).to.be.not.null;
            resolve();
          });
        });
      });
    });

  });
});

describe('actual success (after wait)', function() {
  before(function() {
    cy.clearLocalStorage(true, true);

    // Wait for a full minute, so that our requests will succeed
    cy.log('Waiting for one minute, to ensure success').wait(LONG_ENOUGH_WAIT);
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

// When we make successful page-view and click-through attempts at the same time, one of
// them will fail with a 500 from the server (because DB). Then a client-side retry will
// happen and succeed.
describe('actual success via JS calls (after wait) -- forced retries', function() {
  before(function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, false)).get('#init-done').should('have.text', 'DONE');
  });

  it('should init successfully', function() {
    cy.get('#init-error').should('have.text', '(none)');
    cy.get('#init-success').should('have.text', 'true');
  });

  it('should succeed for transactions (cannot actually check for retries)', function() {
    // Wait for a full minute, so that our requests will succeed
    cy.log('Waiting for one minute, to ensure success').wait(LONG_ENOUGH_WAIT);

    cy.window().then(win => {
      // We're not going to include 'init' in this test, as it will already have completed.
      return Cypress.Promise.map(transActions, (action) => {
        return new Cypress.Promise((resolve, reject) => {
          win.psicash(action, function(err, success, detail) {
            expect(err).to.be.null;
            expect(success).to.be.true;
            resolve();
          });
        });
      });
    });
  });
});
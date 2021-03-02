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
const LONG_ENOUGH_WAIT = 1000; // depends on the earning timeout for the page

before(function() {
  cy.fixture('params').as('psicashParams');
});

beforeEach(function() {
  // Clear the iframe's localStorage to get rid of params/tokens
  cy.clearLocalStorage(true, true);
});

// We can't do anything if there are no tokens
describe('no params (error)', function() {
  it('should fail', function() {
    cy.psivisit(helpers.url());

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestFailure(action, 'no tokens');
    });
  });
});

// Params that are not base64 encoded should work fine (backwards compatibility)
describe('raw params (not base64)', function() {
  it('should succeed', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams, true, false));

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });
  });
});

// The current standard form is to put our params in the hash, starting with an exclamation: `#!psicash=...`
describe('base64 hashbang params', function() {
  it('should succeed', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });
  });
});

// For backwards compatilbility, we also support the params in the hash without the exclamation
describe('base64 hash params', function() {
  it('should succeed', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASH, this.psicashParams));

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });
  });
});

// If the hash is already in use, we put the params into the query
describe('base64 query params', function() {
  it('should succeed', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.QUERY, this.psicashParams));

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });
  });
});

// Some browsers do no persist storage in 3rd party iframes (like ours). Our params will
// still be persisted in the page storage, though, and will be supplied to the iframe even
// if there are no params in the URL.
describe('no iframe storage (like Safari)', function() {
  it('should succeed', function() {
    // Load params into storage
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));
    // Clear iframe storage.
    cy.clearLocalStorage(false, true);
    // Visit with no params/tokens in URL
    cy.psivisit(helpers.url());

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });
  });
});

// If the iframe has stored params and a landing page is visited directly for the first
// time (so no page-stored params) with no URL parameters, then the iframe-stored params
// should be used successfully.
describe('no page storage (like direct visit to new landing page)', function() {
  it('should succeed', function() {
    // Load params into storage
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams))
    // Clear page storage.
    cy.clearLocalStorage(true, false);
    // Visit with no params/tokens in URL
    cy.psivisit(helpers.url());

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action);
    });

  });
});

// Widget actions can be given an optional timeout value, which should be respected.
describe('forced action timeouts', function() {
  it('should timeout', function() {
    // Sleep so that we don't hit a local 'not yet allowed' check that might return
    // quicker than our timeout.
    cy.log('Waiting for a while, to ensure success').wait(LONG_ENOUGH_WAIT);

    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    it('should succeed', function() {
      cy.wrap(allActions).each((action) => {
        cy.psiTestRequestFailure(action, 'timeout', null, {timeout: 1});
      });
    });
  });
});

// The distinguisher passed to an earning request must be consistent with the domain+path
// of the actual page we're requesting from.
describe('distinguisher mismatch', function() {
  it('should disallow a bad distinguisher', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.wrap(transActions).each((action) => {
      cy.psiTestRequestFailure(action, 'distinguisher is invalid', null, {distinguisher: 'mismatch.com/nope'});
    });
  });
});

// Ensure that we get 200 OK responses from our requests (rather than allowing 429).
describe('actual 200 OK (after wait)', function() {
  it('should succeed', function() {
    // Sleep long enough to ensure 200 success
    cy.log('Waiting for a while, to ensure success').wait(LONG_ENOUGH_WAIT);

    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.wrap(allActions).each((action) => {
      cy.psiTestRequestSuccess(action, null, /*require200=*/true);
    });
  });
});

// Ensure that we get 200 OK responses from our requests (rather than allowing 429).
describe('local nextAllowed limiting', function() {
  it('should prevent a second attempt without a page reload', function() {
    // Sleep long enough to ensure 200 success, to populate nextAllowed
    cy.log('Waiting for a while, to ensure success').wait(LONG_ENOUGH_WAIT);

    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    // First one succeeds
    cy.psiTestRequestSuccess(transActions[0], null, /*require200=*/true);

    cy.psiTestRequestFailure(transActions[0], null, 'not yet allowed');
  });
});

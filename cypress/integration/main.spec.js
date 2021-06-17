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
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));
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

  it('should disallow a bad path', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.wrap(transActions).each((action) => {
      cy.psiTestRequestFailure(action, 'distinguisher is invalid', null, {distinguisher: 'localhost:33333/nope'});
    });
  });

  it('should allow just the hostname', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.wrap(transActions).each((action) => {
      const baseURLHost = Cypress.config().baseUrl.match(/^https?:\/\/([^/]+)/)[1];

      cy.psiTestRequestSuccess(action, {distinguisher: baseURLHost});
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

// We will get a 401 response when our tokens are expired or logged-out
describe('401 response', function() {
  it('should nullify iframe local tokens', function() {
    // Supply bad params/token to the page
    let badTokensParams = JSON.parse(JSON.stringify(this.psicashParams));
    badTokensParams.tokens = 'INVALID';
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, badTokensParams));

    // Init, but don't yet make a request
    cy.psiTestRequestSuccess(initAction);

    // Our bad token should have been saved
    let timestamp;
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.be.null;
      expect(psicashParams.tokens).to.equal('INVALID');
      timestamp = psicashParams.timestamp;
    });

    // Now we try a request to the server with our bad token
    cy.psiTestRequestFailure(transActions[0], null, '401');

    // Getting that 401 should have nullified the token
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.be.null;

      // The timestamp should not have changed
      expect(psicashParams.timestamp).to.equal(timestamp);
    });
  });
});

// The logic for token selection is basically: pick the newest, unless it's too new or too old.
// We will be checking for token selection based on what gets stored in the iframe localStorage.
// NOTE: helpers.urlWithParams() updates the timestamp by default.
describe('token selection', function() {
  beforeEach(function() {
    // Make sure we have nothing in localStorage yet
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.be.undefined;
    });
  });

  it('should succeed when starting with nothing and given good params', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.psiTestRequestSuccess(initAction);

    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.be.null;
      expect(psicashParams.tokens).to.contain('token_');
    });
  });

  it('should succeed when starting with nothing and given null params', function() {
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, this.psicashParams));

    cy.psiTestRequestSuccess(initAction);

    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.null;
    });
  });

  it('should replace params with newer params', function() {
    // TODO: Is there a way to do this without all the nesting?
    // I tried fiddling with promises and couldn't get it to work.

    let olderTimestamp;

    cy.log('Start with good params');
    let newestParams = JSON.parse(JSON.stringify(this.psicashParams));
    newestParams.tokens = 'first';
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams));
    cy.psiTestRequestSuccess(initAction);
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.be.null;
      expect(psicashParams.tokens).to.equal('first');
      olderTimestamp = psicashParams.timestamp;

      cy.log('Replace with newer params');
      newestParams.tokens = 'second';
      cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, true, false));
      cy.psiTestRequestSuccess(initAction);
      cy.getIframeLocalStorage().then(function(iframeLS) {
        const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
        expect(psicashParams.tokens).to.not.be.null;
        expect(psicashParams.tokens).to.equal('second');
        expect(psicashParams.timestamp).to.not.equal(olderTimestamp);
        olderTimestamp = psicashParams.timestamp;

        cy.log('Replace with null tokens');
        newestParams.tokens = null;
        cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, true, false));
        cy.psiTestRequestFailure(initAction, 'no tokens');
        cy.getIframeLocalStorage().then(function(iframeLS) {
          const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
          expect(psicashParams.tokens).to.be.null;
          expect(psicashParams.timestamp).to.not.equal(olderTimestamp);
          olderTimestamp = psicashParams.timestamp;

          cy.log('Replace with even newer null tokens');
          newestParams.tokens = null;
          cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, true, false));
          cy.psiTestRequestFailure(initAction, 'no tokens');
          cy.getIframeLocalStorage().then(function(iframeLS) {
            const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
            expect(psicashParams.tokens).to.be.null;
            expect(psicashParams.timestamp).to.not.equal(olderTimestamp);
            olderTimestamp = psicashParams.timestamp;

            cy.log('Replace null tokens with non-null');
            newestParams = JSON.parse(JSON.stringify(this.psicashParams));
            newestParams.tokens = 'third';
            cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, true, false));
            cy.psiTestRequestSuccess(initAction);
            cy.getIframeLocalStorage().then(function(iframeLS) {
              const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
              expect(psicashParams.tokens).to.not.be.null;
              expect(psicashParams.tokens).to.equal('third');
              expect(psicashParams.timestamp).to.not.equal(olderTimestamp);
              olderTimestamp = psicashParams.timestamp;
            });
          });
        });
      });
    });
  });

  it('should reject params with bad timestamps', function() {
    // TODO: Is there a way to do this without all the nesting?
    // I tried fiddling with promises and couldn't get it to work.

    let olderTimestamp;

    cy.log('Start with good params');
    let newestParams = JSON.parse(JSON.stringify(this.psicashParams));
    newestParams.tokens = 'first';
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams));
    cy.psiTestRequestSuccess(initAction);
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.be.null;
      expect(psicashParams.tokens).to.equal('first');
      olderTimestamp = psicashParams.timestamp;

      cy.log('Try to replace with params newer than now');
      newestParams.tokens = 'second';
      newestParams.timestamp = new Date(new Date().getTime() + 1e9).toISOString();
      cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false, false));
      cy.psiTestRequestSuccess(initAction);
      cy.getIframeLocalStorage().then(function(iframeLS) {
        const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
        expect(psicashParams.tokens).to.not.be.null;
        expect(psicashParams.tokens).to.equal('first'); // unchanged
        expect(psicashParams.timestamp).to.equal(olderTimestamp); // unchanged
        olderTimestamp = psicashParams.timestamp;

        cy.log('Try to replace with params that are too old');
        newestParams.tokens = 'third';
        newestParams.timestamp = new Date(new Date().getTime() - 1e9).toISOString();
        cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false, false));
        cy.psiTestRequestSuccess(initAction);
        cy.getIframeLocalStorage().then(function(iframeLS) {
          const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
          expect(psicashParams.tokens).to.not.be.null;
          expect(psicashParams.tokens).to.equal('first'); // unchanged
          expect(psicashParams.timestamp).to.equal(olderTimestamp); // unchanged
          olderTimestamp = psicashParams.timestamp;

          cy.log('Try to replace with params that have an unparsable timestamp');
          newestParams.tokens = 'fourth';
          newestParams.timestamp = 'NOT A TIMESTAMP';
          cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false, false));
          cy.psiTestRequestSuccess(initAction);
          cy.getIframeLocalStorage().then(function(iframeLS) {
            const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
            expect(psicashParams.tokens).to.not.be.null;
            expect(psicashParams.tokens).to.equal('first'); // unchanged
            expect(psicashParams.timestamp).to.equal(olderTimestamp); // unchanged
            olderTimestamp = psicashParams.timestamp;
          });
        });
      });
    });
  });

  // Older versions of clients didn't include a timestamp in the params payload.
  // The general rule for them is that they should be accepted, but should be treated as
  // older than any params _with_ a timestamp.
  it('should handle params with empty timestamp', function() {
    let olderTimestamp;

    cy.log('Start with params with no timestamp');
    let newestParams = JSON.parse(JSON.stringify(this.psicashParams));
    newestParams.tokens = 'first';
    newestParams.timestamp = undefined;
    cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false));
    cy.psiTestRequestSuccess(initAction);
    cy.getIframeLocalStorage().then(function(iframeLS) {
      expect(typeof iframeLS).to.equal('object');
      expect(typeof iframeLS['PsiCash-Dev::v2::PsiCashParams']).to.equal('string');
      const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
      expect(psicashParams.tokens).to.not.be.null;
      expect(psicashParams.tokens).to.equal('first');
      expect(psicashParams.timestamp).to.be.undefined;

      cy.log('Replace with params also with no timestamp');
      newestParams.tokens = 'second';
      newestParams.timestamp = undefined;
      cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false));
      cy.psiTestRequestSuccess(initAction);
      cy.getIframeLocalStorage().then(function(iframeLS) {
        const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
        expect(psicashParams.tokens).to.not.be.null;
        expect(psicashParams.tokens).to.equal('second');
        expect(psicashParams.timestamp).to.be.undefined;

        cy.log('Replace with params that have a timestamp');
        newestParams.tokens = 'third';
        cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, true));
        cy.psiTestRequestSuccess(initAction);
        cy.getIframeLocalStorage().then(function(iframeLS) {
          const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
          expect(psicashParams.tokens).to.not.be.null;
          expect(psicashParams.tokens).to.equal('third');
          olderTimestamp = psicashParams.timestamp;

          cy.log('Try to replace params-with-timestamp with params-without-timestamp');
          newestParams.tokens = 'fourth';
          newestParams.timestamp = undefined;
          cy.psivisit(helpers.urlWithParams(helpers.ParamsPrefixes.HASHBANG, newestParams, false));
          cy.psiTestRequestSuccess(initAction);
          cy.getIframeLocalStorage().then(function(iframeLS) {
            const psicashParams = JSON.parse(iframeLS['PsiCash-Dev::v2::PsiCashParams']);
            expect(psicashParams.tokens).to.not.be.null;
            expect(psicashParams.tokens).to.equal('third');
            expect(psicashParams.timestamp).to.equal(olderTimestamp);
          });
        });
      });
    });
  });

});

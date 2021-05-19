# PsiCash Widget

This repo includes code for the PsiCash "widget" (embedded on landing pages to earn PsiCash) and our Shopify store. (They are both here because they are similar and share a lot of code.)

## Setup

Probably check this out when installing Gulp: https://gulpjs.com/docs/en/getting-started/quick-start

```
$ npm install --global gulp-cli
$ npm install
```

## Building and Testing

Build:
```
$ gulp build
```
The result will be in `./dist`.

Serve the test landing page (and widget) locally, and watch for changes:
```
$ gulp serve
```

Run Cypress tests:
```
# In one terminal:
$ gulp serve
# In another tab:
$ npx cypress open
```

**NOTE**: If test requests are failing:
* It could be because the dev env DB has been reset and the fixture token in `cypress/fixtures/params.json` is no longer valid. Replace with a new one.
* It could be because the `http://localhost:44444` hasn't been added as an allowed origin to the test server. See below.

Deploy to S3 (with [credentials set up](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/configuring-the-jssdk.html)):
```
$ gulp build && gulp deploy
```
...and then do a CloudFront invalidation by hand (TODO: consider doing it [automatically](https://www.npmjs.com/package/gulp-cloudfront-invalidate-aws-publish)).

The output will indicate two separate static file servers are needed to emulate separate origins for the landing page and the widget. Then visit `http://localhost:33333/dev-index.html#psicash={"tokens":<tokens>}`.

In order for the transactions to succeed, there will need to be a `transaction_type` record with a distinguisher of `localhost` or `localhost:33333`.

You will also have to modify the API server config to indicate the localhost origin for the widget requests. In `config_override.toml`, in the `[cors]` section, add a setting like `widget_origins = ["http://localhost:44444"]`. Restart the server.

## How it works

### App opens landing page

The app will open the landing page, passing the earner token to it via a hash param:

```no-highlight
https://psip.me/#psicash=<payload>
```

If the landing page is already using a hash/anchor, then the tokens may be passed via a query param:

```no-highlight
https://psip.me/?psicash=<payload>
```

In either case, it may be appended to pre-existing params with `...&psicash=<tokens>`.

### Landing page embeds the PsiCash widget

See the ["Using the PsiCash widget"](#using-the-psicash-widget) section, below.

### PsiCash script loads widget

`psicash.js` creates an invisible iframe in the page like so:

```html
<iframe
  src="https://widget.psi.cash/v2/iframe.html#psicash=<payload>">
</iframe>
```

The code in that iframe performs the requested transactions with the PsiCash server.

## Using the PsiCash widget

See the [wiki page](https://github.com/Psiphon-Inc/psiphon-issues/wiki/PsiCash-widget-use-on-websites) for more conceptual info.

```html
<script defer data-cfasync="false" src="https://widget.psi.cash/v2/psicash.js"></script>
<script>
  function psicash() {
    psicash.queue = psicash.queue || [];
    psicash.queue.push(arguments);
  }

  // If you want a page-view reward:
  psicash('page-view', {distinguisher: 'mylandingpage.com/path'});

  // If the distinguisher is just the page domain, it can be omitted.
  psicash('page-view');

  // If you want a click-through reward:
  document.querySelector('#mylink').addEventListener('click', function(event) {
    // Supress default navigation, so we don't leave the page before the reward completes
    event.preventDefault();

    psicash('click-through', {distinguisher: 'mylandingpage.com/path'}, function(error, success) {
      // Callback fired, reward complete, continue navigation.
      // Probably ignore error or success, as they don't influence the navigation.
    });
  });
</script>
```

`psicash()` must be passed an action type, but the other two parameters are optional (if, for example, the distinguisher can be derived from the domain name and no callback is desired):

```js
psicash('desired-action-name');
psicash('desired-action-name', callback);
psicash('desired-action-name', {distinguisher: distinguisher});
psicash('desired-action-name', {distinguisher: distinguisher}, callback);
```

Possible action types:
* `'init'`: Can be used to initialize the widget, or check for initialization. Calling this is **optional** (and not recommended), as initialization will happen regardless.
* `'page-view'`: Trigger a page-view reward for the current page or given distinguisher.
* `'click-through'`: Trigger a click-through reward for the current page or given distinguisher.

Callbacks are passed `(error, success)`. `error` indicates a hard, probably unrecoverable failure (such as an absence of tokens). `success` indicates that the action was successful; if false it may indicate a soft failure, such as a reward-rate-limiting 429 response. If `error` is non-null, `success` is meaningless.

### `<script>` tag attributes

[`defer`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script) causes the script to be executed after the document has been parsed, but before `DOMContentLoaded` is fired.

`data-cfasync="false"` is used to [disable](https://support.cloudflare.com/hc/en-us/articles/200169436--How-can-I-have-Rocket-Loader-ignore-my-script-s-in-Automatic-Mode-) Cloudflare's use of Rocket Loader on the script. We have observed the script failing to be loaded by Rocket Loader, which is [apparently not uncommon](https://support.cloudflare.com/hc/en-us/articles/200169456-Why-is-JavaScript-or-jQuery-not-working-on-my-site-).


### Accessing the PsiCash parameters

The info passed in the `#!psicash=`/`?psicash=` PsiCash URL parameters is exposed to the web page. This can be useful when trying to determine the platform and version of the client app. The params object looks like this:
```js
{
  "timestamp": "2020-09-29T19:52:44Z",
  "tokens": "<tokens>",
  "metadata": {
    "client_region": "CA",
    "client_version": "156",
    "propagation_channel_id": "ABCD1234",
    "sponsor_id": "ABCD1234",
    "user_agent": "Psiphon-PsiCash-Windows",
    "v": 1
  },
  "debug": "0",
  "v": 1
}
```

Note that the params are only available after `psicash.js` has full loaded, so accessing them needs to wait until the DOM is loaded. Include the `getPsiCashParams` helper function below to make it easy to access the params.

```js
/**
 * Retrieves the PsiCash params object when available, passing them to the callback.
 * @param callback Function that will receive the PsiCash params object.
 */
function getPsiCashParams(callback) {
  if (document.readyState === 'loading') {
    // The document is still loading, so wait until it's done...
    document.addEventListener('DOMContentLoaded', function() {
      // ...before accessing the params.
      callback(window._psicash.params());
    });
  }
  else {
    // The document is already done loading, so we can access the params now.
    // Make the callback truly asynchronous by wrapping it in setTimeout.
    setTimeout(function() { callback(window._psicash.params()); }, 0);
  }
}
```

And use the helper like so:
```js
getPsiCashParams(function(params) {
  // ... modify a deep link or whatever
  var client_region = params.metadata.client_region;
  // ... etc.
});
```

### Timeouts

All actions have default timeouts. `page-view` is currently ten seconds while `click-through` is one second (it's shorter because it delays the user going to another page). (Updated defaults can be found in [this file](src/common.js) by searching for `PsiCashActionDefaultTimeout`.)

If the default isn't what's desired, a timeout can be specified in milliseconds like so:
```js
psicash('desired-action-name', {distinguisher: distinguisher, timeout: 2000}, callback);
```

There is a safety timeout surrounding all action requests, so the callback will always fire in the time allowed, regardless of errors.

### Tip and tricks

To create a helper function that makes a distinguisher for the current hostname and path:
```js
function getDistinguisher() {
  return location.host + location.pathname;
}
```

## Shopify

Source is in [`./src/shopify`](https://github.com/Psiphon-Inc/psicash-widget/tree/master/src/shopify). There is a separate README in that directory.

## License

See the `LICENSE` file.

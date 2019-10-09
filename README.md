# PsiCash Widget

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

### Embedding the PsiCash widget

```html
<script async defer data-cfasync="false"
  src="https://widget.psi.cash/v2/psicash.js">
</script>
<script>
  function psicash() {
    psicash.queue = psicash.queue || [];
    psicash.queue.push(arguments);
  }

  // This need not be provided to the calls below if it's the same as the page domain
  var distinguisher = 'mylandingpage.com';

  // If you want a page-view reward:
  psicash('page-view');
  // If you need to provide an explicit distinguisher, use this form:
  // psicash('page-view', {distinguisher});

  // If you want a click-through reward:
  document.querySelector('#mylink').addEventListener('click', function(event) {
    // Supress default navigation, so we don't leave the page before the reward completes
    event.preventDefault();
    psicash('click-through', function(error, success) {
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
psicash('desired-action-name', {distinguisher});
psicash('desired-action-name', {distinguisher}, callback);
```

Possible action types:
* `'init'`: Can be used to initialize the widget, or check for initialization. Calling this is **optional** (and not recommended), as initialization will happen regardless.
* `'page-view'`: Trigger a page-view reward for the current page or given distinguisher.
* `'click-through'`: Trigger a click-through reward for the current page or given distinguisher.

Callbacks are passed `(error, success)`. `error` indicates a hard, probably unrecoverable failure (such as an absence of tokens). `success` indicates that the action was successful; if false it may indicate a soft failure, such as a reward-rate-limiting 429 response. If `error` is non-null, `success` is meaningless.


#### `<script>` tag attributes

Both `async` and `defer` are included [because](https://html.spec.whatwg.org/multipage/scripting.html):
> The `defer` attribute may be specified even if the `async` attribute is specified, to cause legacy Web browsers that only support `defer` (and not `async`) to fall back to the `defer` behavior instead of the blocking behavior that is the default.

`data-cfasync="false"` is used to [disable](https://support.cloudflare.com/hc/en-us/articles/200169436--How-can-I-have-Rocket-Loader-ignore-my-script-s-in-Automatic-Mode-) Cloudflare's use of Rocket Loader on the script. We have observed the script failing to be loaded by Rocket Loader, which is [apparently not uncommon](https://support.cloudflare.com/hc/en-us/articles/200169456-Why-is-JavaScript-or-jQuery-not-working-on-my-site-).


### PsiCash script loads widget

`psicash.js` creates an invisible iframe in the page like so:

```html
<iframe
  src="https://widget.psi.cash/v2/iframe.html#psicash=<payload>">
</iframe>
```

The code in that iframe performs the requested transactions with the PsiCash server.

## License

See the `LICENSE` file.

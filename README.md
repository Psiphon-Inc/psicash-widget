# PsiCash Widget

## Testing

Two separate static file servers are needed to emulate separate origins for the landing page, the widget server, and the API server.

Run two file servers in the `client/widget` directory. Like:

```no-highlight
# In one terminal:
$ python -m SimpleHTTPServer 54321
# In another terminal:
$ python -m SimpleHTTPServer 12345
```

In order for the transaction to succeed, there will need to be a `transaction_type` record with a distinguisher of `localhost` or `localhost:54321` or `localhost:54321/landing`, etc.

You will need to modify `landing.html` to refer to `psicash.js` at `localhost:12345` or whatever port you used for the second file server. Also modify the `distinguisher=` param to match the localhost server and distinguisher.

Also modify `IFRAME_URL` in `psicash.js` to use `localhost:12345`.

You will also have to modify the API server config to indicate the localhost origin for the widget requests. In `config_override.toml`, in the `[cors]` section, add a setting like `widget_origin = "http://localhost:12345"`. Restart the server.

You can then access the landing page, which embeds the widget, at:
http://localhost:54321/landing.html


## How it works

### App opens landing page

The app will open the landing page, passing the earner token to it via a hash param:

```no-highlight
https://psip.me/#psicash=<tokens>
```

If the landing page aleady using a hash/anchor, then the tokens may be passed via a query param:

```no-highlight
https://psip.me/?psicash=<tokens>
```

In either case, it may be appended to pre-existing params with `...&psicash=<tokens>`.

### Landing page embeds PsiCash script

The landing page includes a script tag for `psicash.js`. It provides the distinguisher as a query param. Like so:

```html
<script async defer
  src="https://widget.psi.cash/v1/psicash.js?distinguisher=psip.me">
</script>
```

**TODO**: Should this be a hash param instead? I suspect that we might like to log the distinguisher during requests, and potentially serve different code depending on distinguisher.

### PsiCash script loads widget

`psicash.js` creates an invisible iframe in the page like so:

```html
<iframe
  src="https://widget.psi.cash/v1/iframe.html#tokens=<token>&distinguisher=psip.me">
</iframe>
```

### Iframe loads widget script

Iframe loads `widget.psi.cash/v1/iframe.js`. No special params are necessary as they are accessible from the iframe's `window.location`.

The iframe script loads tokens out of local storage, if they exist. We'll call those the stored-tokens.

The passed-tokens are retrieved from the URL param.

> For now we'll always be replacing the stored-tokens with the passed-tokens. When we have accounts, we'll compare the tokens and, if they're different, attempt to merge them. (Merging a Tracker into an Account is possible. Merging a Tracker into a Tracker is not possible.)

**NOTE**: Storing tokens may be problematic in Safari, as it has tight 3rd party iframe cookie/storage restrictions.
https://medium.com/@bluepnume/safaris-new-tracking-rules-and-enabling-cross-domain-data-storage-85241eea7483
https://stackoverflow.com/questions/18852767/is-there-any-workaround-to-set-third-party-cookie-in-iframe-for-safari
https://stackoverflow.com/questions/38584273/local-storage-cross-domain-safari-disables-it-by-default
https://webkit.org/blog/7675/intelligent-tracking-prevention/

The distinguisher is retrieved from the URL param.

The iframe script verifies that the distinguisher is valid for the landing page.

Iframe makes a page view reward request to:

```
https://api.psi.cash/v1/transaction?class=page-view&distinguisher=psip.me"
    X-PsiCash-Auth:<token>
```

On a 500 error, the request will be retried (with back-off).

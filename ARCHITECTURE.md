# Architecture

## Data storage and flow

Not all browsers allow for persistent storage of data for third-party iframe, such as our widget. This is due to tracking prevention/protection, which is enabled by default on some browsers (Safari, Brave, Firefox), and fairly easy to set on others. Due to this, we can't assume that data the widget wants to store will still be there next time.

To help with this, our script in the top page will help with data storage. It will pass the data it stores into the widget iframe, and accept data to store on the iframe's behalf.

Note that there are privacy considerations to be cognizant of while doing this. The page has some information via the payload we embed in the URL, but we need to make sure we don't ask it to store other information it shouldn't know about. I.e.,

1. It should not store "next allowed request" information for domains other than its own. We don't want to reveal user browsing history.

2. If it has an older tokens payload, it should not be told about newer ones. The page may no longer be associated with Psiphon (as a landing page) and so it shouldn't be told about tokens it didn't already have access to.

    Note that this is very limiting and we may want to revisit it. For example, if a user keeps visiting a page directly without opening it via the app, it won't get new tokens. If the widget has new tokens and non-durable storage, it sure would be nice to have the page store those updated tokens. Perhaps the page can somehow "prove its validity", allowing it to continue storing updated tokens? By a successful earning request?

So, at this time, data flow will be mostly one-way: page to iframe.

### Tokens payload (`PsiCashParams`) handling

There are 3 sources for the tokens payload, all or some or none of which may exist:
1. A param in the page URL.
2. The localStorage of the page.
3. The localStorage of the widget.

Choosing which to use is simple: the one with the newest timestamp. First the page script looks at the URL and the page localStorage, chooses the newest, stores it if it has changed, and passes it to the iframe. Then the iframe script looks at the one passed by the page and compares it to the one it might have in localStorage. It then stores that one and uses it for communicating with the server. In the case of ties, the order of preference is URL then page then widget.

[Right now the page passes the tokens payload to the iframe via the iframe's URL. It could instead be done via a posted message -- perhaps the `init` message.]

## Desired behaviour

Here we'll document the desired widget and Shopify behaviour. It will be used to drive test plans.

#### Terminology

* "tokens": basically shorthand for "params package containing tokens"
* "sufficiently recent": currently less than 1 minute old
* "old tokens": otherwise valid tokens, but timestamp is not sufficiently recent; if not specified, tokens assumed to be sufficiently recent
* "older": earlier timestamp than the stored tokens, but still sufficiently recent
* "invalid tokens": tokens that the server will fail to look up
* "good tokens": tokens that have a sufficiently recent timestamp and will be found by the server
* "with no timestamp": current clients include a timestamp in the params package; old clients do not; if not specified, assumption is timestamp present
* "same", "identical": the same tokens that are already stored; "identical" also means the timestamp is the same

#### Token priority

This rules apply to token selection in both the widget and store code.

* Newer tokens preferred over older tokens
* Insufficiently new tokens in URL are never accepted
* Tokens without timestamp are considered "sufficiently new", but older than any _with_ timestamp
* Once stored, timestamp doesn't matter

### Widget

Additional general rules:
* Getting 401 response clears stored tokens
* See the "Tokens payload (`PsiCashParams`) handling" section above. We're not going to list separate cases for all combinations, as they're not that interesting (and would multiply the table size).
* As mentioned above, browsers increasingly refuse to persist local storage in third-party iframes. This means that the widget iframe often does not have stored tokens.

| Stored tokens | URL tokens                  | Result: page tokens | Result: widget tokens | Result: request | Result: error         |
| ------------- | --------------------------- | ------------------- | --------------------- | --------------- | --------------------- |
| none          | none                        | none                |                       | none            | "no tokens available" |
| none          | good                        | new tokens stored   |                       | 200             |                       |
| none          | old                         | none                |                       | 401             |                       |
| none          | valid, no timestamp         | new tokens stored   |                       | 200             |                       |
| none          | invalid                     | no tokens stored    |                       | 401             |                       |
| no timestamp  | none                        | no change           |                       | 200             |                       |
| no timestamp  | identical                   | no change           |                       | 200             |                       |
| no timestamp  | good                        | new tokens          |                       | 200             |                       |
| no timestamp  | old                         | no change           |                       | 200             |                       |
| no timestamp  | valid, no timestamp         | new tokens          |                       | 200             |                       |
| no timestamp  | invalid                     | none                |                       | 401             |                       |
| good          | none                        | no change           |                       | 200             |                       |
| good          | identical                   | no change           |                       | 200             |                       |
| good          | same, newer                 | updated timestamp   |                       | 200             |                       |
| good          | same, older                 | no change           |                       | 200             |                       |
| good          | good, newer                 | new tokens          |                       | 200             |                       |
| good          | good, older                 | no change           |                       | 200             |                       |
| good          | old                         | no change           |                       | 200             |                       |
| good          | no timestamp                | no change           |                       | 200             |                       |
| good          | invalid, newer              | none                |                       | 401             |                       |
| good          | invalid, older              | no change           |                       | 200             |                       |
| invalid       | none/old/older/no timestamp | none                |                       | 401             |                       |
| invalid       | newer                       | new tokens          |                       | 200             |                       |

### Shopify

Unlike the widget, there is no iframe used -- all scripts and storage are in the page context.

Extra terminology:
* "referrer": The value of the `Referer` header when the request to load the page was made. This is typically the hostname of the site where the link was clicked that led to this page.
* "referrer: none": No or empty `Referer` header. This is expected when launched from the app. It may happen with links from other sites (like Gmail).
* "referrer: store": `Referer` header has the hostname of the store. This happens when going between pages in the store site.

General rules:
* A referrer that isn't either empty (like from the app) or the store hostname (like between pages in the store) is unacceptable. (It may indicate a token substitution attack.)
* If the referrer is empty, valid tokens must be present.
* The server's ValidateTokens endpoints is called on every page load.
  - If ValidateTokens indicates the tokens are invalid, they are cleared from localStorage, and a "tokens not valid" error message blocks the page.
  - If ValidateTokens indicates the tokens are valid, the user may proceed.
  - If ValidateTokens encounters an error (unable to make the request), it creates a log but otherwise behaves like the tokens-are-valid case.
  - In the matrix below, it is assumed that the ValidateTokens request succeeds (no error). The cases where it fails are identical to the tokens-are-valid cases.
* All links within the store site to other store pages should have our URL param added. If this fails for some link, behaviour should mostly be normal.

| Referrer   | Tokens stored | Tokens in URL               | Result: stored    | Result: purchase | Result: error      |
| ---------- | ------------- | --------------------------- | ----------------- | ---------------- | ------------------ |
| none       | *             | none                        | none              | disallowed       | "launch directly"  |
| other      | *             | *                           | none              | disallowed       | "launch directly"  |
| store      | none          | none                        | none              | disallowed       | "tokens not valid" |
| none/store | none          | good                        | new tokens stored | allowed          |                    |
| none/store | none          | old                         | none              | disallowed       | "tokens not valid" |
| none/store | none          | valid, no timestamp         | new tokens stored | allowed          |                    |
| none/store | none          | invalid                     | no tokens stored  | disallowed       | "tokens not valid" |
| none/store | no timestamp  | none                        | no change         | allowed          |                    |
| none/store | no timestamp  | identical                   | no change         | allowed          |                    |
| none/store | no timestamp  | good                        | new tokens        | allowed          |                    |
| none/store | no timestamp  | old                         | no change         | allowed          |                    |
| none/store | no timestamp  | valid, no timestamp         | new tokens        | allowed          |                    |
| none/store | no timestamp  | invalid                     | none              | disallowed       | "tokens not valid" |
| none/store | good          | none                        | no change         | allowed          |                    |
| none/store | good          | identical                   | no change         | allowed          |                    |
| none/store | good          | same, newer                 | updated timestamp | allowed          |                    |
| none/store | good          | same, older                 | no change         | allowed          |                    |
| none/store | good          | good, newer                 | new tokens        | allowed          |                    |
| none/store | good          | good, older                 | no change         | allowed          |                    |
| none/store | good          | old                         | no change         | disallowed       | "launch directly"  |
| none/store | good          | no timestamp                | no change         | allowed          |                    |
| none/store | good          | invalid, newer              | none              | disallowed       | "tokens not valid" |
| none/store | good          | invalid, older              | no change         | allowed          |                    |
| none/store | invalid       | none/old/older/no timestamp | none              | disallowed       | "tokens not valid" |
| none/store | invalid       | newer                       | new tokens        | allowed          |                    |

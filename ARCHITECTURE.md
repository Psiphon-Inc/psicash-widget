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

Choosing which to use is simple: the one with the newest timestamp. First the page script looks at the URL and the page localStorage, chooses the newest, stores it if it has changed, and passes it to the iframe. Then the iframe script looks at the one passed by the page and compares it to the one it might have in localStorage. It then stores that one and uses it for communicating with the server.

[Right now the page passes the tokens payload to the iframe via the iframe's URL. It could instead be done via a posted message -- perhaps the `init` message.]

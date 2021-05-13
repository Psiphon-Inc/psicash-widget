# PsiCash-Shopify

## Building

```
$ gulp shopify
```
The result will be in `./dist/shopify`.

## TODO

* TaxJar instructions.

## Product setup

* Product SKUs _are_ transaction type distinguishers. They must match what is in the database. (And they must be set.)
* TODO: More steps/info

## Store theme mods

1. Edit theme code
2. Edit `Layout/theme.liquid`.
   - In the script tags, add:
     ```html
     <!-- PSIPHON -->
     <script src="{{ 'shopify-psicash.js' | asset_url }}" defer="defer"></script>
     <!-- /PSIPHON -->
     ```
   - At the top of the `<body>` element add:
     ```html
     <!-- PSIPHON -->
     <style>
        .psicash-page-blocker {
           position: fixed;
           left: 0;
           right: 0;
           top: 0;
           bottom: 0;
           background: rgba(0, 0, 0, 0.8);
           height: 100%;
           width: 100%;
           z-index: 9999;
           overflow: hidden;
        }
        .psicash-page-blocker > div {
           background: #FFF;
           padding: 30px;
           text-align: center;
           top: 45%;
           position: relative;
           font-size: 30px;
           font-weight: bold;
           color: #000;
           box-shadow: #000 0px 0px 15px;
        }
        .psicash-page-blocker-error > div {
           color: #9c0000;
           box-shadow: #9c0000 0px 0px 15px;
        }
     </style>

     <noscript>
        <div class="psicash-page-blocker psicash-page-blocker-error">
           <div>
           JavaScript is required to use this store
           </div>
        </div>
     </noscript>

     <!-- We want the page blocked by default, to be unblocked when the token check is done -->
     <div id="psicash-page-blocker" class="psicash-page-blocker" style="opacity: 0;">
        <div>
           Loading...
        </div>
     </div>
     <script>
        // But often we'll check the tokens fast enough that we don't really need to show it
        setTimeout(function() {
           var pageBlocker = document.getElementById('psicash-page-blocker');
           if (pageBlocker) {
           console.log('PsiCash: revealing page blocker');
           pageBlocker.style.opacity = '1';
           }
        }, 1000);
     </script>
     <!-- /PSIPHON -->
     ```
   [`defer`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script) causes the script to be executed after the document has been parsed, but before `DOMContentLoaded` is fired.
3. In the Assets section, add `shopify-psicash.js`.
4. Edit `Sections/cart-template.liquid`. Find the code that loops over `item.properties` and prints them out, and either comment it out or remove it. For a more nuanced approach (in case we need to display _some_ properties) see [the documentation](https://help.shopify.com/en/themes/customization/products/features/get-customization-information-for-products#hide-line-item-properties-(optional)-sectioned-themes-specific).
   - Rather than modifying the theme, we could remove the offending properties with JS (our script is loaded on the cart page). That might be preferable, since it _might_ work with more themes without modification. But for now we have modified the template.
5. The product item properties will still be shown in the cart popup that shows when an item is added to the cart.
   - Edit `Assets/theme.js`.
   - Search for `_setCartPopupProductDetails` or `item.properties`.
   - Prevent that code from formatting the properties into the cart popup.
6. ...The Checkout page _still_ shows the properties, and it's not editable in the theme, and there doesn't seem to be a way to disable showing the properties. But they don't show if they're prefixed with underscore. So I guess we have to require that. Which calls into question the necessity of the above steps. So maybe test first before bothering.

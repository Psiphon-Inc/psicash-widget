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
2. Edit `Layout/theme.liquid`. In the script tags, add:
   ```html
   <script src="{{ 'psicash-shopify.js' | asset_url }}" defer="defer"></script>
   ```
   [`defer`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script) causes the script to be executed after the document has been parsed, but before `DOMContentLoaded` is fired.
3. In the Assets section, add `psicash-shopify.js`.
4. Edit `Sections/cart-template.liquid`. Find the code that loops over `item.properties` and prints them out, and either comment it out or remove it. For a more nuanced approach (in case we need to display _some_ properties) see [the documentation](https://help.shopify.com/en/themes/customization/products/features/get-customization-information-for-products#hide-line-item-properties-(optional)-sectioned-themes-specific).
   - Rather than modifying the theme, we could remove the offending properties with JS (our script is loaded on the cart page). That might be preferable, since it _might_ work with more themes without modification. But for now we have modified the template.
5. The product item properties will still be shown in the cart popup that shows when an item is added to the cart.
   - Edit `Assets/theme.js`.
   - Search for `_setCartPopupProductDetails` or `item.properties`.
   - Prevent that code from formatting the properties into the cart popup.
6. ...The Checkout page _still_ shows the properties, and it's not editable in the theme, and there doesn't seem to be a way to disable showing the properties. But they don't show if they're prefixed with underscore. So I guess we have to require that. Which calls into question the necessity of the above steps. So maybe test first before bothering.
7. To disable the ability to buy with JavaScript disabled, edit `Templates/product.liquid`. Add this near the top of the file:
   ```html
   <noscript>
     <div style="position: fixed; top: 0px; left: 0px; z-index: 3000;
                 height: 100%; width: 100%; background-color: #FFFFFF">
         <h1 style="color:red;text-align:center">JavaScript is required to use this store.</p>
     </div>
   </noscript>
   ```

(function () {
  'use strict';

  var TOKENS_PARAM = 'tokens';
  var DISTINGUISHER_PARAM = 'distinguisher';
  var IFRAME_URL = 'http://localhost:12345/iframe.html'; // TODO: update

  // Loads the widget iframe into the page.
  function loadIframe() {
    var distinguisher = getParam(getCurrentScriptURL(), DISTINGUISHER_PARAM);
    // If there's no distinguisher, we can't proceed, as it's necessary for a
    // page-view reward attempt. This case suggests a bug with the page's script tag.
    if (!distinguisher) {
      log('PsiCash: Failed to find distinguisher');
      return;
    }

    var tokens = getParam(location.href, TOKENS_PARAM);
    // If there are no tokens, we can still load the widget, as it might have
    // locally-stored tokens that can be used. This situation suggests that the
    // user is visiting the landing page directly, rather than it being opened by the app.

    var iframeSrc = IFRAME_URL + '#' + DISTINGUISHER_PARAM + '=' + distinguisher;
    if (tokens) {
      iframeSrc += '&' + TOKENS_PARAM + '=' + tokens;
    }

    var iframe = document.createElement('iframe');
    iframe.src = iframeSrc;

    // Make invisible.
    iframe.style = 'width:0;height:0;border:0;border:none;position:absolute;';

    document.body.appendChild(iframe);
  }

  // Get the src from the current script's tag. This can be used for retrieving params.
  function getCurrentScriptURL() {
    var thisScript = document.currentScript || document.querySelector('script[src*="psicash.js"]');
    return thisScript.src;
  }

  // Splits the given URL into components that can be accessed with `result.hash`, etc.
  function urlComponents(url) {
    var parser = document.createElement('a');
    parser.href = url;
    return parser;
  }

  // Get the param value for the given name from the URL hash or query. Returns null if not found.
  // TODO: Is it okay to look in both places in all cases?
  function getParam(url, name) {
    var urlComp = urlComponents(url);
    var paramLocations = [urlComp.hash.slice(1), urlComp.search.slice(1)];

    var reString = '(?:^|&)' + name + '=(.+?)(?:&|$)';
    var re = new RegExp(reString);

    var match;
    for (var i = 0; i < paramLocations.length; i++) {
      match = re.exec(paramLocations[i]);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function log() {
    if (window.console) {
      window.console.log(Array.prototype.slice.call(arguments));
    }
  }

  // Do the work.
  (function() {
    loadIframe();
  })();

})();
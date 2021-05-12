// TODO: If this file starts getting out of hand, use core-js

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries#polyfill
if (!Object.entries) {
  Object.entries = function(obj){
    var ownProps = Object.keys(obj), i = ownProps.length, resArray = new Array(i); // preallocate the Array
    while (i--) {
      resArray[i] = [ownProps[i], obj[ownProps[i]]];
    }

    return resArray;
  };
}

// Adapted from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries#polyfill
if (!Object.values) {
  Object.values = function(obj){
    var ownProps = Object.keys(obj), i = ownProps.length, resArray = new Array(i); // preallocate the Array
    while (i--) {
      resArray[i] = obj[ownProps[i]];
    }

    return resArray;
  };
}

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith#polyfill
if (!String.prototype.startsWith) {
  Object.defineProperty(String.prototype, 'startsWith', {
    value: function(search, rawPos) {
      var pos = rawPos > 0 ? rawPos|0 : 0;
      return this.substring(pos, pos + search.length) === search;
    }
  });
}

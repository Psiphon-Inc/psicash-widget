export function url(suffix='') {
  return '/dev-index.html' + suffix;
}

export function encodeParams(params, base64) {
  let json = JSON.stringify(params);
  let encodedParams;
  if (base64) {
    encodedParams = btoa(json);
  }
  else {
    encodedParams = encodeURIComponent(json);
  }
  return encodedParams;
}

export const ParamsPrefixes = {
  HASH: '#',
  HASHBANG: '#!',
  QUERY: '?'
};

export function urlWithParams(prefix, params, base64) {
  return url(prefix + 'psicash=' + encodeParams(params, base64));
}


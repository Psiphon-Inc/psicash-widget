export function url(suffix='') {
  return '/bare.html' + suffix;
}

/**
 * Encode the given params, suitable for use in a URL.
 * @param {object} params The PsiCash params object.
 * @param {boolean} base64 Whether the params should be base64-encoded.
 */
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

/**
 * Created a full URL with the given params.
 * @param {ParamsPrefixes} prefix The hash or query prefix immediately before the params.
 * @param {object} params The PsiCash params object.
 * @param {boolean} updateTimestamp If true, the timestamp of the params will be set to "now".
 * @param {boolean} base64 Whether the params should be base64-encoded.
 */
export function urlWithParams(prefix, params, updateTimestamp=true, base64=true) {
  if (updateTimestamp) {
    params['timestamp'] = new Date().toISOString();
  }

  return url(prefix + 'psicash=' + encodeParams(params, base64));
}


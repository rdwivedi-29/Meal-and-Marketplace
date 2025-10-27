// config.js - reads API base from <meta name="api-base"> or defaults to same origin
(function () {
  const meta = document.querySelector('meta[name="api-base"]');
  const val = meta && meta.content ? meta.content.trim() : "";
  // default to same-origin if not set
  window.API_BASE = val || window.location.origin;
})();

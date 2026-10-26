// The not-found page (404.html), served at whatever address wasn't found.
// Olemmy's pages live after a "#", so an address without one that names
// something Olemmy can show is sent there at once: Lemmy-style paths
// (/c/linux@lemmy.ml, /u/..., /post/123, /comment/123, /m/name) and share
// addresses missing their "#" (/lemmy.world/post/123). Anything else gets
// the page, with the address shown and a search box. Runs in <head> so a
// match moves on before anything is drawn; no imports, like theme-init.js.
(function () {
  'use strict';
  // The site's own path: / at a domain's root, /olemmy/ on GitHub Pages
  // without a custom domain (build.sh -b): where this script is, less js/.
  var base = document.currentScript ? new URL('..', document.currentScript.src).pathname : '/';
  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (base !== '/' && path.indexOf(base) === 0) path = path.slice(base.length - 1);
  var rest = location.search;
  var route = null;
  var m;
  if ((m = /^\/(c|u|m|post|comment)\/([^/]+)$/.exec(path))) {
    var kind = m[1] === 'm' ? 'm' : m[1];
    if ((kind === 'post' || kind === 'comment') ? /^\d+$/.test(m[2]) : /^[\w.@%-]+$/.test(m[2])) route = '#/' + kind + '/' + m[2];
  } else if (/^\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?\/.+/i.test(path)) {
    // A host first, then its path: a share address (views/address.js).
    route = '#' + path;
  }
  if (route && !/[<>"'\s]/.test(route)) {
    location.replace(base + route + (rest && route.indexOf('?') < 0 ? rest : ''));
    return;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var shown = document.getElementById('nf-path');
    if (shown) shown.textContent = decodeURIComponent(location.pathname) + location.search;
    var q = document.getElementById('nf-q');
    // A guess at what was wanted: the address's last word.
    var words = decodeURIComponent(path).split(/[/_\-.]+/).filter(function (w) { return /[a-z]{3,}/i.test(w) && !/^(html?|php|index)$/i.test(w); });
    if (q && words.length) q.value = words[words.length - 1];
    var form = document.getElementById('nf-search');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = q.value.trim();
        location.href = base + '#/search' + (v ? '?q=' + encodeURIComponent(v) : '');
      });
    }
  });
})();

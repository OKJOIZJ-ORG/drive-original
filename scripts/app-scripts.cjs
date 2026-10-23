'use strict';
// The page's classic scripts in load order, as listed in the public allowlist.
// They share one global scope; index.html, sw.js SHELL_FILES and the test
// loader must list exactly these in this order (tests/static.test.js checks).
module.exports = Object.freeze(require('./public-files.cjs').filter((name) => name.startsWith('app/')));

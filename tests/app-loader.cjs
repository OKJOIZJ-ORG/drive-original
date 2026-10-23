'use strict';
// Loads the page's classic scripts the way index.html does: one shared global
// scope, one script per file, in scripts/app-scripts.cjs order. Tests keep
// replacing globals by assignment, exactly as before the split.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const APP_SCRIPTS = require('../scripts/app-scripts.cjs');
const files = APP_SCRIPTS.map((name) => {
  const filename = path.join(root, name);
  return { name, filename, text: fs.readFileSync(filename, 'utf8') };
});
// Every application script as one string, for source-shape assertions.
const appSource = files.map((file) => file.text).join('\n');

function loadApp(context) {
  for (const file of files) vm.runInContext(file.text, context, { filename: file.filename });
  return context;
}

module.exports = { APP_SCRIPTS, appSource, loadApp };

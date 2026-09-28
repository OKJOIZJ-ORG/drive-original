'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const shell = fs.readFileSync(path.join(root,'tests/shell.test.js'));
const copy = path.join(__dirname,'shell-test.producer.js');
if (!fs.existsSync(copy)) fs.writeFileSync(copy, shell);
for (const file of ['tests/app.test.js','tests/shell.test.js','tests/static.test.js','tests/sw.test.js']) {
  const absolute = path.join(root,file);
  fs.writeFileSync(absolute, fs.readFileSync(absolute,'utf8').replaceAll('\r\n','\n'));
}
process.stdout.write('Normalized only task-owned test producers to the maintained LF checkout policy; original shell producer retained.\n');

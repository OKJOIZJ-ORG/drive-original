'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const files = ['app.js', 'sw.js', 'index.html', 'version.json', 'tests/static.test.js'];
for (const file of files) {
  const absolute = path.join(root, file);
  const text = fs.readFileSync(absolute, 'utf8');
  if (!text.includes('1.22.0-rc.13')) throw Error(`Expected prior version in ${file}`);
}
for (const file of files) {
  const absolute = path.join(root, file);
  fs.writeFileSync(absolute, fs.readFileSync(absolute, 'utf8').replaceAll('1.22.0-rc.13', '1.22.0-rc.14').replaceAll('\r\n', '\n'));
}
const absolute = path.join(root, 'version.json');
const metadata = JSON.parse(fs.readFileSync(absolute, 'utf8'));
metadata.releasedAt = new Date().toISOString();
metadata.changeSummary = '재생을 시작한 원본 버전을 유지해 재생 중 파일 변경으로 서로 다른 영상이 섞이는 문제를 방지했습니다. 첫 실행의 재생 연결 준비와 원본 버퍼 복구도 개선했습니다.';
fs.writeFileSync(absolute, JSON.stringify(metadata, null, 2) + '\n');
process.stdout.write('Prepared rc.14 version metadata; no deployment performed.\n');

import fs from 'node:fs/promises';
const live = JSON.parse(await fs.readFile(new URL('./live-rc11-results.json', import.meta.url), 'utf8'));
const cold = JSON.parse(await fs.readFile(new URL('../candidate-rc11-delivery/results.json', import.meta.url), 'utf8'));
const rollback = JSON.parse(await fs.readFile(new URL('./rollback-schema-results.json', import.meta.url), 'utf8'));
const fresh = live.freshEmptyCache.observed.result.result;
if (!cold.passed || !live.validation.ownBodyEqualsExpectedProjection || !live.allOtherRawAndMetadataUnchanged
  || !fresh.passed || !rollback.passed) throw new Error('Report prerequisite failed');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Drive Original — 계정 기록 검증</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d131d;color:#eef3fa;font:16px/1.6 system-ui,sans-serif;padding:48px}
main{max-width:1000px;margin:auto}small{color:#9eafc7}h1{font-size:32px;margin:12px 0 6px}p{color:#b9c8dc;margin:8px 0 26px}
.counts{display:flex;gap:16px;margin:24px 0}.counts div{background:#172234;border:1px solid #2c3e55;border-radius:16px;flex:1;padding:20px}
strong{font-size:36px;display:block;color:#f5f8ff}table{border-collapse:collapse;width:100%}td{padding:16px 12px;border-bottom:1px solid #29374a;vertical-align:top}td:first-child{width:30%;color:#eef3fa}td:last-child{color:#bed0e7}
.pass{display:inline-block;border:1px solid #397863;border-radius:20px;padding:3px 12px;color:#a2e2c2;background:#163429;margin-top:12px}
footer{font-size:14px;color:#9eafc7;margin-top:24px} @media(max-width:640px){body{padding:24px}.counts{gap:8px}.counts div{padding:12px}h1{font-size:26px}}
</style><main><small>Drive Original · WP-08 검증 기록 · ${escape(live.version)}</small>
<h1>계정 기록 저장·복원 확인</h1><p>실제 계정 원격 읽기와 앱 재실행 결과입니다. 아래 각 검증의 범위를 구분해 기록했습니다.</p>
<div class="counts"><div>좋아요<strong>${live.validation.ownBodyEqualsExpectedProjection ? live.retainedReadback.summary.summary.remote.liked : '—'}</strong></div><div>좋아요 취소<strong>${fresh.unliked}</strong></div><div>조회 기록<strong>${fresh.viewed}</strong></div></div>
<table><tr><td>실제 정상 동기화</td><td>저장 기대 내용과 전체 원격 본문 일치 · 대기 기록 없음 · 423 오류 없음</td></tr>
<tr><td>기존 기록 보존</td><td>기타 6개 문서의 전체 내용·메타데이터 그대로 · 이전 출처 기록 포함</td></tr>
<tr><td>실제 앱 재실행</td><td>기존 캐시를 유지한 새 문서 실행에서 연결과 전체 기록 복원</td></tr>
<tr><td>빈 캐시 재구성</td><td>정확한 현재 앱 코드의 격리 실행 · 실제 계정 9 GET · 쓰기 0 · 전체 항목 비교 통과</td></tr>
<tr><td>이전 코드 호환</td><td>v1.21.0 코드 + 보호된 실제 snapshot의 로컬 provider로 같은 기록 복원 · 원격 호출 0</td></tr>
<tr><td>후보판 배포</td><td>공개 파일 ${cold.assets.length}개 고정 커밋과 동일 · 운영판 v1.21.0 유지</td></tr></table>
<span class="pass">명시한 범위에서 검증 통과</span><footer>실제 iPhone·두 물리 기기·새 OAuth origin 검증을 뜻하지 않습니다.<br>빈 캐시 첫 소유권 중단 결과도 보존했습니다. 캡처 ${escape(live.freshEmptyCache.capturedAt)}</footer></main></html>`;
await fs.writeFile(new URL('./live-rc11-report.html', import.meta.url), html);
console.log(JSON.stringify({ reportSaved: true, scope: 'Redacted verification record; not product UI or physical-device proof' }));

# Checkpoint — D085 운영 주소 변경, 이름 선택 대기 — 2026-10-04 21:40

## The story so far
D084 완료 상태와 운영1.23.3 source8bc5938/Worker9ab1e4ad-477a-4ea3-b985-23578c74e68c는 유지. 사용자가 짧은 주소로 변경을 요청했으나 Cloudflare가 jbs와 jyw 모두 unavailable로 반환했다. 조회만 수행했으며 주소·설정·배포는 바꾸지 않았다. Private receipts: ../maintenance/tools/address-change-20261004/ (workspace root 기준).

## Decided
D085: 최초 drive-original.jbs.workers.dev 요청 후 jyw를 먼저 시도. 기존 동일-origin 제한은 이번 주소 이전에 한해 대체되며 원본·보안·Notion폐기·자동화PAUSED 경계 유지. 아직 대체 이름 확정 없음.

## Waiting on the user
Cloudflare가 허용하는 중간 이름 선택. 조회 시점 jyw-drive/jbs-drive/jbs-original available, 예약하지 않음. Async question 제출: drive-original.jyw-drive.workers.dev 또는 drive-original.jbs-drive.workers.dev, 자유 입력 가능.

## Next first action
사용자 답변의 확정된 이름을 maintenance/tools/address-change-20261004/inspect.cjs로 재조회한다. 답변 전 이름 변경은 하지 않는다.

## Tried
jbs와 jyw: Cloudflare GET workers/subdomains/{name} HTTP403/code10031. 다른 이름 필요. jbs-drive/jbs-original/jyw-drive는 HTTP404/code10032 가용, 성공 HTTP200과 혼동하지 않는다. 계정의 Worker3개(운영1개, 과거QA2개) 확인. Chrome DevTools MCP는 기존 프로필 사용 중 오류; 소유 프로필을 종료하지 않았고 CUA 문서만 복원, 탭 조작 없음. 이전 UI/PC/Android 증거는 RELEASE-1.23.3.md 및 archive checkpoint에 보존.

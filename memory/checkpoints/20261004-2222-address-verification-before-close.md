# Checkpoint — D086 새 주소 운영 검증 및 Git 마감 진행 — 2026-10-04

## The story so far
사용자 확정 주소 https://drive-original.jyw-drive.workers.dev 로 운영 Worker와 계정 subdomain 변경, 동일 1.23.3 public assets 배포 완료. Worker ID/인증 namespace/4 secret names 보존. Google OAuth 기존 client의 새 origin/callback 추가 저장 확인. Public 5개 byte equality, private 3개 404, valid anonymous auth 401/no-store 통과. PC와 실기기 Android 새 주소 동일 계정/좋아요 13개 확인; Android 실제 짧은 영상 재생 통과. Private receipts: ../maintenance/tools/address-change-20261004/.

## Decided
D086: drive-original.jyw-drive.workers.dev 사용자 승인. 기존 보안·원본 데이터·자동화PAUSED 유지. main 병합/push/기존 Pages 진입 링크 갱신 승인 범위.

## Waiting on the user
없음. iOS는 기존 사용자 실사용 검증 예정이며 이번 직접 검증 범위 제외.

## Next first action
CUA newPc(275142287) 좋아요 UI 결과 확인 후 실제 짧은 영상 재생과 설정 새 주소 screenshot을 저장한다. 이어 legacy public-only Pages 갱신/문서/main merge/push 완료.

## Tried
Account subdomain PUT without allow-rename:1 returned409; 이를 gate하지 않고 배포한 실행 실수는 사용자에게 설명했으며 필요한 header로 재시도 성공/현재 새 origin 정상 확인.
Chrome DevTools 다른 세션 profile conflict는 종료하지 않고 normal Chrome CUA 사용.
Google 경고 페이지가 빈 DOM이었으나 normal reload 후 기존 권한 로그인 완료; 원인은 미확인.
PC likedIDs Set JSON serialization과 Android 구view full-library count 비교는 검사 producer 오류로 원본 실패 보존 후 정확한 동일계정/13 likedIDs 판정으로 수정; 전체 library equivalence 통과 주장 없음.

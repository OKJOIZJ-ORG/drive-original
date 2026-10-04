# Drive Original 운영 주소 변경 — 2026-10-04

사용자 D086 확정 주소: **https://drive-original.jyw-drive.workers.dev/**. 이전 `jbs`와 `jyw`는 Cloudflare unavailable 응답이었으며, 사용자가 가용 `jyw-drive`를 선택했다. 제품 버전은 **1.23.3**, 공개 runtime **8bc5938e3c1a24a2e88219ff4aef8583684ba0e0** 그대로다. 별도 제품 기능 변경이나 재포장은 하지 않는다. 기존 릴리즈 기록의 당시 주소/배포 ID는 보존한다.

## 수정과 보존

- `worker/wrangler.jsonc`: Worker 이름 `drive-original`, `PUBLIC_ORIGIN` 새 주소. 원격 Worker 이름과 계정 workers.dev subdomain도 일치한다. 계정 label은 과거 QA Worker 두 개의 기본 주소에도 적용된다; 그 Worker의 코드/저장소는 수정하지 않았다.
- Google Cloud의 기존 Drive Original Web OAuth client에 새 HTTPS origin과 `/auth/google/callback`을 추가·저장하고 다시 열어 확인했다. 기존 localhost/Pages origin 및 이전 callback은 보존한다. 비밀정보나 접근 범위를 바꾸지 않았다.
- 기존 immutable Worker ID `667cedebc7a24618b266d80fe7a7f0fd`, `AUTH_OBJECTS` namespace `cc958706c3f54d3bad6bfd36577e620b`와 네 secret binding을 보존했다. 이름 변경 API 후 동일 배포/전체 binding 확인, 기존 인증 환경에 같은 공개 assets 배포. 현재 운영 Worker version **b20aebdd-0c7f-44bc-a218-17460b200502**.
- 기존 GitHub Pages handoff의 링크와 JS 목적지를 새 주소로 수정하고 캐시 이름/안내 메타데이터를1.23.3으로 갱신했다. 네 handoff와 여섯 기존 public asset 및 빈 `.nojekyll`만 배포한다. 전체 repo 업로드 workflow는 활성화하지 않는다.
- 유지보수 중인 `qa/uiux-followup/android.cjs` 운영 주소와 README/현재 기록을 정렬했다. 과거 시험 결과/주소는 덮어쓰지 않는다.

## 실제 검증

Worker auth/config focused19/19, public shell/static36/36, 변경된 JS syntax 검사 통과. 현재 public `index.html/app.js/styles.css/sw.js/version.json`5개 HTTP200·Git byte 일치, private `memory/CHECKPOINT.md/worker/index.mjs/tests/cloudflare-auth-worker.test.mjs`3개404, 유효한 same-origin protocol의 익명 auth 요청401/no-store 통과. 기존 ZIP65entries/64public blobs는 이전1.23.3 배포와 동일하다.

PC: Windows11 Pro10.0.26200, 사용자 정상 Chrome154.0.8037.93. 이전 origin의 비인증 로컬 설정18개를 같은 PC 새 origin으로 복원하고 기존 Google 계정으로 새 로그인했다. 인증 쿠키/토큰은 복사하지 않았다. 같은 account key/Drive account/정확한 liked ID13개/root14폴더, sync pending/error 없음, active SW1.23.3 확인. 좋아요 UI13개 표시 후 실제47.576236초 MP4 카드 클릭으로 재생, 관측22.856wall초/22.856517media초/+685frames/native error 없음. 이는 짧은 재생 확인이며 장시간 검증을 새로 주장하지 않는다. 기존 사용자 앱 탭을 새 주소로 이동해 같은 연결/13좋아요/SW를 확인했으며 설정의 현재 origin screenshot을 저장했다.

Android: SamsungSM-F711N, Android15, 정상 Chrome154.0.8037.126. 기존 비인증 설정3개를 같은 기기 새 origin에 복원하고 새 로그인했다. 같은 account key/정확한13liked IDs/동일writer, sync pending/error 없음, root14폴더와 active SW1.23.3 확인. 실제 trusted touch로 좋아요/설정/뷰너 카드 조작,20,891,042바이트47.809887초 영상에서4wall초/3.901962media초/+97frames/native error 없음. 시간 이동 함수나 미디어 상태 직접 변경은 사용하지 않았다. 원래 Chrome process/tab은 작업 시작에 없어 새 주소의 유일한 working app tab을 남겼고 관련 없는 탭은 보존했다. 기기 설정 변경·forward 잔여 없음. 사람 손가락/iOS 검증은 아니다.

PC·Android 모두 origin별 쿠키가 새로 필요하다는 실제 로그인 흐름을 확인했다. 비인증 로컬 상태만 같은 기기 내 복원했고 원본 Drive 파일/기존 서버 인증 저장소/보안 정책/Notion 폐기/자동화PAUSED는 보존했다. 이전 workers.dev host는 최종 조회에서 DNS ENOTFOUND로 연결되지 않았다. 북마크는 새 주소로 바꾸고 기존 OS 홈 화면 앱은 새 주소에서 다시 설치해야 할 수 있다. iOS는 사용자가 새 주소에서 별도 실사용 검증한다.

## 보존한 실패와 한계

- Account subdomain PUT에 `allow-rename:1`을 누락해409/code10036. 이 실패를 gate하지 않고 새 PUBLIC_ORIGIN 배포를 진행한 실행 실수로 잠시 불일치가 있었다; 사용자에게 알렸고 [공식 Wrangler 변경 코드](https://github.com/cloudflare/wrangler-legacy/pull/1353/files)의 rename header 확인 후 PUT/readback 성공. 같은 배포에 새 label이 적용된 후 전체 served/실제 login 검증 통과. 이후 별도 재배포는 필요하지 않았다.
- 이름 변경 직후 첫 public fetch 실패는 원인 미확정. 이어 DNS와 현재 public 검증은 성공했으므로 특정 원인을 단정하지 않는다.
- 익명 auth 검사 producer의 same-origin 헤더/protocol 누락으로403을 받은 원본을 보존했다. 제품 보안을 낮추지 않고 실제 protocol 요청으로401/no-store를 확인했다.
- PC Google 로그인 warning page가 빈 DOM이었고 정상 reload 후 기존 권한 로그인 완료. 원인은 미확정. Android 경고 이후 이미 돌아온 로그인 전환의 정확한 버튼 입력은 입증되지 않으므로 모든 중간 로그인 클릭을 완료했다고 주장하지 않는다. 새 origin 인증·계정 동일성 자체는 확인됐다.
- PC liked IDs의 Set→JSON `{}` 및 Android 서로 다른 현재 폴더의 full-library count 비교는 검사 오류. PC baseline은 보존된 이전 cache에서 ID array로 정확히 읽고 실제 after array와 비교했다. Android는 같은계정/정확한13liked ID를 비교했다. 전체 라이브러리 동등성으로 확대하지 않았다. 추가 PC 관측의 존재하지 않는 `el.video` 참조도 DOM의 실제 video 관측으로 바로잡았으며 제품 오류로 기록하지 않는다.

Private receipts/screenshots/local-state backups는 workspace `maintenance/tools/address-change-20261004/`에만 보존한다. 쿠키/비밀키를 파일·stdout·Git에 저장하지 않았다. Public Git 기록은 요약과 필요한 release IDs만 담는다.

## Git 및 기존 Pages 진입점

main 병합/push 및 public-only Pages 갱신/최종 serving readback 진행 중. 완료 영수증은 이 절에 반영한다.

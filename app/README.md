# app/ — 페이지 코드

`index.html`이 아래 순서로 `defer` classic script를 불러옵니다. 모두 하나의 전역 스코프를 공유하므로, 다른 파일의 함수는 import 없이 그대로 호출합니다. 순서의 기준은 `scripts/public-files.cjs`이고, `scripts/app-scripts.cjs`가 그 목록에서 읽습니다. `index.html`, `sw.js`의 `SHELL_FILES`, 테스트 로더(`tests/app-loader.cjs`)가 같은 순서를 쓰는지 `tests/static.test.js`가 확인합니다.

| 파일 | 내용 |
|---|---|
| `core.js` | 공통 상수, 순수 도우미(계정 상태 병합, 재생 덱, 렌더 창, 버퍼 정책). `APP_VERSION`이 여기 있습니다. |
| `state.js` | `state`, `el`, 모듈 공유 변수 |
| `original-pin.js` | Q0 원본 고정 소유권, 카드 의도 prewarm, Q1 은퇴 |
| `diagnostics.js` | 재생 제스처·우선순위 공유 변수, 미디어 진단 추적 |
| `boot.js` | 시작(`init`), 요소·이벤트 연결, SW 등록, 앱 업데이트 |
| `auth.js` | SW 메시지, 세션 자격, 홈 화면 앱 인증 |
| `library-list.js` | 썸네일 추출 큐, 폴더 목록 페이지, 폴더 이동 |
| `library-navigation.js` | 라이브러리 뒤로가기 이력, 가장자리 제스처, 하위 폴더 탐색, 좋아요 보기, 경로 |
| `drive-api.js` | Drive 요청 소유권·재시도·자격 갱신 |
| `account-state.js` | 시청·좋아요 상태 캐시, appDataFolder 동기화, 시청 관찰 |
| `library-grid.js` | 미디어 그리드, 카드, 선택, 목록 요약 |
| `player-controls.js` | 플레이어 열기, 컨트롤, 탐색 감시, 트랙, 프레임 감시 |
| `player-navigation.js` | 재생 덱, 스와이프 전환, 터치 제스처, 키보드 |
| `playback-source.js` | 원본 재생 경로, TS/일반 재생, 미디어 오류 복구 |
| `original-buffer.js` | 임시 디스크(OPFS)·메모리 원본 보조 |
| `drive-actions.js` | Google 미리보기, 휴지통·이동·이름 바꾸기(검증된 Drive 작업) |
| `player-presentation.js` | 프레임 표시, 화질 표시, 로딩·오류 상태, 플레이어 닫기 |
| `session-ui.js` | 설정, 로그아웃, 설정·라이브러리 화면 전환, GIF 썸네일, 토스트, 형식 변환, 데모 |

규칙: 파일 최상위에서 즉시 실행하는 코드는 앞선 파일에 선언된 것만 참조합니다(함수 호이스팅은 파일 단위). 함수 본문 안의 참조는 실행 시점에 해석되므로 순서와 무관합니다. 각 파일은 `'use strict';`로 시작합니다. 새 파일을 추가하면 `scripts/public-files.cjs`, `index.html`, `sw.js`를 함께 갱신합니다.

# Decision Ledger — Drive Original

## D-001 · UI 이모지 전면 배제 및 단일 디자인 엔지니어링 규격 준수 — 2026-08-15 (User-confirmed)
사용자의 지적에 따라 드롭다운 옵션, 토스트 메시지, HUD 피드백, 버튼 라벨 등 모든 UI 텍스트에서 임의 이모지(🔀, ▶, 🔊 등)를 완전히 배제한다. 시각적 표현은 단일 패밀리의 정밀 SVG 벡터 아이콘과 Plus Jakarta Sans / JetBrains Mono 타이포그래피로만 구성하여 AI Slop 인상을 원천 차단한다.

## D-002 · 쇼츠 4방향 물리 제스처 트랜지션 및 백엔드 세션 격리 — 2026-08-15 (User-confirmed)
쇼츠 경험을 고도화하기 위해 단순 즉시 치환을 폐기하고 실시간 터치 드래그 감속 저항(Damping), 인터럽터블 스프링 스냅 복귀, 방향별 슬라이드 모션 트랜지션(W/S/상하: 쇼츠 무작위, A/D/좌우: 이전/다음)을 탑재한다. 빠른 연속 전환 시 이전 미디어의 HTTP 스트림 및 Blob 버퍼 요청을 `AbortController`로 즉각 중단하여 네트워크 대역폭 낭비와 레이스 컨디션을 방지한다.

## D-003 · 키보드 단축키 충돌 방지(WASD 제거) 및 상/하단 내비게이션 버튼 바인딩 강화 — 2026-08-15 (User-confirmed)
미디어 제어(재생 속도, 볼륨, 탐색 등)와의 키보드 단축키 충돌을 방지하기 위해 쇼츠 및 영상 넘김 관련 PC 키보드 단축키(WASD)를 제거한다. 대신 플레이어 상단바(이전/랜덤/다음) 및 하단 컨트롤바(이전/다음/랜덤) 버튼의 이벤트 전파 격리(`stopPropagation`), 캡슐화된 방향 인자 안전 보정(`typeof direction === 'string'`), 컨트롤 타이머 리셋을 완벽하게 검증하고 강화한다. 모바일 환경의 터치 스와이프 제스처는 계속 지원한다.

## D-004 · 미디어 파일 전환 시 상태(state.selected) 및 메타데이터 SSOT 동기화 — 2026-08-15 (User-confirmed)
이전/다음/랜덤 쇼츠 내비게이션 시 `openMediaSource(file)` 진입점에서 `state.selected = file` 및 플레이어 제목/코덱 노트/품질 뱃지 메타데이터를 즉각 갱신하도록 강제한다. 이를 통해 연속 클릭 시 인덱스 계산(`list.findIndex`)이 정상 누적되어 동일 영상이 반복 새로고침되는 결함을 원천 해결한다.

## D-005 · 모바일 Safe Area 전면 보정, SW Mime 스트림 초고속 가속 & 모달 전체 스와이프 확장 — 2026-08-15 (User-confirmed)
1. **모바일 짤림 방지**: iPhone Dynamic Island / Notch 및 Home Bar 영역에 맞춰 `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` 기반 100dvh 풀스크린 모바일 모달 레이아웃을 확립하고, 상단 뱃지와 파일명 래핑을 보정하여 짤림 0%를 보장한다.
2. **화질 판정 정밀화**: `getResolutionCategory`에서 `1280×710` 등 가로/세로 와이드스크린 해상도를 정확하게 `HD 720p (1280×710 · 원본 1:1)`로 판정 및 표시한다.
3. **SW 초고속 스트리밍 가속**: `sw.js`에서 Drive 원본 스트림 프록시 시 `Content-Type`을 실제 MIME으로 강제 교정하여 Safari/Chrome의 무거운 Blob 폴백 대기를 방지하고 0.1초 즉시 Range 스트리밍 재생을 보장한다.
4. **전체 영역 스와이프**: 비디오 영역뿐만 아니라 하단 메타데이터 카드 패널 영역을 터치하여 스와이프해도 동일하게 4방향 물리 제스처 및 슬라이드 트랜지션이 작동하도록 제스처 리스너 타겟을 확장한다.

## D-006 · 설정창 잔존 이모지 완전 제거, 모바일 동영상 화면 극대화 & 썸네일 프리패치 가속 — 2026-08-15 (User-confirmed)
1. **설정창 타이포 정돈**: 업데이트 확인 문구의 잔존 이모지(`✅`)를 전면 제거하고 단정하고 깔끔한 JetBrains Mono / Plus Jakarta Sans 타이포그래피로 통일한다.
2. **모바일 동영상 화면 극대화 & 중복 메타데이터 정리**: 상단바에 이미 존재하는 "재생 화질", "전송 모드" 중복 카드를 하단 패널에서 제거하고, 모바일에서 비디오 스테이지를 `flex: 1; height: auto`로 확장하여 세로 쇼츠 및 영상이 화면 전체를 쾌적하게 채우도록 개편한다. 하단 패널은 콤팩트한 2열 뱃지(해상도, 파일 크기·포맷)로 최소화한다.
3. **썸네일 프리패치 및 가속**: `lh3.googleusercontent.com` preconnect/dns-prefetch 사전 연결 및 상위 12개 카드 `loading="eager"` / `fetchPriority="high"` 즉시 디코딩을 적용하여 그리드 썸네일 로딩 속도를 극대화한다.

## D-007 · 모바일 유튜브 쇼츠형 UI 풀스크린 리뉴얼, 직교 축 고정 직선 제스처 & 썸네일 가속 — 2026-08-16 (User-confirmed)
1. **모바일 쇼츠 풀스크린 UI 리뉴얼**: 모바일 환경에서 파일 클릭 시 하단 카드 패널을 완전 배제하고 비디오가 100dvh 전체 화면을 꽉 채우는 숏폼 플랫폼(유튜브 쇼츠 / 틱톡 스타일) 풀스크린 오버레이 UI로 전면 개편한다. 불필요한 메타데이터는 삭제하고 상단 단일 프로스티드 글래스 캡슐 뱃지에 `전송 방식 · 해상도 (원본 1:1 무손실 여부)`만 가장 깔끔하고 안 거슬리게 노출한다.
2. **직교 축 고정(Axis-Locked) 직선 제스처**: 360도 대각선 자유 이동을 차단하고, 스와이프 시작 시 주 방향을 감지하여 X축(좌/우: 이전/다음) 또는 Y축(상/하: 랜덤 쇼츠)으로만 단일 축을 고정한 채 직선 레일로 이동하도록 물리 엔진을 고도화한다.
3. **모바일 썸네일 로딩 속도 극대화**: 모바일 2열 그리드 기준 상위 16개 카드 `loading="eager"`, 상위 8개 카드 `fetchPriority="high"` 즉시 비동기 디코딩 및 CSS `content-visibility: auto`를 적용하여 GPU 래스터라이제이션 병목을 원천 해소한다.

## D-008 · 캔버스 비디오 프레임 추출 썸네일 엔진, 숏폼 앰비언트 UI & 무한 스크롤 탑재 — 2026-08-16 (User-confirmed)
1. **비디오 캔버스 1프레임 썸네일 추출 & 캐시**: Google Drive 썸네일이 없거나 차단(403/CORS)되어 검은 박스로 남던 결함을 원천 해결하기 위해, 서비스 워커의 초고속 Range 스트림을 이용해 첫 프레임(0.1s)을 오프스크린 캔버스로 자동 캡처하여 100% 빈틈없는 썸네일을 보장한다.
2. **모바일 숏폼 앰비언트 UI & 하단 데스크톱 버튼 바 완전 제거**: 모바일 환경에서 조잡한 10개 데스크톱 버튼 바를 완전히 제거하고, 가로 비디오 재생 시 상하 블랙 바에 시네마틱 블러 앰비언트 백드롭을 적용하며, 3px 초슬림 프로그레스 라인과 파일명 오버레이를 배치한다.
3. **무한 스크롤(IntersectionObserver) & 백그라운드 프리패치**: 수동 버튼 클릭을 제거하고 스크롤 하단 도달 시 자동으로 다음 페이지를 연쇄 로드하며, 첫 페이지 로드 후 즉시 다음 100개를 선제 프리패치하여 끊김 없는 탐색을 실현한다.

## D-009 · CSS 모바일 미디어 쿼리 문법 오류 수정, 3:4 숏폼 썸네일 비율 & 큐 기반 캔버스 추출기 — 2026-08-16 (User-confirmed)
1. **CSS 모바일 숏폼 뷰어 문법 완전 복구**: `styles.css` 1939번 줄 누락된 닫는 중괄호 `}`를 복구하여 모바일 100dvh 풀스크린 뷰어, 데스크톱 버튼 바 완전 숨김(`display: none !important;`) 및 `.mobile-shorts-overlay`가 100% 정상 적용되도록 수정한다.
2. **3:4 숏폼 썸네일 비율(반짤림 해결)**: 기존 16:9 가로 고정 비율로 인해 세로 쇼츠 영상의 상하 65%가 잘려 나가던 현상을 해결하기 위해, 카드 비주얼을 숏폼 최적 비율인 `aspect-ratio: 3 / 4;`로 전면 개편하고 `object-fit: cover; object-position: center;`를 적용하여 온전한 썸네일을 표시한다.
3. **2-동시성 썸네일 추출 큐 (iOS Safari 디코더 한도 초과 방지)**: 20~50개 비디오 요소가 동시 생성되어 iOS Safari 하드웨어 디코더(최대 4~6개)를 초과해 검은 화면이 되던 결함을 해결하기 위해, 최대 2개씩 순차 처리하는 `ThumbnailQueue`를 구축하고 즉시 리소스를 해제한다.

## D-010 · v1.7.2 전수검사 기반 결함 일괄 패치 — 2026-08-16 (User-confirmed)
1. **SW 토큰 폴백 경로 복구**: `sw.js`의 클라이언트 토큰 요청 메시지가 `REQUEST_TOKEN`으로 발송되나 `app.js`는 `TOKEN_REQUEST`만 수신하던 타입 불일치를 해소하여, SW 재시작 후 첫 미디어 요청이 1.5초 대기 후 401로 실패하던 잠복 결함을 제거한다.
2. **리소스키 보호 파일 1차 스트림 지원**: 스트림 프록시가 `resourceKey` 쿼리 파라미터를 `X-Goog-Drive-Resource-Keys` 헤더로 상류에 전달하도록 보완하여, 링크 공유 보호 파일이 불필요하게 Blob 폴백으로 이탈하던 현상을 방지한다.
3. **iOS 100dvh 적용 보장**: `height: 100dvh` 뒤에 `height: 100vh`가 재선언되어 후행 규칙으로 dvh가 무시되던 선언 순서를 교정(`vh` → `dvh`)한다.
4. **모바일 숏폼 진행바 시크 탑재**: `pointer-events: auto`인데 핸들러가 없어 장식으로만 존재하던 하단 3px 진행바에 포인터 드래그 시크를 바인딩하고 누락된 `id`를 보완한다.
5. **썸네일 엔진 강화**: `loadeddata`(0초 프레임 = 검은 화면)에서 조기 캡처되는 경쟁을 차단해 0.1s seek 완료 후에만 캡처하도록 가드하고, 생성 썸네일 캐시를 240항목 LRU로 상한하며, 큐 대기 중 렌더링에서 사라진 카드는 스킵한다.
6. **모션·접근성 표준 준수 (review-animations 감사)**: `transition: all` 제거, `prefers-reduced-motion` 블록 신설, 카드 호버 리프트·재생 오버레이를 `@media (hover: hover) and (pointer: fine)`으로 게이팅(터치 끈적 호버 제거), 중복 `@keyframes spin` 통합, Firefox 볼륨 슬라이더 썸 스타일 추가.
7. **PWA 정합화**: manifest `theme_color`/`background_color`를 라이트(`#f7f8fb`)에서 앱 실제 배경(`#0b0d14`)으로 교정하고, `apple-mobile-web-app-capable`·`black-translucent` 상태바·`apple-touch-icon` 링크를 추가해 iOS 홈 화면 설치 시 전체화면·세이프에어리 정합성을 확보한다.
8. **데스크톱 플레이어 패딩 복구**: `env(x, 12px)` 폴백 오용(비노치 기기에서 0px)을 `max(12px, env(x))`로 교정한다.

## D-011 · v1.8.0 폴더 탐색·삭제·숏폼 UX 및 디자인 개편 — 2026-08-16 (User-confirmed)
1. **폴더 단위 브라우징**: 전체 드라이브 스캔을 폐지하고 현재 폴더(`'root' in parents` 또는 폴더 ID) 기준으로 폴더+미디어를 조회한다. 브레드크럼 칩 내비게이션(임의 깊이 점프 지원), 상위 폴더 복귀 버튼, 폴더 카드(폴더 우선 정렬 `orderBy: 'folder,modifiedTime desc'`), 진행 방향별 슬라이드 전환(240ms ease-out)을 탑재한다. 페이지 크기를 Drive API 상한인 1000개로 상향하고 무한 스크롤+선제 프리패치로 사실상 전체 로딩 제한을 제거한다.
2. **휴지통 삭제 (쓰기 권한)**: OAuth 범위를 `drive.readonly`에서 `https://www.googleapis.com/auth/drive`로 상향하고, `files.update {trashed:true}`로 삭제(30일 복구 가능)를 수행한다. 플레이어 탑바/컨트롤바/모바일 액션 레일에서 접근하며 확인 다이얼로그를 거친다. 403 발생 시 OAuth 동의 화면에 drive 범위를 추가하는 5단계 가이드 다이얼로그를 즉시 제공한다.
3. **모바일 숏폼 UX**: TikTok/Instagram 패턴의 우측 글래스 액션 레일(삭제·PiP·Drive), 좌우 에지 더블탭 ±10초 시크(단일 탭은 280ms 지연 재생 토글로 구분, 합성 click 이중 발방 방지), 하단 3px 진행바 드래그 시크(18px 히트 에어리어)를 탑재한다.
4. **영상 화면 맞춤**: 모바일에서 video/img를 `width/height:auto + max-100%` 박스가 종횡비를 감싸는 방식으로 변경해 요소 박스=시각 콘텐츠가 되도록 교정하고 iOS 100dvh(v1.7.2 교정)와 함께 전면 맞춤을 보장한다.
5. **디자인 시스템 개편 (emil-design-eng + taste-skill 기준)**: 라디우스 스케일 토큰화, 딥 캔버스 팔레트(#07090e), 타이포그래피 스케일 강화(라이브러리 헤더 clamp), 전역 스크롤바·셀렉션 스타일, body 인라인 스타일 제거, 카드 hover 게이팅 유지 및 애니메이션 토큰 일관화.
6. **브레드크럼 중복 결함 수정**: 폴더 진입 시 스택에 루트가 중복 포함되어 "내 드라이브 / 내 드라이브 / ..."로 표시되던 결함을 수정(루트는 항상 첫 조각으로 렌더링, 스택에서 제외).

## D-012 · v1.9.0 모바일 화면 맞춤 근본 수정·하위 폴더 재귀 로딩·액션 칩 재설계·재생 즉시 시작 — 2026-08-16 (User-confirmed)
1. **모바일 하단 공백 근본 원인 해소**: 베이스 `.media-stage`의 `max-height: 72vh`가 ≤600px 오버라이드에서 리셋되지 않아, `height:100%`(100dvh)를 지정해도 스테이지가 72vh에서 잘리고 하단 ~28%(iPhone 16 Pro Max ≈ 260px)가 죽은 검은 공백으로 남던 결함을 `min-height:0; max-height:none` 리셋으로 근본 해결한다. 사용자 스크린샷 실증 + 브라우저 rect 수학(레일 bottom 608 ≈ 844×0.72)으로 원인을 특정했다.
2. **앰비언트 블러 항시 채움**: 레터박스(가로 영상·비-19.5:9 화면)가 검은 공백으로 보이지 않도록 앰비언트 백드롭을 모든 미디어에서 활성화한다. 썸네일 우선, 비디오는 loadeddata에서 360px 프레임 캡처 폴백, 이미지는 로드 src 폴백. 모바일에서 `blur(64px) brightness(0.42)` 강화.
3. **하위 폴더 전체 재귀 로딩 (Deep Scan)**: Drive API가 재귀 쿼리를 지원하지 않으므로, 토글 ON 시 전체 드라이브(폴더+미디어, parents 필드 포함, 1000개/페이지 전체 페이지네이션)를 1회 수집해 트리 인덱스(foldersByParent/mediaByParent)를 구축하고, 현재 폴더에서 BFS로 서브트리 미디어를 즉시 필터링한다. `about.rootFolderId`로 'root' 별칭과 실제 루트 ID 불일치를 해소한다. 하위 폴더 출신 파일에 출처 폴더 칩 표시, 폴더 이동 시 캐시 재필터링(네트워크 0회), 새로고침 시 캐시 무효화, 삭제 시 캐시 정화.
4. **모바일 액션 칩 재설계**: 우측 부유 레일(삭제·PiP·Drive 상시 노출로 영상 시청 방해)을 폐지. 하단 파일명 행에 기본 `전체화면`(솔리드 화이트 칩) + `⋯`만 노출하고, ⋯ 탭 시 삭제(레드)·PiP·Drive 가로 행이 240ms ease-out으로 펼쳐지며 5초 후 자동 접힌다(미디어 전환·플레이어 종료 시에도 즉시 접힘). 사용자 제안(파일명과 같은 줄 가로 배치)을 채택했다.
5. **재생 즉시 시작 + 포스터 프레임**: 카드 탭(사용자 제스처)에서 플레이어 열림과 동시에 `pendingPlay`를 설정해 canplay 도달 즉시 재생을 시작하고, 썸네일을 `poster`로 선제 세팅해 스트림 도착 전에도 첫 화면이 즉시 렌더링되도록 한다(loadeddata에서 poster 제거). 기존 원본 화질 1:1 Range 스트리밍은 그대로 유지.
6. **검증**: node --check/JSON/CSS 중괄호 균형 + bindElements↔HTML id 교차검사 128개 통과. 브라우저 GUI(iPhone 16 Pro Max 440×956 뷰포트, 데모 모드): 하위 폴더 포함 토글 → 루트 미디어 2→6개·출처 칩 4개 정확, 폴더 진입 시 3개(중첩 포함), 플레이어 하단 UI 최하단 배치(전체 화면 확정), ⋯ 확장 행 3칩 확인, 데스크톱 1280×800 그리드 무회귀.

## D-013 · v1.10.0 영상 회전·폴더 이동·폴더 스트립 개편·연속 재생·선제 프리페치 — 2026-08-16 (User-confirmed)
1. **영상 90도 회전 버튼**: 모바일 하단 칩의 `전체화면` 텍스트 라벨을 제거해 아이콘 온리로 축소하고, 그 자리에 회전 칩을 추가했다. UI는 고정한 채 영상만 시계 방향 90도 회전하며 재탭으로 원복한다. 구현은 개별 transform 속성 `rotate: 90deg`(transform과 독립 합성) + 제약 스왑(`max-width:100dvh; max-height:100vw`)으로, 드래그·스냅백·슬라이드 전환 애니메이션(transform)과 충돌 없이 동작한다. 이미지에서는 회전 칩 숨김.
2. **폴더 이동 (⋯ 메뉴 `이동`)**: Drive API `files.update?addParents&removeParents`로 이동한다. 다이얼로그는 전체 폴더 목록(폴더만 1000개/페이지 수집, 딥스캔 캐시 재사용)을 BFS 경로 트리로 표시하고, 현재 위치 비활성화 + 검색 + 깊이 들여쓰기 + 선택 강조를 제공한다. 루트 이동은 `about.rootFolderId`로 별칭을 해소한다. 403 시 기존 권한 가이드 재사용. 데모 모드 시뮬레이션 지원.
3. **PC 폴더 스트립 분리 개편**: 미디어 썸네일 카드와 크기가 같아 뒤섞여 보이던 폴더 카드를 폐지하고, 콤팩트 가로 행(아이콘+이름+폴더 라벨+셰브론, 48px)의 `folder-strip` 그리드(PC 2열+)를 미디어 그리드 위에 분리 배치했다. 폴더 전환 애니메이션은 그리드·스트립 동시 적용.
4. **삭제/이동 후 연속 재생**: 삭제·이동 모두 플레이어를 유지하고, 제거 전 재생 순서를 capture해 다음 영상으로 슬라이드 전환+자동 재생한다(`playNextAfterRemoval`). 남은 미디어가 없을 때만 플레이어를 닫는다. 목록·딥스캔 캐시·셔플 맵을 즉시 정화한다.
5. **미리보기 항상 자동재생**: 카드 탭·탐색·삭제/이동 전환 모두 `pendingPlay`를 설정해 canplay 도달 즉시 재생한다. 제스처 활성 창 이탈로 첫 시도가 거부되면 350ms 후 1회 재시도한다.
6. **뷰포트 선제 프리페치 (로딩 단축)**: IntersectionObserver(rootMargin 150%)로 뷰포트에 근접한 영상 카드의 첫 512KB를 Range 선제 페치한다(동시 2개, 세션당 1회, saveData 모드 비동작). SW의 max-age 응답이 브라우저 HTTP 캐시에 남아 재생 첫 구간이 즉시 이어지고 TCP/TLS·인증 경로가 예열된다. 미디어를 Cache Storage에 영구 보관하지 않는 기존 원칙은 유지.
7. **검증**: 정적 스위트(JS/JSON/CSS/id 교차 139개) 통과. 브라우저 GUI: PC 폴더 스트립 분리(2행+미디어 그리드), 모바일 하단 칩(회전·전체화면 아이콘 온리·⋯), ⋯ 확장 4칩(삭제/이동/PiP/Drive), 이동 다이얼로그(경로 트리·현재 위치 비활성), 이동 실행 후 플레이어 유지+다음 파일 자동 전환(서울 야간 산책→한강 원본 사진), 삭제 실행 후 연속 재생(강의 녹화→여행 클립 HEVC) 확인.

## D-014 · v1.10.1 에지 탭 몰입 모드·중앙 탭 재생 전용화·일시정지 메시지 제거 — 2026-08-16 (User-confirmed)
1. **일시정지/재개 피드백 메시지 제거**: `togglePlayPause()`의 `showPlayerFeedback('PLAY'/'PAUSE')` 호출을 삭제했다. 상단 좌측 화질 캡슐 뱃지와 겹쳐 안 보이던 메시지를 위치 이동이 아니라 출력 자체로 폐기했으며, 정지 상태 신호는 기존 중앙 플레이 버튼(`stage-center-btn`)이 단독 담당한다. 시크·볼륨·속도 등 다른 피드백은 유지.
2. **에지 탭 몰입 모드**: 탭 존 판정을 X축 1D에서 2D로 확장했다. 스테이지 중앙 30~70% 박스 밖(위·아래·좌·우 가장자리)을 탭하면 `player-modal.immersive`를 토글해 상단 뱃지·하단 파일명/칩 행·3px 진행바가 180ms ease-out으로 페이드아웃되고 앰비언트 블러 백드롭이 꺼지며 비영상 영역이 순정 `#000`으로 전환된다. 해제 시 UI는 240ms ease-out으로 복귀, 앰비언트는 기존 0.6s 페이드 유지(비대칭). 좌·우 에지는 기존 더블탭 ±10초 시크와 공존한다(280ms 판별 창 뒤 단일 탭 몰입 토글). 위·아래 에지는 더블탭 제스처가 없어 즉시 토글.
3. **중앙 탭 재생/일시정지 전용화**: 중앙 박스 탭은 280ms 지연 없이 즉시 `togglePlayPause()`만 실행한다. 몰입 모드 중에도 정지 시 중앙 플레이 버튼은 표시된다.
4. **수명 주기**: 플레이어 열기(`openPlayer`)·닫기(`closePlayer`) 시 몰입 해제, 스와이프 미디어 전환 중에는 유지해 연속 시청 몰입을 보존한다. 몰입 진입 시 ⋯ 확장 행을 접어 해제 시 잔여 UI가 남지 않게 한다. `prefers-reduced-motion`은 기존 전역 블록이 트랜지션을 즉시 스냅 처리.

## D-015 · v1.10.2 이동 다이얼로그 순수 폴더명·iOS 입력창 확대 차단·랜덤 전수 보장 — 2026-08-16 (User-confirmed)
1. **iOS 입력창 자동 확대 차단**: iOS Safari는 font-size 16px 미만 텍스트 입력창에 포커스될 때 뷰포트를 자동 확대한다(캐노니컬 동작). ≤600px 블록에서 `input[type="text"], input[type="search"]`를 16px로 고정해 폴더 이동 검색·라이브러리 검색 등 모든 입력창에서 확대를 원천 차단했다. 뷰포트 meta 조작(maximum-scale)은 접근성 훼손으로 기각하고 폰트 고정만 사용.
2. **이동 다이얼로그 순수 폴더명 표시**: 행마다 "폴더명 + 경로(부모 / 조상)" 2열로 표시되던 기존 렌더링을 폐지했다. 행은 폴더명만 표시하고 계층은 깊이 들여쓰기(`--depth`×16px)로만 전달하며, 현재 위치는 pill 배지(`.move-folder-current`, "현재 위치")로 표시한다. 검색 필터도 이름 매칭으로만 동작. `.move-folder-path` 룰·요소·참조 전부 삭제.
3. **랜덤 전수 보장 (랜덤 정렬·랜덤 쇼츠)**: 기존 랜덤은 `state.files`(무한 스크롤로 로드된 부분집합)만 대상이어서, 1000개 초과 폴더에서 미로드 페이지가 랜덤에서 누락됐다. 일반 모드에서 `nextPageToken`이 남아 있으면 정렬 변경(랜덤)·`playRandomFile` 모두 `ensureAllPagesLoaded()`로 잔여 페이지를 전부 적재한 뒤 수행한다(가드 100회, 진행 중 로드 120ms 폴링). 딥스캔·데모는 이미 전수가 로드되어 no-op. 대상 스코프(현재 폴더/딥스캔 서브트리)는 기존처럼 유지.
4. **검증**: 정적 스위트(node --check 2종·JSON·CSS 중괄호 0·move-folder-path 3파일 0참조·ensureAllPagesLoaded 3곳 연결) 통과. Edge 헤드리스 모바일(440×956, 데모) GUI 21/21: 이동 다이얼로그 4행 순수 폴더명 목록 정확, " / "·"최상위" 잔여 0, 현재 위치 배지 1개(내 드라이브 행·비활성화), 도쿄 깊이 2 들여쓰기, 검색 "도쿄" 1건/불일치 빈 상태/해제 복원, 검색창 계산 font-size 16px, 이동 실행 후 플레이어 유지+다음 파일(한강 원본 사진) 자동 전환, 콘솔 에러 0.

## D-016 · v1.11.0 회전 제스처 축 치환·이동 트리 전수 보장·버튼 피드백·딥스캔 중지 — 2026-08-16 (User-confirmed)
1. **영상 회전 시 스와이프 제스처 및 슬라이드 전환 축 치환**: 90도 회전 상태(`state.videoRotated`)에서는 요소 좌표계(X/Y)가 화면 기준과 뒤바뀌어(요소 X→화면 아래, 요소 Y→화면 왼쪽), 드래그 변위를 `tx = state.videoRotated ? 0 : dragX; ty = state.videoRotated ? -dragX : 0;` (Y축: `tx = state.videoRotated ? dragY : 0; ty = state.videoRotated ? 0 : dragY;`)로 치환하고, CSS 전환 애니메이션 키프레임(`.media-stage video.is-rotated.anim-slide-*`)을 화면 기준 방향으로 재매핑하여 회전 상태에서도 화면 기준 상하좌우 스와이프 제스처가 완벽하게 일치하도록 구현했다.
2. **폴더 이동 다이얼로그 전체 폴더 트리 표시 보장 (고아 폴더 최상위 승격 & 루트 재해소)**: 루트 별칭 불일치(`root` vs 실제 `rootFolderId`) 또는 공유 드라이브 환경에서 직계 매칭이 빠지는 경우, 부모가 폴더 인덱스에 없는 고아 폴더를 전부 루트 직계로 자동 승격(`pushIfNew(folder, 1)`)하여 어떤 폴더 구조에서도 전체 트리가 100% 누락 없이 표시되도록 보장했다.
3. **버튼 눌림 플래시(`flashPressed`) & 작업 진행 중 로딩 스피너(`setButtonLoading`)**: 삭제/이동 취소·확인 및 딥스캔 중지 버튼 클릭 시 `:active`의 순간 소멸 한계를 보완하는 240ms 원샷 플래시 애니메이션(`flash-pressed`)을 제공하고, 삭제/이동 실행 중 버튼 내 스피너 + 라벨(`삭제 중…`, `이동 중…`)로 전환하여 시각적 확신을 제공한다.
4. **하위 폴더 포함(딥스캔) 수집 중지 버튼(`deepScanStopBtn`)**: 대규모 드라이브에서 딥스캔 도중 사용자가 즉시 취소할 수 있도록 `AbortController` 기반 중지 버튼을 탑재하여 부분 데이터를 안전하게 폐기하고 일반 폴더 뷰로 즉시 복귀한다.


## D-017 · v1.12.0 폴더 이동 root ID 수정 + OAuth 토큰 안정성 근본 패치 — 2026-08-16 (User-confirmed)
1. **폴더 이동 다이얼로그 근본 버그 수정 — 잘못된 API 엔드포인트 교체**: `ensureFolderIndex()`와 `ensureTreeCache()`에서 루트 폴더 ID를 해소하기 위해 `about?fields=rootFolderId`를 호출했으나, 이 필드는 Drive API v3에 존재하지 않아 `state.rootFolderId`가 항상 미해소 상태로 남았다. `GET /files/root?fields=id` 엔드포인트를 사용하는 `resolveRootFolderId()` 헬퍼로 교체하여 실제 루트 ID를 올바르게 해소한다.
2. **OAuth 토큰 자동 갱신 안정성 근본 강화**: (a) `driveFetch()`에 401 응답 시 `tryQuietTokenRefresh()`로 자동 1회 토큰 갱신 후 재시도. (b) `visibilitychange`에서 포그라운드 복귀 시 토큰 잔여 시간 즉시 검사하여 만료/임박 시 자동 갱신. (c) `scheduleTokenRenewal()`을 10분 전 1차 갱신 + 3분 전 2차 재시도로 공격적 보강. (d) `MEDIA_AUTH_REQUIRED` 수신 시 즉시 `clearToken()` 대신 백그라운드 갱신 우선 시도.
3. **토큰 교체 시 folderIndex 캐시 무효화**: `handleTokenResponse()` 성공 시 `state.folderIndex = null`로 무효화하여, 다른 계정의 토큰이 교부된 경우에도 올바른 폴더 트리를 재구축한다.

## D-018 · v1.13.0 Apple iOS 리퀴드 글라스(Liquid Glass) & 글라스모피즘 UI 전면 개편 — 2026-08-16 (User-confirmed)
1. **Apple Liquid Glass 머티리얼 & 루미너스 앰비언트 메시**: 불투명하고 단조로운 기존 표면을 폐기하고, 다층 굴절 글라스 필터(`backdrop-filter: blur(28px) saturate(210%) contrast(104%)`)와 상단 림 반사광(`inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)`), 0.5px~1px 초미세 반투명 보더(`rgba(255, 255, 255, 0.12)`)를 전면 도입했다. 배경에 미세한 다크 메시 글로우(`radial-gradient`)를 배치하여 유리 뒤에서 은은하게 빛이 투과되는 물리적 공간감을 부여했다.
2. **이중 베젤 (Doppelrand) 동심원 아키텍처**: 셋업 콘솔 카드, 미디어 카드, 모달 다이얼로그에 외곽 글래스 트레이 + 내부 코어 컨테이너의 동심원(Concentric) 곡률 구조를 적용하여 견고하고 정밀한 하드웨어적인 감각을 완성했다.
3. **플로팅 아일랜드 UI & 유체 물리 햅틱 인터랙션**: 상단바(Topbar), 검색 및 필터 툴바, 브레드크럼, 모바일 하단 액션 칩을 플로팅 글래스 아일랜드로 전면 리모델링했다. 모든 인터랙티브 요소에 Apple 식 감속 커브(`cubic-bezier(0.32, 0.72, 0, 1)`) 및 햅틱 프레스 스케일(`:active { transform: scale(0.96); }`)을 적용했다.

## D-019 · v1.12.1 디자인 패치 롤백 (사용자 확인 — v1.12.0 UI 복원) — 2026-08-16 (User-confirmed)
1. **디자인 패치 롤백 및 기존 UI 복원**: 사용자의 "디자인 패치 롤백 해. 저번이 났다." 지시에 따라 v1.13.0 리퀴드 글래스 변경사항을 롤백하고 v1.12.0의 검증된 UI 스타일시트(`styles.css`)로 즉시 복원했다.
2. **핵심 기능성 패치 유지**: v1.12.0에서 완결된 폴더 이동 root ID API 정상화(`GET /files/root?fields=id`), OAuth 토큰 401 자동 갱신 재시도, 모바일 포그라운드 복귀 즉시 토큰 보정(`visibilitychange`), 10분 전 선제 갱신 스케줄러 기능은 100% 온전하게 유지된다.

## D-020 · v1.13.0 Apple 순정 앱(Files / Photos 수준) 전면 리디자인 — 2026-08-16 (User-confirmed)
1. **Apple iOS 18 시스템 디자인 토큰 전면 도입**: AI 생성물 특유의 슬롭(엉성한 그라디언트, 이모지 버튼 등)을 완전히 배제하고, Apple iOS 18 Dark 모드 순정 시스템 팔레트(`systemBackground: #000`, `secondarySystemBackground: #1c1c1e`, `tertiarySystemBackground: #2c2c2e`, `label: #fff`, `secondaryLabel: rgba(235,235,245,0.6)`, `separator: 0.5px hairline`, `systemBlue: #0a84ff`)와 SF Pro 타이포그래피 스케일(Large Title 34px, Title, Headline, Body 17px, Caption)을 적용했다.
2. **Navigation Bar Large Title 스크롤 트랜지션**: 라이브러리 상단의 34px Bold 대형 타이틀이 스크롤 다운 시 상단바로 부드럽게 축소 축약되는 iOS 네이티브 내비게이션 동작을 구현했다.
3. **Apple Files Inset Grouped 폴더 리스트 & Photos 1:1 Squircle 미디어 그리드**: 폴더 브라우징을 Inset Grouped 리스트(16px 라운딩, 0.5px 헤어라인, SF chevron)로 개편하고, 미디어 타일을 1:1 정방형 스퀴클 비율로 리뉴얼하며 비디오 재생 시간(mm:ss) 및 원본 포맷 배지(4K UHD/FHD/HEVC)를 탑재했다.
4. **Apple Native 세그먼트 컨트롤 & 햅틱 모션**: 물리 스프링 커브(`cubic-bezier(0.32, 0.72, 0, 1)`) 기반 슬라이딩 세그먼트 컨트롤과 모든 인터랙티브 요소에 `:active { transform: scale(0.97); }` 프레스 모션을 적용했다.

## D-021 · v1.13.1 PC 플레이어 재설계·모바일 숏폼 복원·검색바 레이아웃 수정 — 2026-08-16 (User-confirmed)
1. **PC 영상 플레이어 뷰 클린 재설계 (중복 오버레이 제거)**: 데스크톱 화면(>= 769px)에서 모바일 숏폼 오버레이(`.mobile-shorts-overlay`) 및 10초 리플 힌트를 완전히 숨겨(`display: none !important`), 파일명 2중 노출 및 우측 하단 모바일 칩 난립 문제를 원천 해결했다. 상단 캡슐 바 + 중앙 플로팅 글래스 컨트롤러만 깔끔하게 노출한다.
2. **모바일 숏폼 뷰어 v1.12.1 완벽 복원**: 모바일 환경(<= 768px)에서는 데스크톱 컨트롤러를 완전히 숨기고, v1.12.1의 검증된 100dvh 모바일 숏폼 오버레이(상단 프로스티드 캡슐 + 하단 1줄 파일명 및 36px 액션 칩 + 3.5px 화이트 프로그레스 바)로 100% 복원했다.
3. **모바일 툴바 Flex 왜곡 버그 수정**: 모바일 세로 배치 시 `.search-box`의 `flex-basis: 180px`로 인해 높이 180px의 빈 공간이 발생하고 돋보기 아이콘이 중앙으로 밀려나던 버그를 `height: 38px`, `flex: none !important; width: 100% !important;`로 교정했다.
4. **Emil Kowalski 8pt 광학 정렬 및 대칭성 강화**: 상단 헤더, 브레드크럼, 툴바, Inset Grouped 폴더 리스트 간의 여백을 8pt 단위로 정렬하고 터치 반응 모션을 표준화했다.

## D-022 · v1.13.2 PC 마우스 인터랙션·모바일 숏폼 100% 원본 복원·잔상 근본 제거 — 2026-08-16 (User-confirmed)
1. **PC 재생창 마우스 유휴 시 UI/커서 자동 숨김 & 4개 핵심 버튼 정돈**: 마우스 정지 2.5초 후 상단바, 하단 컨트롤러, 마우스 커서(`cursor: none`)가 완전히 페이드아웃되는 `controls-idle` 시스템을 구축했다. 상단 우측 버튼은 중복을 제거하고 `이전 영상`, `랜덤 영상(쇼츠)`, `다음 영상`, `전체화면` 4개와 닫기 버튼만 슬림하게 남겼다.
2. **모바일 숏폼 UI v1.12.1 원본 100% 복원**: 깃허브 원본 커밋(`51a3b30`)의 CSS/JS 모바일 쇼츠 규칙을 그대로 이식하여 100dvh 풀스크린, 상단 프로스티드 글래스 캡슐, 하단 1줄 파일명 + 34px 액션 칩(`회전`, `전체화면`, `⋯ 더보기`/`삭제`/`이동`/`PiP`/`Drive`), 3.5px 화이트 프로그레스 바로 완벽 복원했다.
3. **미디어 전환 시 섬네일/비디오 잔상 및 화면 전환 플리커 근본 제거**: 파일 변경 시 이전 미디어 객체를 즉시 purge(`removeAttribute('src'); load();`)하고, 새 비디오 `loadeddata`/`canplay` 수신 시 160ms 부드러운 페이드인(`is-ready`)으로 크로스페이드 처리하여 잔상 0%를 달성했다.

## D-023 · v1.13.3 긴급 버그 수정 (영상 재생/자동로그인 복구, PC 구분선 정상화, 숏폼 뷰포트 밀착) — 2026-08-16 (User-confirmed)
1. **JS 이벤트 리스너 null 참조 에러 해결 (재생/자동로그인 복구)**: 상단바 버튼 정리 과정에서 제거된 `pipButton`의 리스너 호출부(`el.pipButton.addEventListener`)에서 발생하던 TypeError 런타임 크래시를 전수 null 가드로 방어하여, `init()`의 자동 로그인(`loadSavedToken()`) 및 미디어 스트리밍이 즉각 정상 작동하도록 복구했다.
2. **PC 폴더 구분선 서브픽셀 헤어라인 정상화**: `height: 0.5px`의 서브픽셀 반올림 누락으로 PC에서 격행으로 나타나던 구분선을 `.folder-row`의 직접 `border-bottom: 1px solid rgba(84, 84, 88, 0.35);`로 대체하여, 모든 행마다 100% 균일하고 선명한 헤어라인을 보장했다.
3. **모바일 숏폼 뷰포트 밀착 & 10초 리플 힌트 격리**: `.seek-hint`에 기본 절대 위치(`position: absolute; opacity: 0; pointer-events: none;`)를 부여하여 로딩 텍스트와의 겹침 현상(`10초10초원본...`)을 완전히 차단하고, 100dvh 풀스크린 모달 맞춤을 정밀화했다.

## D-024 · v1.13.4 모바일 숏폼 정밀 최적화·Apple Inset 구분선 롤백·모바일 줌 완전 잠금 — 2026-08-16 (User-confirmed)
1. **모바일 숏폼 정밀 최적화 & 10초 리플 힌트 정상화**: `.seek-hint`의 `.active` 클래스 스타일을 연동하여 더블 탭 시에만 부드럽게 나타나도록 교정했다. 상단 화질 배지는 11px 초슬림 글래스 캡슐로 축소하고 불필요한 패딩을 줄였으며, 하단 파일명(14px Bold)과 액션 칩(32px)의 여백을 밀착 정돈했다.
2. **Apple Inset Grouped 정통 파일 구분선 롤백**: 폴더 아이콘 뒤쪽(텍스트 시작점 `left: 52px`)부터 우측 끝(`right: 0`)까지 이어지는 정통 인셋 구분선(`height: 1px; background: rgba(84, 84, 88, 0.35);`)을 복원하여, 매 행마다 100% 균일하고 선명한 1px 인덴트 헤어라인을 보장했다.
3. **모바일 웹앱 줌/확대 기능 완전 잠금**: Viewport 메타태그에 `maximum-scale=1.0, user-scalable=no`를 선언하고, 모든 인풋 필드(`input, select, textarea, #moveSearchInput, #searchInput`)에 `font-size: 16px !important;`를 적용하여 이동 검색창 및 폼 포커스 시의 iOS 자동 화면 확대를 원천 차단했다.

## D-025 · v1.13.5 구분선 48px 롤백·로딩 타이포 중앙 카드화·상단 뱃지 텍스트 핏·PC 1.8초 순수 블랙 몰입 — 2026-08-16 (User-confirmed)
1. **파일 구분선 시작점 롤백 (left: 48px)**: 구분선 시작 위치를 v1.13.2 스펙인 `left: 48px`로 롤백하여, 폴더 아이콘 뒤쪽 및 텍스트 시작점(50px)보다 아주 살짝 앞에서 자연스럽게 시작되는 정통 인셋 헤어라인을 복원했다.
2. **미디어 로딩 타이포 중앙 글래스 카드 재설계**: `.media-loading`을 화면 정중앙(`50%, 50%`)에 배치하고, 28px 원형 스피너와 13px 단정하고 선명한 Apple 글래스 카드(`rgba(0, 0, 0, 0.72)`, `backdrop-filter: blur(20px)`)로 래핑하여 텍스트 줄바꿈 및 우측 치우침 현상을 원천 해결했다.
3. **모바일 숏폼 최상단 화질 배지 텍스트 핏 밀착**: `width: fit-content; flex: 0 1 auto;`로 우측으로 길게 늘어지던 불필요한 빈 테두리를 완전히 제거하고, 오직 텍스트 내용(`• 100% 원본 스트림 · FHD 1080p`)만 딱 감싸는 미니멀 글래스 캡슐로 축소했다.
4. **PC 영상 재생창 마우스 1.8초 유휴 시 UI/커서 소멸 & 배경 순수 블랙(#000000) 100% 시네마 몰입 모드**: 재생/일시정지 상태와 무관하게 마우스 이동이 1.8초간 정지하면 모든 상·하단 UI 및 마우스 커서(`cursor: none`)가 페이드아웃되고, 앰비언트 블러도 `opacity: 0`으로 사라지며 주변 배경이 순수 암흑(`#000000`)으로 전환되는 100% 몰입 모드를 구축했다. 마우스 조작 시 즉각 부드럽게 UI가 복귀한다.

## D-026 · v1.13.6 스와이프 피드백 오버랩 제거·HUD 하단 재배치·전역 타이포그래피 계층 정밀화 — 2026-08-16 (User-confirmed)
1. **스와이프 전환 피드백 텍스트 오버랩 제거 & HUD 하단 격리**: 영상 전환 시 중앙 로딩 카드 주변에 중복으로 뜨던 unstyled `SHORTS`, `NEXT`, `PREV` 텍스트를 제거했다. 볼륨·배속·시크 피드백(`VOL 80%`, `SPEED 1.5X`, `+10S`)은 화면 하단 중앙(`bottom: calc(var(--safe-bottom) + 72px)`)의 세련된 Apple 모노 글래스 캡슐 HUD(`rgba(9, 11, 16, 0.78)`, `backdrop-filter: blur(20px)`)로 격리 재배치하여 중앙 로딩 카드와의 시각적 충돌을 100% 해소했다.
2. **Apple SF Pro 시스템 폰트 스케일 기준 전역 타이포그래피 일관성 완성**: Large Title(34px/28px, -0.025em), Header(20px, -0.018em), Section(15px, -0.015em), Body(15px, -0.01em), Subheadline(13px, -0.005em), Action Chip(12px, 0.01em), Status Badge(11px, 0.01em) 및 시간·해상도 전용 모노스페이스(`tabular-nums`)로 전역 스타일을 일관되게 정밀화했다.

## D-027 · v1.13.7 컨트롤 바 수직 슬라이드 정상화·툴바/다이얼로그 버튼·타이포 위계 일관성 완성 — 2026-08-16 (User-confirmed)
1. **PC 영상 재생창 하단 바 상하 수직 슬라이드 정상화**: `.custom-video-controls`의 수평 중심축(`translateX(-50%)`)이 `translateY(8px)`로 인해 덮어씌워져 우측으로 튕겨나가던 현상을 확인하고, `transform: translateX(-50%) translateY(14px);`로 중심축을 고정했다. 이제 컨트롤 바가 우측으로 치우치지 않고 순수하게 아래로 슬라이드 다운/업하며 페이드 인/아웃된다.
2. **툴바 및 다이얼로그 전역 타이포그래피·버튼 일관성 정밀화**: PC 툴바 내 검색창, 세그먼트 버튼, 하위폴더 토글, 정렬 셀렉트의 높이를 36px, 폰트 크기를 13px(-0.01em 자간)로 완벽히 통일했다. 설정창의 Primary, Secondary, Danger, Danger-text 버튼 역시 높이 36px, 폰트 13px(font-weight: 600)로 통일하여 들쭉날쭉하던 서식 위계를 전면 정돈했다.

## D-028 · v1.13.8 설정창 업데이트 버튼 Hero 분리·정렬 셀렉트 폰트 서식 일치화 — 2026-08-16 (User-confirmed)
1. **설정창 업데이트 버튼 레이아웃 구조 개편 및 텍스트 2줄 쪼개짐 원천 차단**: 새 업데이트 감지 시 `applyUpdateButton`이 좁은 1개 행에 억지로 들어가며 글자가 2줄로 깨지던 문제를 해결하기 위해, 핵심 액션인 '지금 업데이트 적용' 버튼을 상단에 단독 Full-width Primary Hero 버튼(`width: 100%; height: 38px;`)으로 분리 배치했다. 하단의 '업데이트 확인'과 '강제 캐시 새로고침' 버튼은 2열 균등 분할 배치(`flex: 1`)하고, 모든 버튼에 `white-space: nowrap !important;`를 적용하여 텍스트 줄바꿈을 완벽히 방지했다.
2. **툴바 정렬 드롭다운(`select`) 폰트 서식 100% 일치화**: 브라우저 기본 사양상 시스템 폰트를 상속하지 않던 `<select>` 태그에 `font-family: var(--font-system) !important; color: var(--label-primary) !important; font-size: 13px !important; font-weight: 500; letter-spacing: -0.01em;`를 명시하여, 바로 옆의 세그먼트 버튼 및 토글 버튼과 동일한 SF Pro 시스템 폰트, 자간, 선명도를 갖도록 서식을 완벽히 일치시켰다.

## D-029 · 대용량 전체 모집단 정확성·GIF 정지 썸네일·Drive 전체 폴더 이동 — 2026-08-23 (User-confirmed, current task)

1. GIF 파일 카드는 파일 수와 관계없이 움직이는 썸네일을 재생하지 않으며, 썸네일 처리 때문에 웹이 멈추지 않게 한다.
2. 폴더 이동 검색은 사용자가 접근할 수 있는 실제 Google Drive 폴더 전체를 페이지 누락 없이 대상으로 삼고, 권한·공유 드라이브·비동기 오류를 안전하게 처리한다.
3. 쇼츠의 랜덤 재생과 랜덤 배열은 화면에 먼저 로드된 부분집합이나 현재 검색 결과가 아니라 대상 폴더(하위 폴더 포함 모드에서는 해당 서브트리)의 지원 미디어 전체를 모집단으로 사용한다.
4. 위 기능을 방해하는 구조적 버그와 대용량 병목은 같은 패치에서 전수 감사·수정하고, `G:\`의 실제 규모를 회귀 검증 표본으로 사용한다.

## D-030 · 둥근 네이비 Drive Original 로고로 앱 아이콘 통일 — 2026-09-16 (User-confirmed)

Drive Original의 바탕화면/PWA 아이콘은 모서리를 둥글게 깎고, 기존 로고의 파란색 점 디테일은 제거한다. 앱 헤더에 별도로 쓰이던 파란 카메라 아이콘도 같은 네이비 로고로 교체하여 설치 아이콘, Apple touch 아이콘, maskable 아이콘, 파비콘, 앱 내부 브랜드 아이콘을 하나의 시각 체계로 통일한다.

→ superseded by D-037 (2026-09-16)

## D-031 · 모바일·PC 전 영역 상용 앱급 완성도 및 능동적 전수 개선 — 2026-09-16 (User-confirmed)

모바일 스와이프·애니메이션, PC 재생 컨트롤과 오버레이, 팝업과 기본 UI, Google Drive 원본 재생 및 인증, 초기·썸네일 로딩, 점진적 영상 재생, 프레임 단위 탐색, 카드 길게 누르기 다중 선택·일괄 삭제·이동, 기능 안정성과 잠재 버그를 전수 점검하고 개선한다. 사용자가 열거한 열다섯 항목은 최소 요건이며 작업 범위의 상한이 아니다. 모바일과 PC 모두를 대상으로 하며, 능동적으로 추가 결함과 미흡한 지점을 찾아 대기업 상용 앱급 완성도를 목표로 한다.

## D-032 · 모바일 사용자 확대 허용 및 폼 자동 확대는 입력 크기로 방지 — 2026-09-16 (Implementation decision under D-031; supersedes D-024 item 3)

WCAG 접근성과 저시력 사용자의 확대 기능을 보존하기 위해 viewport의 `maximum-scale=1.0, user-scalable=no` 잠금을 제거한다. iOS 폼 포커스 자동 확대는 기존 16px 입력 글자 크기 규칙으로 계속 방지한다. 이 결정은 D-024의 1·2항과 3항의 입력 글자 크기 부분을 유지하고, 3항 중 사용자 확대 잠금만 대체한다. 근거는 모바일 Lighthouse의 `meta-viewport` 실패와 수정 후 접근성 91→100 실측이다.

## D-033 · 원본 화질 최우선의 3단계 앱 내부 재생 복구 — 2026-09-16 (User-confirmed, current follow-up)

영상 재생은 Google 호환 재생기의 편의보다 원본 화질을 우선한다. 첫 경로는 Google Drive `alt=media`의 원본 바이트를 Range 요청으로 즉시 점진 재생하고, 구간 전달 경로가 반복 실패할 때는 원본 전체를 앱 전용 임시 디스크(OPFS)에 저장해 동일 바이트를 재생한다. OPFS를 쓸 수 없을 때만 작은 파일에 한정한 메모리 버퍼를 사용한다. Google 호환 재생기는 브라우저 코덱 비호환·Drive 다운로드 제한·안전 저장 한도 초과 때의 마지막 앱 내부 수단이며, 원본 화질을 보장하지 않는다는 사실을 항상 표시한다. 임시 원본은 파일 전환·닫기·세션 변경 때 정리한다.

sweep: README, product truth, active goal, runtime labels, and regression tests aligned with the three-stage original-quality recovery policy (2026-09-16)

## D-034 · 단일 디코더 4방향 연속 덱과 상하 2개씩 선할당 — 2026-09-16 (User-confirmed, current follow-up)

좌우 이동은 플레이어 진입 시의 기존 정렬 순서를 세션 동안 보존하고 뒤늦게 적재된 페이지는 그 순서의 꼬리에만 추가한다. 상하 이동은 랜덤 쇼츠 공간 덱으로 운용하여 현재 항목 기준 위 2개·아래 2개를 미리 할당하고 썸네일을 예열하며, 반대 방향 스와이프는 직전 항목으로 공간적으로 복귀한다. 메모리·디코더 경쟁을 피하기 위해 실제 `<video>`는 하나만 유지하고, 드래그 중 이웃은 재사용 포스터 레이어가 손가락을 1:1로 따라온 뒤 커밋 시에만 원본 스트림을 교체한다.

population: vertical random targets remain sampled from the complete target-folder or deep-scan population under D-029; an early gesture waits for metadata completion before commit (2026-09-16)
sweep: active goal, product truth, runtime deck state, and deterministic regression tests aligned with the spatial-deck contract (2026-09-16)

## D-035 · 원본 재생 계층 소진 후 앱 내부 호환 재생 자동 전환 — 2026-09-16 (AI-proposed, user-confirmed)

D-033의 원본 화질 최우선 원칙과 `원본 Range → OPFS 전체 원본 → 제한된 메모리 원본` 순서를 유지한다. 다운로드 제한, 검증된 브라우저 포맷 비호환, 안전 저장 한도 초과, 또는 Range와 전체 원본 전송이 모두 복구 불가능한 경우에는 Google 호환 재생기로 앱 안에서 자동 전환한다. 이때 호환 재생이 원본 화질을 보장하지 않는다는 상태를 항상 표시하고 `원본 다시 시도`를 제공하며, 외부 Google Drive 페이지는 자동으로 열지 않고 호환 재생까지 실패한 경우에만 수동 탈출구로 남긴다. 인증 오류는 화질·코덱 실패로 취급하지 않고 앱 내부 재인증을 우선한다.

## D-036 · 내장 OAuth 클라이언트 ID와 대표 검증 폴더 — 2026-09-16 (User-confirmed)

Drive Original은 `376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com`을 기본 웹 OAuth 클라이언트 ID로 내장하여 최초 연결 때 사용자가 별도로 입력하지 않아도 Google 계정 연결을 시작할 수 있게 한다. 사용자 지정 클라이언트 ID는 고급 설정의 선택적 재정의 수단으로만 유지한다. 앞으로 이 프로젝트의 비파괴 실파일 검증은 `G:\내 드라이브\ㅇㅎㅎ`를 대표 표본으로 사용할 수 있다.

sweep: 기본 ID, 사용자 클릭 기반 로그인 시작, 고급 override, README, 정적 계약을 정렬했고 대표 폴더 7,384개 파일을 비파괴 인벤토리로 확인했다 (2026-09-16)

## D-037 · 파란 점이 있는 기존 둥근 네이비 아이콘 복원 — 2026-09-16 (User-confirmed; supersedes D-030)

Drive Original의 바탕화면, PWA, Apple touch, maskable, 파비콘, 앱 내부 브랜드 아이콘은 사용자가 첨부한 기존 디자인처럼 둥근 네이비 외곽과 흰색 장치 윤곽을 유지하면서 우측 하단의 파란색 점 디테일을 포함한 역사적 원본 자산으로 통일한다. 임의로 새 아이콘을 만들거나 파란 점을 제거한 대체물을 사용하지 않는다.

sweep: 역사적 PNG 4종을 Git blob과 해시 일치로 복원했고, SVG 표면은 해당 래스터를 둥근 클립으로 참조하며 Windows shortcut ICO도 백업 후 파란 점 원본으로 교체했다 (2026-09-16)

## D-038 · GIF 카드에 실제 정지 썸네일 표시 — 2026-09-16 (User-confirmed; clarifies D-029)

GIF 파일 카드는 일반 플레이스홀더만 표시하지 않고 파일 내용을 식별할 수 있는 실제 썸네일을 표시한다. 목록에서 GIF 애니메이션을 계속 재생해 성능을 소모하지 않는 D-029의 안전성 요구는 유지하므로, 썸네일은 정지 프레임이어야 하고 실패 시에만 정적 GIF 플레이스홀더로 복구한다.

sweep: 화면 600px 근처에서만 분리 이미지의 한 프레임을 320×320 캔버스에 그리며, 멀어지면 1×1로 해제하고 플레이어 우선 시 작업을 중단한다. 실제 대표 GIF와 자동 수명주기 검사를 통과했다 (2026-09-16)

## D-039 · 안전 한도 내 영상은 원본 임시 디스크 우선 — 2026-09-16 (Implementation decision under D-031/D-033; supersedes D-033/D-035 ordering only)

영상은 쓰기 가능한 OPFS, 확인된 파일 크기, 추정 여유 공간 80% 이내, 모바일 64MiB·PC 256MiB 자동 한도를 모두 만족하면 Range 실패를 기다리지 않고 Drive 원본 전체를 앱 전용 임시 디스크에 먼저 기록한 뒤 같은 바이트를 재생한다. 큰 파일·크기 미상·OPFS 미지원 환경은 전체 다운로드로 첫 프레임을 지연시키지 않고 Range/연속 원본 전송부터 시작한다. 임시 디스크 우선 전송이 실패하면 Range 원본으로 한 번 전환하고, 이후 제한된 메모리 원본과 Google 호환 재생 순으로 복구한다. 병렬 Range+전체 다운로드처럼 바이트를 중복 소비하는 경로는 만들지 않는다. 이 결정은 원본 화질 최우선, 인증 복구 우선, 호환 재생 최후 수단, 외부 Drive 자동 이동 금지라는 D-033/D-035의 나머지 계약을 그대로 유지한다.

sweep: 실패한 OPFS 모드를 세션에 기록해 Range 실패 뒤 재선택하지 않으며, 전송 방식 적응이 화질 선택이 아니라 모든 선행 경로에서 동일한 Drive 원본 바이트를 유지한다는 계약을 README·제품 진실·회귀 테스트에 정렬했다 (2026-09-16)

## D-040 · CORS에서 숨겨진 정상 206 범위의 증거 기반 복원 — 2026-09-16 (Implementation decision under D-031/D-033)

Google Drive가 원본 `alt=media` 요청에 정상 `206`을 반환하더라도 브라우저 CORS가 `Content-Range`를 노출하지 않을 수 있다. 이 경우 서비스 워커는 앱의 같은 원본 메타데이터에서 전달된 안전한 파일 크기와 CORS-safelisted `Content-Length`가 요청 범위의 정확한 전체 길이와 일치할 때만 `Content-Range`를 재구성하여 원본 Range 재생을 유지한다. 보이는 `Content-Range`가 잘못됐거나, 크기·길이가 없거나, 길이가 예상 범위보다 짧거나 길거나, 범위가 파일 경계를 벗어나면 기존처럼 `range-invalid`로 실패 처리한다. `200` 전체 응답에는 Range 지원 헤더를 합성하지 않는다.

sweep: 실제 인증 Drive에서 대용량 두 파일이 모두 `206`/숨겨진 `Content-Range` 때문에 502로 오판되는 것을 관찰했고, 정확 일치 복원과 모호한 응답의 fail-closed 계약을 서비스 워커·README·회귀 테스트에 정렬했다 (2026-09-16)

## D-041 · 계정 동기화 시청·좋아요 상태와 폴더 통합 좋아요 탐색 — 2026-09-17 (User-confirmed)

한 Google Drive 계정에서 시청 여부와 좋아요 상태를 기기 간 공유한다. 개인용 앱이므로 별도 서버나 복잡한 계정 시스템을 추가하지 않고, Drive의 비공개 `appDataFolder` 상태 파일과 계정별 로컬 캐시를 병합한다. 쇼츠 랜덤 재생은 아직 보지 않은 미디어를 본 미디어보다 먼저 무작위 배치한다. 모바일은 미디어 중앙 영역을 빠르게 두 번 터치해 좋아요를 켜고 같은 동작으로 취소하며, D-011의 영상 좌우 10초 이동은 좁은 바깥 영역에 유지한다. PC와 카드에는 기존 SVG·컨트롤 체계에 맞춘 하트 버튼을 제공하고, 좋아요 필터는 원래 폴더와 관계없이 모든 좋아요 미디어를 모아 보여준다. 플레이어가 닫힌 모바일 라이브러리에서는 왼쪽 화면 모서리 스와이프로 좋아요 필터를 빠져나가거나 상위 폴더로 돌아간다.

sweep: 계정 상태 병합·업로드, 미시청 우선 공간 덱, 카드/PC/모바일 좋아요, 전역 좋아요 필터, 모서리 뒤로가기, GIF 잔상 수정, README·제품 진실·회귀 테스트를 v1.19.0에 정렬했다 (2026-09-17)

## D-042 · 좋아요 UI 균형·직접 조회·비동기 상태 소유권 강화 — 2026-09-17 (User-confirmed follow-up)

이번 패치에서 사용자가 발견한 세 가지 현상을 최소 범위가 아니라 PC·모바일 UI 완성도와 기능 안정성 전반의 점검 신호로 다룬다. 모바일 `⋯` 보조 동작은 버튼 위쪽에 세로 한 줄로 정렬하고, 더블탭 좋아요 피드백은 설명 문구 없이 하트만 표시한다. 라이브러리의 네 가지 필터는 동일한 텍스트형 탭으로 균형을 맞추기 위해 `좋아요` 라벨에서 중복 하트 그림을 빼되, 카드와 플레이어의 하트는 실제 좋아요 상태를 나타내는 동작 아이콘으로 유지한다. 좋아요 모아보기는 전체 드라이브 재귀 스캔 성공에 의존하지 않고 계정 상태의 파일 ID를 직접 조회하며, 계정 상태는 Drive 비공개 앱 데이터에 필요한 명시적 OAuth 범위를 사용한다. 비동기 로딩 메시지는 해당 화면·요청이 소유하도록 하여 필터나 폴더를 바꾸면 이전 오류가 남거나 뒤늦게 덮어쓰지 못하게 한다.

## D-043 · 개인용 앱 전수 안정화·시각 검증·자율 완료 — 2026-09-17 (User-confirmed)

사용자는 기존 이력·워크플로우를 파악하고 PC/모바일 UI·UX·기능·알고리즘·애니메이션을 전수 검사하여 안정화·최적화·시각 검증·완료하도록 승인했다. 개인용 정적 앱 구조와 원본 화질·단일 디코더·전체 모집단·기존 파란 점 아이콘·실제 사용자 데이터를 보존한다. Notion 플러그인은 금지하며 기존 유지보수 문서와 배포 패키지는 로컬 ntn으로만 갱신한다. 대기업 수준은 품질 목표이며 검증되지 않은 무결점·동급 보증을 뜻하지 않는다.

## D-044 · 동시 쓰기 유실 없는 작성자별 계정 상태 — 2026-09-17 (Implementation under D-043; supersedes D-041 storage implementation only)

단일 appDataFolder 파일의 read-merge-write는 서로 다른 기기의 동시 쓰기에서 기록을 잃는 재현이 확인됐다. 각 작성자는 자기 파일만 수정하고 모든 작성자 파일 및 기존 단일 파일을 병합한다. 기존 파일은 읽기 전용 이관 원본으로 보존한다. 동일 브라우저 탭은 Web Locks로 직렬화하고 잠금 미지원 환경은 실행 컨텍스트별 작성자를 사용한다. 최신 항목 시각을 우선하며 동률은 좋아요 취소로 결정적으로 수렴한다. 토큰·응답·JSON·계정 초기화는 계정 및 데이터 세대로 격리하고 백그라운드 갱신 후보는 계정 일치 확인 전 공개하지 않는다. 별도 서버·DB는 추가하지 않는다.

## D-045 · 모바일 가장자리 뒤로가기의 직접 추적·이전 화면 복원 — 2026-09-17 (User-confirmed goal; implementation under D-043)

사용자가 모바일 좌측 모서리→우측 뒤로가기를 Apple 공식 동작처럼 더 정교하게 만들도록 추가 지시했다. 소유한 History API 이력을 사용자 입력 시점에 동기적으로 추가하고 이전 폴더·필터·검색·정렬·스크롤을 복원한다. 커스텀 동작은 전경 1:1 추적, 실제 이전 화면의 시차·음영, 최근 속도·역방향 취소, 부드러운 완료/복귀와 reduced-motion을 사용한다. iOS Safari 브라우저의 물리 모서리는 기본 탐색에 맡겨 popstate로 같은 복원 경로에 합류시킨다. 다중 터치·세로 스크롤·중단·뷰 교체·원시 브라우저 이벤트와 충돌하지 않게 가드한다. 실제 iPhone OS 동작은 WebKit 데스크톱 검증과 분리하여 기록한다.

## D-046 · 공개 셸 전용 Pages 브랜치 배포 — 2026-09-17 (Implementation under D-043)

기존 OAuth 인증에는 repo 권한과 저장소 관리자 권한이 있지만 workflow 파일 쓰기 범위가 없어 신규 게이트 워크플로 push가 거절됐다. SSH 키도 없으며 추가 권한 승인을 자동 완료하지 않았다. 권한을 우회하거나 이전 기록을 삭제하지 않고 공식 GitHub Pages 브랜치 배포를 사용한다. 소스·기록은 main에, 검증된 공개 파일 12개만 gh-pages에 둔다. 기존 전체 저장소 업로드 워크플로는 원문 그대로 보존하되 자동 실행을 비활성화한다. publish-pages.cjs는 깨끗한 소스 커밋, 문법, 전체 테스트를 검사한 뒤 Git blob 바이트로 공개 트리를 만들고 일반 fast-forward push를 수행한다. 앱과 배포 결과는 동일하며, 향후 소스 변경 후에는 게시 명령을 명시적으로 실행해야 하는 운영 차이가 있다.

## D-047 - scoped acceptance follow-up (2026-09-17)

Confirmed by baseline counterexamples: server-side writer union alone does not ensure continuously visible clients converge. The v1.20.1 candidate adds visible/online 15-second reads with request ownership, cooldown and permission guards, keeping D-044 writer ownership and migration intact. A consumed transition identity closes cancelled/duplicate WAAPI completion paths without changing D-045 Safari native-edge ownership. Physical iPhone and real two-device Google acceptance remain OPEN in ACCEPTANCE-20260917.md. No production deployment or new runtime dependency is part of this follow-up branch.

## D-048 · 하단 전용 몰입형 제어·독립 플레이어 뒤로가기·재인증 보존 — 2026-09-19 (User-confirmed; scoped supersession)

사용자가 보고한 아홉 항목에 따라 PC/모바일 모두 일시정지·일반 마우스 이동만으로 제어 UI를 표시하지 않는다. 기존 분리 재생바와 상단 제어를 하단 투명 wrapper로 통합하고, 하단 포인터/터치 또는 명시적인 키보드 접근으로만 표시한다. 숨긴 제어는 inert이며 Tab 접근성, 실제 조작 중인 시크·메뉴, 기존 기능은 유지한다. 이 규칙은 과거 pause/중앙 탭/일반 이동에 따른 강제 표시 및 위치 지시 중 충돌하는 부분만 대체한다.

D-045의 탐색 복원·중단 안전성은 유지하면서 플레이어에 독립된 history entry를 추가한다. 커스텀 뒤로가기는 18 CSS px에서 시작하며 미디어 제스처는 해당 영역을 제외한다. iOS는 미디어 시작 제외 영역을 32 CSS px로 두고, 소유한 이력이 있는 Safari와 standalone 모두 기본 모서리를 중복 애니메이션 없이 예약한다. 기존 standalone 예외 가정은 폐기하되, 실제 OS 행동은 여전히 실기기로 검증해야 한다.

파일 권한 오류와 계정 만료를 분리하고, 같은 계정의 갱신에서는 목록·재생 상태를 보존한다. 다른 계정은 공개 전 식별·격리하며 미확인 식별 결과로 기존 세션을 버리지 않는다. 숫자 토큰/계정 세대로 늦은 인증 오류를 차단한다. 무기한 무조작 로그인이나 실제 iPhone/Google 검증 완료를 주장하지 않는다. D-047 후보를 검토·통합하고 D-046의 공개 파일 전용 게시 경로를 유지한다. 근거와 회귀 계약은 IMMERSIVE-20260919.md에 있다.

## D-049 · v2.0 전체 제품 요구와 판별 우선 장기 실행 규약 — 2026-09-19 (User-confirmed; scoped supersession)

`Drive-Original_Worker-Spec_v2.0_2026-09-19.md`를 Drive Original의 전체 제품 요구로, `Drive-Original_Codex-Execution-Protocol_v1.0_2026-09-19.md`를 장기 구현·컨텍스트 복구 작업 방식으로 사용한다. 기존 WP-00~WP-10과 QA-TR/FM/AU/ST/MU/UI/LF/SE/SW 인수 항목을 없애거나 낮추지 않고, 전체 목표는 `memory/goal/commercial-player-stability.md` 한 곳에서 소유한다. 한 번에 하나의 관찰 가능한 재현→수정→검증 단위만 활성화하고 현재 체크포인트에 실제 코드·검증·승인 경계를 기록한다.

현행 v1.21.0과 과거 자동화·배포 보고는 기준선이지 v2.0 완료 증거가 아니다. 같은 실패 파일의 인증·전송·컨테이너·디코더 경계를 먼저 판별한 뒤 구조 A/B/C를 선택하며, B는 우선 검증 후보일 뿐 채택 완료가 아니다. 이 결정은 D-039의 `OPFS 전체 저장 우선`을 기본 첫 프레임 경로로 고정한 순서와 D-035의 Google iframe 자동 호환 종료 경로를 각각 v2.0 TR-01 및 UI-04/Q-01~03 범위에서 대체한다. 원본 품질 우선, 사용자 데이터 보존, 수동 외부 열기, 기존 계정 appData의 임시 SSOT는 유지한다.

현재 착수 단계는 읽기, 작업 브랜치의 최소 진단·재현 fixture, 로컬 테스트와 증거 기록으로 제한한다. 실제 Drive 쓰기·공유, OAuth 설정, 유료/상시 인프라, 새 origin·네이티브 배포, `main` 병합·push·운영 배포, 중지 자동화 재개는 별도 승인 전에는 실행하지 않는다.

→ superseded in scope and active-source ownership by D-050 (2026-09-19)

## D-050 · v3.0 통합 명세와 브라우저·직접 전송·최소 무료 인증 실행 범위 — 2026-09-19 (User-confirmed; supersedes D-049 scope and source ownership)

`Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md`를 이번 작업의 단일 활성 통합 명세와 실행 규약으로 사용한다. 저장소 안의 보존본은 `memory/specs/Drive-Original_Sol-Ultra_Implementation-Pack_v3.0_2026-09-19.md`, SHA-256은 `A57C7109A540BE09F351ACF582E0F9BA6A6A556F92E943A6CB6804CA2576B564`다. D-049의 한 번에 하나의 관찰 가능한 재현→수정→검증 단위, 전체 WP/QA 기준, 원본 품질·사용자 데이터 보존 원칙은 유지하되, 착수 단계 전용 제한과 이전 두 원문의 활성 소유권은 대체한다.

기본 사용 경로는 브라우저/PWA이고 상시 개인 PC/NAS 및 사용자용 네이티브 배포는 제외한다. 현행 PWA/SW의 원본 직접 전송을 먼저 고치며, 장기 로그인은 미디어 중계·변환과 분리된 최소 무료 서버리스 인증 계층을 검증·구현한다. 지정 실패 표본 `G:\내 드라이브\ㅇㅎㅎ\x_953b92374b59458d.mp4`는 읽기 전용으로 실제 Drive ID·version·코덱·최초 실패 계층을 확인한다.

작업 브랜치의 제품 코드·문서, 개발 도구, 테스트와 커밋, 이번 작업이 만든 일회용 Drive 테스트 데이터의 생성·이동·휴지통·복구·원격 확인, 앱 범위의 비파괴 OAuth/HTTPS 후보 설정과 기존 데이터 이관, 비용 없는 검증 배포를 승인한다. 실제 원본 변경·공개 공유·영구 삭제, 결제·카드·자동 과금, `main` 병합·원격 push·기존 운영 서비스 교체, 중지 자동화 재개는 승인하지 않는다. 본인 로그인·2단계 인증·약관·경로 승인과 운영 전환은 해당 경계에서 별도로 요청한다.

sweep: active goal, open questions, checkpoint authority, specification index and session record aligned to the integrated v3.0 source and current authorization (2026-09-19)

## D-051 · same-origin B-auth와 직접 Drive 데이터 경로 채택 — 2026-09-19 (Implementation decision under D-050; user-delegated)

V2-01C~V2-03B의 같은 표본 증거에 따라 미디어 중계가 아니라 인증 책임만 서버리스로 분리한다. 검증 후보는 Cloudflare Worker Static Assets가 PWA 셸과 최소 `/auth/*`, `/api/session/*`를 같은 HTTPS origin에서 소유하고, 짧은 transaction Durable Object가 계정 확인 전 일회용 state/PKCE/OIDC nonce를 원자적으로 소비하며, Google OIDC 서명·`iss/aud/exp/iat/nonce/sub` 검증 후 선택한 계정별 SQLite-backed Durable Object가 암호화 refresh credential·세션·단조 증가 revision·지속 lease를 소유하는 구조다. Google client secret과 애플리케이션 암호화 키는 Worker Secrets에 둔다. 브라우저에는 짧은 access token·만료·계정·revision만 메모리로 전달하며 refresh token과 client secret은 전달하지 않는다.

Drive 파일·Range 바이트는 앱/클라이언트 범위 서비스 워커가 공식 Drive API에서 직접 읽는다. Worker에 미디어/Drive API 중계, 바이트 캐시, FFmpeg, remux/transcode, Drive mutation 경로를 두지 않는다. 기존 브라우저 operation controller와 Drive `appDataFolder` writer merge가 각각 mutation과 likes/viewed 상태의 소유자로 남는다. GitHub Pages v1.21.0은 후보 검증 중 변경하지 않는 rollback runtime이다.

기존 Google project/Web client를 우선 재사용하고, 실제 후보 hostname을 얻은 뒤 정확한 HTTPS origin/callback만 추가한다. 현재 실제 Console의 External Testing, redirect 0개, `drive.readonly` 표시와 코드의 `drive`+`drive.appdata` 요청 불일치는 라이브 수락 전에 `openid` identity fence, 최소 Drive scope, 게시 상태, 7일 만료, 개인용 unverified 경로, 기존 grant의 offline refresh credential 발급/명시적 재동의와 함께 재검증한다. 누락된 refresh-token 응답으로 기존 credential을 덮어쓰지 않는다. 1기기 logout은 해당 session만 종료하고, 명시적 disconnect는 전체 앱 session과 서버 credential을 삭제하며 Google revoke 결과가 불확실하면 그대로 알린다. 마지막 session 종료/만료 뒤 7일 grace가 지나면 DO alarm이 credential을 삭제한다. Cloudflare Free/무카드 활성화, 실제 hostname/DO binding, 기존 client secret 재사용과 동일 appData 가시성은 아직 미검증이다. 결제·카드·자동 과금은 금지하며 요구되면 중단한다.

후보 쓰기 전 계정/appData writer·카운트·tombstone snapshot을 만들고, 같은 계정의 읽기/비교가 일치한 뒤 새 origin writer ID로 기존 writer 전체를 merge한다. 빈 상태나 계정 불일치는 쓰기를 차단한다. rollback은 후보 로그인/쓰기 중지, 앱 세션 종료, 기존 Pages로 복귀, legacy readback 후에만 후보 credential을 폐기하는 순서이며 원본·appData·Google 전체 grant를 자동 삭제/취소하지 않는다. 상세 비용·한도·인터페이스·이관·기각안은 `memory/architecture/V2-03C-AUTH-DATA-OWNERSHIP.md`가 소유한다.


## D-052 · 남은 전체 구현의 순차 진행과 증거 기반 순서 조정 — 2026-09-26 (User-confirmed)

사용자는 "전부 다 순차적으로 해 계획대로. 계획이 잘못된 거 있거나 더 좋은거 있으면 니가 알아서 능동적 유동적으로 해"라고 지시했다. 기존 전체 요구·인수 기준과 D-050의 승인/금지 경계는 유지하고, 작업 순서·잘못된 의존관계·구현 수단은 근거에 따라 조정한다. 한 번에 하나의 핵심 동작을 통합 검증과 커밋으로 닫으며, 특정 live 검사의 접근 부재를 독립적인 승인된 제품 작업의 중단 사유로 확대하지 않는다.

→ automatic continuation temporarily superseded by D-053 (2026-09-27)

## D-053 · 현재 단위 완료 후 보고하고 다음 지시 대기 — 2026-09-27 (User-confirmed; temporarily supersedes D-052 continuation)

사용자는 "하던 작업 깔끔하게 완료하면 닫고 보고 후 다음작업 대기해"라고 지시했다. 진행 중인 로컬 rc.7의 Q1 단발503 복구 단위를 최종 검토·증거/체크포인트·커밋으로 닫고 보고한 뒤 대기한다. 다음401/foreground 또는 상태 이관 단위를 자동 착수하지 않는다. 전체 목표·인수 기준·D-050의 권한 경계는 그대로이며, 전체 완료나 운영 전환으로 해석하지 않는다.

sweep: current checkpoint, active-goal execution state and session log now require an explicit resume before next work (2026-09-27)

→ superseded in continuation by D-054 (2026-09-28)

## D-054 · 기존 작업 재개와 계획의 근거 기반 조정 — 2026-09-28 (User-confirmed; supersedes D-053 waiting)

사용자는 v3.0 계획서와 현재 작업 폴더 및 이전 채팅을 확인하고 "현재 상태 파악하고 하던 작업 마저 수행해"라고 지시했다. 이어 "계획서가 잘못되거나 비효율적인 부분있을수도 있으니까 계획서를 너무 떠받들지 마"라고 명확히 했다. D-053의 다음 지시 대기는 종료한다. 기존 목표와 데이터·품질·비용·운영 전환의 승인 경계는 유지하며, 구현 수단과 순서는 현재 소스·반례·비용을 근거로 조정한다. 이미 있는 인증 갱신/작성자 병합을 중복 구현하지 않는다.

sweep: checkpoint, active-goal continuation and this session record reflect explicit resume; automation remains paused and production transition is not authorized (2026-09-28)

## D-055 · 모바일 제어 문제 대기열 등록, 현재 검증 계속 — 2026-09-28 (User-confirmed)

사용자는 실제 iPhone 후보판의 요청 버전과 `x_953b92374b59458d.mp4` 재생을
확인했다고 보고했다. 한 번 터치하면 일시정지만 되고 재생바 등 오버레이가
나타나지 않아 구간 탐색과 홈 화면30초 복귀 재생을 확인하기 어렵다고 했다.
이 문제는 GitHub 배포판의 특정 버전부터 이어졌다는 사용자 관찰이며,
정확한 회귀 버전·터치 위치·Safari/PWA 모드는 아직 미확인이다.
사용자의 "하던 작업 마저 이어서 하고(=끊지말고) 이러한 문제는 대기열에
넣어서 추후에 해결"에 따라 진행 중인 일회용 Drive 파일 검증을 계속하고
모바일 제어 재현/수정은 V2-02C/A-010으로 등록한다. D-048의 제어 소유권을
이번 보고만으로 임의 변경하지 않으며, 탐색/복귀 인수를 완료로 표시하지 않는다.

## D-056 · 오버레이 전용 터치 영역 결함으로 정확화 — 2026-09-28 (User-confirmed; clarifies D-055)

사용자는 "일시정지 시 오버레이 안뜨는 거는 의도된" 동작이라고 정정했다.
문제는 일시정지를 하지 않고 오버레이만 표시하는 전용 터치 영역도 있어야
하는데 그것이 작동하지 않는 것이다. "일시정지했을 때 오버레이가 뜨도록
패치하지는 마"가 명시적 제약이다. D-048의 pause-independent 제어 소유권을
유지하고 V2-02C/A-010은 전용 영역의 hit-test/event routing 재현으로 다룬다.
D-055의 현재 작업 계속·나중 해결 순서는 그대로다.

## D-057 · 모바일 검증은 가용 Android 환경을 먼저 사용 — 2026-09-28 (User-confirmed)

사용자는 앞으로 iPhone 도구 제약을 이유로 모바일 검증을 곧바로 사용자에게
넘기지 말고, Android에서 가능하다면 Android 모바일로 직접 테스트하도록
명시했다. 모바일 검증 착수 시 사용 가능한 Android 장치/에뮬레이터와 도구를
확인해 직접 진행한다. PC의 화면 크기·터치 모의 검증, Android 장치/에뮬레이터,
실제 iPhone 결과는 각각의 증거 범위를 기록한다. Android 결과가 iOS 전용
Safari/standalone/OS 동작을 입증하지는 않는다. D-056의 제어 계약과 현재
작업 계속·모바일 문제 후속 대기열은 유지한다.

## D-058 · 현재 단위 정리 후 보고·대기 — 2026-09-28 (User-confirmed; supersedes D-054 continuation)

사용자는 "하던 단위 까지 깔끔하게 하고 작업 닫고 기록한다음에 보고하고
다음 작업대기해"라고 지시했으며22시 귀가를 이유로 밝혔다. 현재 진행 중인
제한된 후보판 작성자 기록 저장/독립 원격 재확인 단위를 복구 기록·검증·문서·
커밋으로 닫고 보고한 뒤 WAIT한다. Android/모바일 또는 다른 다음 단위를
자동 시작하지 않는다. 전체 목표와 D-050의 권한 경계는 유지한다.

→ superseded in continuation by D-059 (2026-09-28)

## D-059 · 기존 계획 끝까지 재개, 새 UI 요구는 후속 대기열 — 2026-09-28 (User-confirmed; supersedes D-058 waiting)

사용자는 "이어서 끝까지 완전히 완료되게 작업해"와 "계획 보면서 이어서 진행해"로
대기를 해제했다. 이어 "새로 알려주신 커서·오버레이·로딩 화면 문제를 이어서
처리하는게 아니고 저것들을 작업 목록 대기열에 넣으라고"라고 순서를 정정했다.
기존 WP-08의 제한된 작성자 저장 이후 일반 동기화·새 환경 복원과 기존 계획의
남은 단위를 먼저 이어간다. PC 재생 커서/오버레이 미노출, 작은 로딩 썸네일 및
재생 UI/UX 완성도, 앱 전반 UI 완성도는 같은 목표의 후속 대기열에 추가한다.
전체 완료를 위해 계속 진행하되 실제 검증·구현·운영 승인 상태를 구별한다.
D-056의 pause-without-overlay와 D-057 Android 우선 검증, D-050의 기존 권한
경계는 유지한다. 자동화 재개·운영 전환은 이 재개 요청의 추가 권한으로 추정하지 않는다.

sweep: current checkpoint/goal execution state and queued UI entries aligned to resume and priority correction (2026-09-28)

→ continuation superseded for this session by D-060 (2026-09-29); queue priority and authority boundaries remain.

## D-060 · 현재 단위 완료 후 작업 종료, 재부팅 후 재개 대기 — 2026-09-29 (User-confirmed)

사용자는 "재부팅하게 하던 작업까지 마저 완료하고 닫아"라고 지시했다.
현재 실제 ISO 헤더 검증 단위의 결과·검토·복구 지점을 저장하고 커밋한 뒤
작업을 종료한다. 진행 중이던 다음 WP-10 인수표 초안은 보존하되 새 패키지,
배포, 후속 UI 구현을 시작하지 않는다. 재부팅 후 사용자의 재개 요청을 기다린다.
D-059의 기존 계획 우선/새 UI 대기열, D-056의 pause-without-overlay,
D-057의 Android 대안, D-050의 권한 경계는 유지한다. 자동화는 PAUSED이며
이 종료 요청은 운영 반영이나 OS 재부팅 실행 권한으로 해석하지 않는다.

sweep: checkpoint/goal/handoff/session closeout aligned to WAIT; current verified ISO unit preserved.

→ superseded in continuation by D-061 (2026-09-29)

## D-061 · 재부팅 후 기존 목표 끝까지 재개 — 2026-09-29 (User-confirmed; supersedes D-060 waiting)

사용자는 "재부팅했어. 다시 끝까지 진행해."라고 명시해 재부팅 대기를 해제했다.
기존 계획의 남은 구현·검증·후보 인수 작업을 이어간다. 먼저 재부팅 전의
PC 출력 오류와 우선 영상을 새 브라우저 세션에서 재확인하고, 재생이 안정되면
30초 배경 복귀 검증을 수행한다. D-059의 기존 핵심 작업 우선과 새 UI 대기열,
D-056의 pause-without-overlay, D-057의 Android 대안, D-050의 기존 권한
경계는 유지한다. 운영 전환·main/push·자동화 재개·볼륨 설정 변경 권한으로
해석하지 않는다. 실제 증거가 없는 기기/형식 인수는 미검증으로 남긴다.

sweep: checkpoint/goal execution resumed; consumed single-use handoff removed (2026-09-29)

→ execution temporarily superseded by D-064 (2026-09-30); objective and authority boundaries remain.

## D-062 · 수면 중 자율 진행과 전체 품질 개선 — 2026-09-29 (User-confirmed)

사용자는 자러 가므로 찾지 말고 스스로 진행해 끝까지 완료하라고 명시했고,
지적한 문제 외에도 능동적으로 미흡한 점을 찾아 품질과 완성도를 높이는 것을
목적으로 삼으라고 추가했다. 기존 핵심 계획의 구현·검증을 이어가며 새 결함도
같은 목표에서 재현→수정→검증한다. D-059의 기존 핵심 작업 우선/후속 UI 순서,
D-056의 일시정지와 chrome 독립, D-057의 Android 대안과 증거 구분은 유지한다.
사용자 답변을 기다리지 않는 것은 기존 D-050/D-051의 후보·로컬·허용된 상태 작업
범위를 확대하지 않는다. 운영/main/push, 새 권한·약관·결제, 원본 파괴, 자동화
재개 등 남은 외부 경계는 실제 완료로 보고하지 않는다.

sweep: active core investigation and queued product polish aligned to autonomous quality scope.

→ execution temporarily superseded by D-064 (2026-09-30); objective and authority boundaries remain.

## D-063 · 후속 에이전트 모델과 새 채팅 전환 — 2026-09-30 (User-confirmed)

사용자는 현재 작업을 계속하되 Astra 하위 에이전트는 실제로 막히거나 어려운 경우에만 선택적으로 사용하고, 일반 하위 작업은 6 Sol을 우선하라고 했다. 6.1 Sol이 실제로 사용 가능해지면 이 프로젝트에 새 채팅을 만들고 상위 에이전트를 6.1 Sol Extra High로, 하위 에이전트도 원칙적으로 6.1 Sol로 운영한다. 하위 에이전트 추론량은 작업에 맞춰 선택하고 어려운 병목에서만 6 Astra를 쓴다. 모델 출시나 현재 계정의 사용 가능 여부를 추정으로 확정하지 않는다.

sweep: 현재 진행과 다음 위임에 적용; 6.1 Sol 새 채팅은 실제 런타임 노출 확인 후 생성한다 (2026-09-30).

## D-064 · 지금은 환경 준비만, 본 작업은 밤의 명시적 재개 후 — 2026-09-30 (User-confirmed; temporarily supersedes D-061/D-062 execution)

사용자는 "너가 작업할 수 있는데까지만 환경 조성해줄게. 작업실행은 이따 밤에 내가 잘 때 쭈욱 시킬게. 지금은 니가 밤에 전체 작업 나 없이 완료할 수 있게 환경조성까지만 하자."라고 범위를 변경했다. 지금은 사용 가능한 도구·연결·로그인·자원·재개 기록과 환경 사전 점검만 준비한다. 제품 수정과 실제 미디어/인수 작업은 중단하고 밤의 명시적 시작 지시를 기다린다. 남은 전체 목표와 기존 인수 기준은 유지하며 환경 준비를 제품 전체 완료로 보고하지 않는다. 자동화 재개나 예약 실행을 요청한 것은 아니다.

추가로 사용자는 "Codexon 종료 허용"을 명시했다. 설치 경로가 확인된 Codexon 프로세스만 종료하고 메모리 회복을 확인한다. Android 준비 질문에는 처음 "123 다 가능"이라고 답했지만, 이어 "지금 안드로이드 기기가 준비가 안돼서 나중에 연결하겠습니다. 먼저 할 수 있는데까지만 다 준비해주세요"라고 현재 장치 연결을 유예했다. 지금은 PC 제어 도구까지 준비하며 장치가 연결됐다고 추정하거나 모바일 인수를 실행하지 않는다. 기존 D-050/D-051의 후보·상태·운영·원본·권한·비용 경계는 그대로다.

sweep: current checkpoint, goal execution header, session log and NIGHT-ENVIRONMENT-20260930.md aligned to environment-only/WAIT; existing completed evidence and failed probes preserved (2026-09-30).

→ Android deferral and pending PC file-access preparation resolved by D-065; environment-only WAIT remains.

## D-065 · Android 연결·로그인과 PC 파일 접근 준비 확인 — 2026-09-30 (User-confirmed; partially supersedes D-064 device deferral)

사용자는 Android의 후보 앱에 로그인했다고 알리고, USB 연결과 디버깅 승인 안내 후 "허용했어"라고 답했다. 별도 PC 설정 질문에는 "PC의 파일 URL 접근도 켰습니다"라고 확인했다. 해당 디버깅·파일 접근 설정은 사용자가 직접 적용한 것으로 기록한다. 에이전트는 현재 연결과 로그인 및 로컬 QA 파일 읽기가 실제로 가능한지 환경 사전 점검만 한다.

observed: ADB authorized1/SM-X800/Android16, 실제 Android Chrome MCP에서 정확한 후보판 rc.21 로그인 라이브러리와 SW 제어를 확인했다. PC의 기존 개인 Chrome에서는 네트워크 전송 없는 임시 입력으로 QA factory147087바이트를 읽고 로컬 SHA256 일치를 확인한 뒤 입력을 제거했다. Android 재생·제스처·OS 복귀 및 factory 실행은 하지 않았다. PC와 Android 계정의 동일성은 독립 비교하지 않았다.

D-064의 지금 환경 준비만/밤의 명시적 시작 대기는 유지한다. 이 확인은 전체 제품 인수·운영 반영·자동화 재개 권한을 추가하지 않는다. 기존 D-050/D-051/D-056 및 볼륨·원본·비용 경계를 그대로 유지한다.

sweep: checkpoint, night guide, goal header, open questions and session log updated to observed device/file readiness; earlier failures and deferred snapshots preserved.


## D-066 · Android를 이번 모바일 인수 기준으로, 지금부터 끝까지 진행 — 2026-09-30 (User-confirmed; supersedes D-064/D-065 WAIT and D-057 pre-release iPhone gate)

사용자는 "아이폰이라고 별 다를건 없으니까 안드로이드 검증으로 갈음해. 아이폰 검증은 다 완료 후에 배포후에 해도 늦지 않음. 중간에 한 작업단위완료했다고 끊지 말고 끝까지 다 완료해."라고 지시했고, 시작 시점을 묻는 질문에 "지금부터 끝까지 진행"이라고 명시했다. 지금 즉시 기존 목표의 남은 구현·실제 검증·후보 인수를 재개하고, 단위 완료·커밋·후보판을 복구 지점으로만 사용하여 실행 가능한 전체 목록을 계속한다.

이번 G5/모바일 인수는 실제 PC와 Android로 판정한다. iPhone Chrome/Safari/홈 화면 PWA/VoiceOver 전용 확인은 배포 후 후속 항목으로 이관하며 이번 후보 완료를 막지 않는다. 이것은 사용자가 승인한 인수 범위·순서 변경이며 Android가 iOS 동작을 입증했다는 사실 주장으로 기록하지 않는다. OS/브라우저별 확인한 증거 범위를 계속 구분한다. 기존 명세는 보존하고 이 결정이 현재 인수 기준을 우선한다.

D-050/D-051의 원본·비용·권한·운영 경계와 D-056 pause-without-overlay는 유지한다. 배포 후 검사라는 언급만으로 별도 main/push/production 승인·새 grant·약관·결제·자동화 재개 권한을 추가하지 않는다. Android 대기/파일 접근 준비는 이미 D-065에서 해소됐다. 실제 대기해야 하는 외부 경계가 있더라도 독립 실행 가능한 나머지 작업을 계속한다.

sweep: current checkpoint/goal/night guide/open questions/session log and current acceptance overlay aligned to ACTIVE Android-current/iPhone-post-deploy; immutable historical proofs/spec retained.


→ D-066 execution is temporarily superseded by D-067; its objective and Android/iOS acceptance decision remain.

## D-067 · 자리 이동 전 현재 단위 저장 후 재개 대기 — 2026-10-01 (User-confirmed)

사용자는 "하던데 까지 마저 해. 자리 이동해야해. 그리고 이어서 작업하는거 대기해."라고 지시했다. 현재 완료한 후보27/28 전달·PC 정상 업데이트·Android 소스/캐시 및 가로 설정 화면 확인을 정리하고, 소유한 임시 관찰자·브라우저 비공개 기준값·ADB/MCP 연결을 해제한 뒤 재개 지점과 검증 결과를 커밋한다. 새 재생·강제28 새로고침·corpus·오프라인·자연 갱신·후속 준비 단위는 시작하지 않는다. 이동 후 사용자의 명시적 재개 지시를 기다린다.

D-066의 전체 목표와 PC+Android 현재 인수/iOS 배포 후 순서, D-050/D-051/D-056 권한·품질 경계는 유지한다. 현재 단위 저장을 전체 완료나 운영 승인으로 보고하지 않는다. 자동 재개·자동화·예약을 생성하지 않는다.

sweep: checkpoint/goal/session/current candidate record and single-use handoff aligned to WAIT; actual prior failures and pending whole gates retained.


→ D-067 WAIT superseded by D-068 (2026-10-01).

## D-068 · 이동 후 전체 남은 작업 재개 — 2026-10-01 (User-confirmed; supersedes D-067 WAIT)

사용자는 "이어서 진행"이라고 명시해 대기를 해제했다. db2f808의 저장 지점부터 D-066의 전체 구현·검증·후보 인수 목록을 다시 진행한다. 현재 단위/커밋을 전체 완료로 보지 않고 실행 가능한 후속 작업을 계속한다. PC+Android 현재 인수/iOS 배포 후 순서와 D-050/D-051/D-056의 기존 권한·품질 경계는 유지한다. 운영/main/push/새 grant/결제/원본 파괴/자동화 재개 권한은 추가하지 않는다.

sweep: single-use handoff consumed/deleted; checkpoint/goal/session execution aligned ACTIVE. Historical WAIT/savepoint evidence retained.


## D-069 · 앵챗추출기 마무리 동안 Drive 작업 재개 대기 — 2026-10-01 (User-confirmed; supersedes D-068 ACTIVE execution only)

사용자는 "걍 니가 좀 이따 작업하자. 앵챗추출기 저거 곧 끝날듯"이라고 명시했다. 현재 완료된 기록과 재개 지점만 안전하게 저장하고 Drive의 새 제품 실행·재생·검증·배포를 시작하지 않는다. 앵챗추출기 세션은 자기 기존 탭에서 마무리할 수 있도록 제어 조율을 해제했다. 그 세션의 완료 알림은 자동 재개 권한이 아니며 사용자의 다음 명시적 재개 지시를 기다린다.

D-066의 전체 목표·현재 PC+Android 인수/iOS 배포 후 순서, D-050/D-051/D-056의 원본·비용·권한·운영 경계는 유지한다. 이번 대기는 전체 완료나 범위 포기가 아니다. 공개 후보는 source1d79897/rc.32이며 완료된 전달·업데이트·Android 증거는 반복 실행하지 않는다. 새 Chrome 프로필 이전·로그인·전역 설정 변경은 수행하지 않았다.

sweep: checkpoint, single-use handoff, goal execution header and session log aligned WAIT; safe QA savepoint and original failed/unattempted outcomes retained.


## D-070 · 앵챗추출기 완료 후 전체 작업 재개 — 2026-10-01 (User-confirmed; supersedes D-069 WAIT)

사용자는 "완전히 끝났습니다. 재개하세요."라고 명시해 D-069 대기를 해제했다. aadcdcb의 저장 지점부터 D-066/D-068 전체 남은 구현·실제 검증·후보 인수 작업을 재개한다. 완료된 후보 rc.32 전달·업데이트·Android 검증은 보존하고 반복하지 않는다. PC 검사 연결 복구·기존 임시 QA 정리와 중단된 PC 재생 검증부터 이어간다. 단위·커밋·후보판은 저장 지점이며 전체 완료가 아니다. PC+Android 현재 인수/iOS 배포 후 순서와 기존 원본·비용·권한·운영 경계는 유지한다. main/push/production/새 grant/결제/원본 파괴/자동화 재개 권한은 추가하지 않는다.

sweep: waiting handoff consumed and archived, checkpoint/goal/session aligned ACTIVE D070.


## D-071 · 깨끗한 재부팅 전 저장·재개 준비 후 대기 — 2026-10-01 (User-confirmed; supersedes D-070 ACTIVE execution only)

사용자는 "깔끔하게 재부팅해서 올게. 그 전 대기상태를 이용해."라고 명시했다. 재부팅 직전에는 새 브라우저·Android·공급자 검사나 제품 실행을 시작하지 않고, 현재 기록과 PC 재개 실행 순서를 로컬에 정리·저장한다. 사용자가 재부팅 후 명시적으로 돌아와 재개를 지시할 때까지 대기한다. 재부팅 자체를 에이전트가 실행하거나, 자동화/예약/다른 세션 완료 알림으로 재개하지 않는다.

D-070은 전체 남은 목표를 재개한 결정으로 유지하며 이번 일시 대기는 그 실행만 유예한다. rc.32 전달·업데이트·Android 완료 증거와 실패/미수행 경계를 그대로 보존한다. 기존 PC+Android 인수/iOS 배포 후 순서 및 원본·비용·권한·운영 경계는 유지한다.

sweep: reboot resume guide, checkpoint/handoff, goal execution header and session log aligned WAIT D071.


## D-072 · 재부팅 후 전체 큐 효율적 재개 및 형식 불일치 파일 수정 허용 — 2026-10-01 (User-confirmed; supersedes D-071 WAIT and refines original mutation boundary)

사용자는 기존 승인 전체 작업을 끝까지 재개하고, 검증된 증거 재사용·원인 구분·완결된 실행 단위·시간제한 검사 사전 준비·같은 상태를 쓰는 작업의 직렬화·간결한 소유 문서 기록·커밋 후 연속 진행을 명시했다. 기존 목표와 인수 기준을 유지한다. 도구 수정만으로 제품 재배포/전체 검사를 반복하지 않고 같은 실패를 조건 변화 없이 재시도하지 않는다.

사용자는 MP4 이름인데 실제 TS 등 내용이 다른 해당 영상들에 관해 "그런것들은 그냥 내용까지 바꾸거나 뭐 알아서 해. 손상돼도 상관없음"이라고 명시해 필요할 경우 확인된 형식 불일치 미디어의 내용 수정과 손상 위험을 허용했다. 이는 그 해당 파일의 수정 권한이며 전체 계정 원본 일괄 변경/영구삭제/새 grant/결제/production/main/push/자동화 재개 권한으로 확장하지 않는다. 실제 바이트를 기준으로 책임 있는 계층을 고치고, 수정이 필요한지 판정한 뒤 구체적인 대상과 결과를 기록한다. 제품의 원본 품질 인수 기준은 유지한다.

→ D-072 execution temporarily superseded by D-073, then explicitly resumed by D-074 (2026-10-01); original objective and acceptance remain.

## D-073 · 귀가 전 현재 지점 저장 후 작업 종료 — 2026-10-01 (User-confirmed)

사용자는 "귀가해야 하니까 하던데 까지 하고 작업 닫아."라고 명시했다. 새 실제 검사를 시작하지 않고 완료한 결과·진행 중 로컬 준비의 중단 상태를 저장했다. idle 검사 registry/capsule·proof·observer·비공개 기준값을 정리하고 소유 MCP 연결을 종료했다. 저장 커밋4597f4c와 체크포인트에서 재개 지시를 기다렸다. 전체 목표·인수 기준·기존 권한 범위는 유지하며 전체 완료나 운영 승인으로 보지 않는다.

→ D-073 WAIT superseded by D-074 (2026-10-01).

## D-074 · 다른 채팅의 직접 사용자 지시를 확인하고 전체 남은 작업 재개 — 2026-10-01 (User-confirmed via verified source-thread message; supersedes D-073 WAIT)

앵챗추출기 5 (6.1 Sol ExH) 채팅01a0f63e-2423-72e1-87bb-d24c0ef1cefb에서 사용자는 "2.11.5 닫고 각 버전 각 경로로 배포해. 배포 완료하면 codex://threads/01a0eea0-2e70-7b90-9690-7be9b2f8f62e 에 나머지 작업 끝까지 완수하라고 지시해."라고 명시했다. 전달된 메시지만을 자동 재개 권한으로 보지 않고, read_thread에서 실제 userMessage01a0f7a5-3ed4-7272-8bb0-85e0e688d8ab 원문을 직접 확인했다. 해당 채팅의 배포 완료 및 소유 검사 연결 정리 보고 후,4597f4c의 저장 지점부터 D-066/D-068/D-072 전체 남은 구현·검증·후보 인수를 재개한다.

완료된 제품·외부 작업과 유효한 실제 증거를 반복하지 않는다. 기존 PC+Android 현재 인수/iOS 배포 후 순서와 원본·비용·권한·운영 경계는 유지한다. main/push/production/새 grant/결제/영구삭제/자동화 재개 권한은 추가하지 않는다. 통상 Chrome 조작은 직접 진행하며 실제 로그인/2FA/브라우저 승인 등 사용자 조작 경계만 도움을 요청한다.

sweep: checkpoint and goal execution header aligned ACTIVE D074; departure cleanup and partial scale preparation remain preserved, no old JSON import/current coverage addition.

## D-075 · 검증된 후보의 최종 운영 반영 진행 — 2026-10-03 (User-confirmed in the G6 approval context)

검증된 후보 구현·PC·Android 검사·정리가 완료됐고 남은 항목이 main 병합·push·운영 배포이며 별도 G6 승인을 받으면 진행한다고 명시한 직후, 사용자는 "이어서 끝까지 ㄱㄱ."라고 다시 지시했다. 이 직접 후속 지시는 구체적으로 제시한 남은 G6 운영 반영을 진행하라는 승인으로 적용한다. 후보 a9b2609/rc38과 QA 저장점 cc59733을 보존하고, 전체 의도된 변경 검토·비례하는 운영 모드 검사·main 병합·원격 push·운영 served proof·최종 기록까지 완료한다. 이전 포괄적 재개 지시만을 이 권한의 근거로 삼지는 않는다.

이미 검증된 무료 동일-origin Worker의 hostname/OAuth/DO/secrets를 유지한다. GitHub Pages는 이전 주소의 공개 전용 연결 페이지로 전환하며 재생 중인 창을 강제로 이동시키거나 이전 origin의 설정·미동기화 상태·캐시를 삭제하지 않는다. 원본 미디어 수정/영구삭제·새 grant·결제·자동화 재개는 추가하지 않는다. D066의 iOS 배포 후 검사와 유한 증거/UNKNOWN 경계를 유지한다.

sweep: current release preparation and checkpoint aligned to approved G6 promotion; immutable candidate evidence retained (2026-10-03).

## D-076 · 연결된 아이폰 Safari 검사 환경 구성 — 2026-10-03 (User-confirmed)

사용자는 아이폰 USB 연결 후 Safari 웹 검사 경로 설명에 "ㅇㅇ 구성해."라고 명시했다. 이어 Safari 운영 주소를 열었다고 직접 확인했다. 이 요청에 따라 무료 로컬 검사 도구와 Apple USB 통신 구성, 실제 연결·안전한 도구 동작 확인을 진행한다. 이는 검사 환경 구성 승인이고 전체 iOS 제품 인수 완료나 iOS 시스템 화면·권한창 직접 제어를 뜻하지 않는다. D066의 배포 후 iOS/VoiceOver 인수와 기존 남은 원본 명세 항목은 유지한다.

도구 선택·설치와 실패/성공 판정은 Codex 구현 결과이며 사용자가 특정 도구 설계를 확정한 결정으로 기록하지 않는다. NIGHT-ENVIRONMENT-20260930.md의 2026-10-03 부록과 qa/ios-webinspector/setup-result.json이 실제 준비 결과를 소유한다. 제품 배포·계정/원본 미디어 변경·새 Google grant·결제·자동화 재개는 이번 구성에 포함하지 않는다.

## D-077 · 아이폰 재생 실패와 세로 화면부터 재생 UI/UX 개선 — 2026-10-03 (User-confirmed)

사용자는 좋아요 영상 재생 실패, 쇼츠 배치·터치 영역, 더블클릭 확대, 메인 상단 UI 및 PC 카드 진입/모바일 길게 누르기 버튼 비율을 지적하며 전체 재생 UI/UX 개선을 요청했다. 실패 환경을 "PC 안드는 다 잘되더라고. 아이폰만"이라고 한정했고, "가로화면? 세로화면 부터도 문제인데"라고 정정했다. 세로 화면부터 고치며 재생/정지는 중앙 영역에만 두고 영상 더블클릭/더블탭 확대를 막는다. 기존의 더 넓은 정지 영역과 더블클릭 전체화면 동작은 이 요청으로 대체한다. 중앙 두 번 터치 좋아요와 좁은 좌우 탐색 등 기존 유용한 조작은 충돌 없이 유지한다.

사용자는 시스템 재생 버튼이 원본 영상 안에 녹화된 부분이라고 직접 확인했다. 원본을 변형하거나 그 녹화된 버튼을 앱 결함으로 처리하지 않는다. 실제 관찰과 구현 선택은 qa/playback-repair가 소유하며 이 결정 자체를 검증 증거로 대신하지 않는다. 이번 요청은 구현·필요한 실제 검사 권한이며 새 main/push/production 승인은 별도다. 기존 목표·미완료 인수·D066의 iOS 범위 및 원본/비용/권한/자동화 경계는 유지한다.

## D-078 · 완성된1.22.1 수정본 운영 반영 승인 — 2026-10-03 (User-confirmed)

main 병합·원격 push·기존 workers.dev 운영판 교체의 구체적인1.22.1 승인 질문에 사용자는 "일단 반영승인."이라고 답했다. 로컬 수정1d3b992와 공개 runtime d0bdde5/65개 Git-equal ZIP 및 배포 폴더를 보존하고, 검토된 branch를 main에 반영·push한 뒤 동일 Worker/origin/backend/config/secrets에 배포하고 실제 served/cache/Safari 결과와 유지보수 기록을 마무리한다. D077의 새 운영 승인 대기를 해소하며 기존 구현 요구는 유지한다.

완료된1.22.0·legacy Pages·원본 명세 증거를 조건 변화 없이 재실행하지 않는다. 원본 미디어·새 grant·결제·영구삭제·자동화 재개 권한은 추가하지 않는다. 배포 후 실패하면 정확한 증거와 정리/복구를 우선하며 미검증 항목을 통과 처리하지 않는다.
sweep: checkpoint approval/next action aligned D078; local immutable package and prior production/acceptance evidence retained (2026-10-03).

## D-079 · Notion 릴리즈 폐기 및 기존 유지보수 페이지 삭제 — 2026-10-03 (User-confirmed; supersedes D043 Notion release requirement)

사용자는 "노션 릴리즈는 그냥 빼자. 노션 페이지 삭제하고"라고 명시했다. 진행 중인 Notion 릴리즈 갱신을 중단하고, 이미 확인한 canonical “Drive Original — 유지보수” 페이지 cde9b849-3a7f-473f-9915-e948b1e6defe를 휴지통으로 삭제했다. 로컬 ntn으로 삭제 후 다시 조회해 in_trash=true를 확인했다. 릴리즈 기록과 배포 파일은 현재 Git 저장소·workspace releases가 소유하며 Notion 갱신/첨부/검증은 더 이상 완료 조건이 아니다. 기존 Notion 관련 기록은 역사로 보존한다.

D078 운영 반영과 기존 원본 명세의 남은 인수·비용·권한·자동화 경계는 유지한다. 다른 Notion 페이지나 계정 설정 삭제, 영구 삭제·자동화 재개 권한으로 확대하지 않는다. 중단된 업로드의 실제 상태와 도구 정리는 qa/playback-repair/notion-deletion.json에 기록한다.

## D-080 · 현재 UI 거절, 작업 종료 및 내일 수동 재개 — 2026-10-04 (User-confirmed; suspends current execution)

사용자는 현재 UI를 거절하며 다른 Astra 세션에서 이어갈 뜻과 아이폰 연결 유지를 말한 직후, "아니다 걍 닫아. 검증 목록만 남겨두고. 내일하게."라고 변경했다. 최신 지시를 따라 새 검사·구현·조사·외부 반영을 중단하고, 검증 목록과 현재 파일·배포·실패·정리 상태만 저장한다. 소유한9234검사 브리지와 검사 브라우저 탭을 닫았으며 물리 USB와 사용자 Safari 탭은 변경하지 않았다. 내일이라는 말로 자동 재개·예약·다른 세션 메시지를 생성하지 않는다.

1.22.1 운영/한정된 재생·DOM 검증은 유지되지만 현재 UI의 시각적 수용은 완료되지 않았다. 실제 손가락/BMP/Q2Q3지속 자원/실계정 활성 SW 교체와 원래 조건부 인수는 남는다. qa/playback-repair/README.md의 목록과 CHECKPOINT/HANDOFF가 재개 지점을 소유하며 직접 재개 지시까지 WAIT한다. D079의 Notion 삭제·릴리즈 폐기와 기존 권한 경계는 유지한다.

→ execution superseded by D-081 (2026-10-04).

## D-081 · 반응형 UI 전면 개선·실기기 재생 검증 재개 — 2026-10-04 (User-confirmed; supersedes D-080 WAIT and prior touch geometry)

사용자는 상단 탐색, PC/모바일 재생 바·오버레이 및 전반적인 버튼·아이콘·타이포·배치를 미니멀하고 완성도 높게 재디자인하고, 로딩률 표시와 중앙 정사각형 재생/정지·외곽 네 모서리 한 번 터치 오버레이 표시를 요구했다. 재생 검증은 뷰너 폴더 영상으로, 모바일 검증은 현재 연결된 Android로 수행하며 iOS는 사용자가 실사용 검증한다. 가능한 도메인 단순화도 조사·정리한다. 기존 기능과 외부 동작을 유지하며 중복·과설계·불필요한 절차를 제거하는 KISS 리팩토링을 적용하고 승인된 작업을 단위마다 중단하지 않고 완료한다.

추가로 사용자는 Emil을 준수 의무가 아닌 참고로만 사용하라고 명시했고, 영상 재생 개선·최적화도 작업에 포함했다. USB 디버깅은 사용자 직접 승인 후 현재 SM-F711N/Android15 연결을 확인했다. 구현 선택·벤치마크·실제 재생 결과는 검증 기록으로 구분한다. 기존 원본 보존·무료·중지 자동화·Notion 폐기 경계는 유지한다. D078의 운영 반영 승인은 완료된1.22.1 대상이며 신규 운영 반영은 구체적인 결과 준비 후 확인한다.

sweep: current work resumed on codex/responsive-player-redesign; current checkpoint/QA owner follows this scope, historical acceptance and releases preserved (2026-10-04).

## D-082 · 준비된1.23.0 운영 반영 승인 — 2026-10-04 (User-confirmed)

검증된1.23.0 공개 소스8ee61df를 main 병합·push하고 현재 Worker에 반영하며 기존 주소·로그인 설정을 유지한다는 구체적인 질문에 사용자는 “운영 반영 승인”이라고 답했다. 준비된65파일 ZIP/Worker 디렉터리를 사용해 배포하고 정상 업데이트·운영 재생을 확인한 뒤 마무리한다. D081의 이번 운영 승인 대기를 해소한다. 신규 origin/OAuth 이관, 원본 변경, 새 grant, 결제, 영구삭제, Notion 릴리즈 및 자동화 재개는 포함하지 않는다.

## D-083 · 기능·UI/UX 결함 수정과 운영 배포 승인 — 2026-10-04 (User-confirmed)

사용자는1.23.0 관찰에 근거한3.1–3.11 요구와 Desktop/drive original의5개 이미지 전체 파일명 지시를 범위로 정했고, “병합·push·운영 배포 까지 해라. 승인한다.”라고 명시했다. 현재 구현·동작부터 확인하여 기해결은 재검증하고 기존 정책을 보존한다. PC 실제 브라우저와 현재 연결된 Android에서 실제 입력·드래그·스와이프를 검증한다. 함수 호출이나 에뮬레이션을 실기기 통과로 기록하지 않는다. iOS는 사용자의 별도 실사용 검증이며 이번 실행과 완료 조건에서 제외한다. 자동화 PAUSED, D079 Notion 폐기, 동일 origin/backend 및 원본 보존 경계는 유지한다.

사용자는 “Emil UI 기준은 그냥 참고만 해 … 니가 직접 시각적으로 검증해서 판단해.”라고 재확인했다. 디자인 참고자료 준수 자체를 목표로 삼지 않고 실제 화면과 조작으로 요구 충족 여부를 판단한다. 구현 선택·원인·시간제한 수치와 테스트 결과는 QA 기록이 소유하며 사용자 확정 결정과 구분한다.

## D-084 · 1.23.1 잔여 개선과 실제 PC·Android 검증 — 2026-10-04 (User-confirmed)

사용자는 main a5893dc/1.23.1을 기준으로 검색·목록 경계 일관성, 모바일 새로고침 원형, 터치 배경 잔류, 후속 페이지 로딩, PNG 문구, 진행 막대 조작 영역, 트랙 실패→재시도→성공, Android 재개방과 실제 연속 재생을 요청했다. Desktop/drive original의 새 이미지3개 전체 파일명과 표시 위치를 함께 읽는다. 원인 확인 전 구현 방식을 단정하지 않고 기해결 항목은 관련 회귀만 확인한다. iOS 직접 검사는 제외하고 사용자 실사용 검증으로 남긴다. D083의 같은 요청에서 부여된 병합·push·동일 운영 배포 권한과 D079 Notion 폐기·자동화 PAUSED·원본/보안 설정 보존 경계를 유지한다.

→ origin 유지 조항만 D-085로 superseded (2026-10-04); 나머지 완료 범위와 경계는 유지.

## D-085 · 짧은 workers.dev 운영 주소로 변경 요청 — 2026-10-04 (User-confirmed; supersedes D084 origin-maintenance clause only)

사용자는 `drive-original.jbs.workers.dev`로 변경하라고 명시한 뒤, "우선 jyw.workes.dev 를 먼저 시도해줘."라고 지시했다. 앞선 workers.dev 주소 구조 설명의 맥락에서 `workes.dev`는 오타, `jyw`는 대체 계정 하위 도메인으로 읽고 이 해석을 사용자에게 밝혔다. 이번 주소 변경 및 필요한 기존 Google 로그인 설정·운영 연결의 이전은 요청 범위다. 원본 미디어·새 접근 권한·결제·Notion·자동화 재개는 포함하지 않는다. 미확정 대체 이름은 임의로 적용하지 않는다.

Observed: 기존 Wrangler 인증을 사용한 Cloudflare 조회에서 jbs/jyw 모두 HTTP403/code10031 unavailable. jbs-drive/jbs-original/jyw-drive는 HTTP404/code10032 available but not configured. 이는 조회 시점의 가용성이고 예약·주소 변경·배포 성공이 아니다. 기존 운영 주소, Worker, OAuth 설정, 공개 소스는 변경하지 않았다. 사용 가능한 대체 이름의 사용자 선택을 요청했다.

sweep: current checkpoint and session log aligned to address-name blocker; historical release addresses retained, runtime config unchanged (2026-10-04).

→ name-selection blocker resolved by D-086 (2026-10-04).

## D-086 · drive-original.jyw-drive.workers.dev 확정 — 2026-10-04 (User-confirmed)

사용자는 사용 가능 여부 조회와 대체 주소 질문에 "drive-original.jyw-drive.workers.dev로 변경"이라고 명시했다. D085의 이름 선택 대기를 해소하고 이 정확한 주소로 필요한 원격 Worker/계정 이름·Google 로그인 허용 주소·운영 연결을 변경·배포·검증한다. 같은 앱의 기존 계정·인증 데이터와 비밀키는 보존하며 새 접근 권한·결제·원본 미디어 변경·Notion·자동화 재개는 포함하지 않는다.

실제 가용성·수정 방식·데이터 이전·로그인·재생 결과는 이번 주소 변경 기록이 소유한다. 선택 확정은 성공 증거가 아니며, 이전 workers.dev 주소에 설치한 앱/쿠키/로컬 상태가 자동으로 이전된다고 가정하지 않는다.

## D-087 · 라이브러리 테두리 제거로 시각적 일관성 유지 — 2026-10-08 (User-confirmed)

사용자는 첨부 화면의 새로고침 버튼과 검색창·폴더 목록의 테두리 차이를 지적하며 "자연스럽게 없애는 걸로 통일하자. KISS 원칙 준수해."라고 요청했다. 라이브러리의 장식용 외곽선을 제거하는 방향으로 수정한다. 구현 선택과 검증 범위는 세션 기록이 소유한다. 기존 D084 경계 일관성의 목표는 유지하며 당시 1px 외곽선 구현을 이번 요청에 맞게 변경한다.

## D-088 · UI 역할별 체계와 폴더 목록 로딩 개선 — 2026-10-08 (User-confirmed)

사용자는 "버튼,타이포 기타 등등 UI문법 체계 및 위계 갖추고 위계마다 통일해서 일관성 갖춰"라고 요청했다. 이어 ㅇㅎㅎ 폴더의 하위 폴더 제외 파일2052개와 앱의 "폴더2개 · 미디어458개 표시 · 추가 항목 있음" 차이가 순차 수집 부재인지 표시 오류인지 확인하고 로딩 시스템을 개선하라고 요청했다. D087의 테두리 제거와 KISS 방향을 유지한다.

원인,2052전체 파일과 지원 미디어 수의 구분, UI 역할/크기/색상 및 순차 수집 방식은 관찰·구현 선택으로 QA/세션 기록이 소유한다. 이번 요청의 로컬 구현·검증을 수행하며 완료된 이전 릴리즈의 운영 승인으로 새 병합·push·배포를 확장하지 않는다. 기존 원본 보존·인증 경계·Notion 폐기·자동화PAUSED와 역사적 인수 범위는 유지한다.

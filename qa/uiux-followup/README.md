# 1.23.1 잔여 개선 — D084

기준 main `a5893dc`/공개1.23.1 `4fbbb5f`, 최종 운영1.23.3 `8bc5938`. 실제 PC와 연결된 Android를 검증했고 iOS는 사용자 실사용 검증으로 남긴다. 새 이미지3개의 전체 파일명과 표시 위치를 읽었다. Emil은 참고이며 실제 시각 검토가 판단 기준이다.

## 확인된 원인과 수정

| 항목 | 확인된 사실 | 적용 |
|---|---|---|
| 검색·목록 경계 | 검색창/버튼은 다른 배경과 진한 경계, 폴더/카드는 서로 다른 반투명0.5px 경계 | 기존색상 안에서 차분한 배경과1px 경계로 맞춤. 입력/버튼/목록 역할, 눌림·선택·포커스 보존 |
| 모바일 원형 |40px 높이에 기존 터치 최소높이44px가 이겨40×44. 긴 문구의 flex 축소 가능 |44×44, 축소 금지, 헤더 문구 줄바꿈 |
| 터치 배경 | 폴더 hover가 터치에도 적용. 기존 카드에도 일부 무조건 hover 효과 | 정확한 hover+fine 환경에서만 지속 hover, 터치 active·키보드 focus-visible·실제 selected 유지 |
| 다음 페이지 | 실제 PC458개/next=true/loading=false인데 로딩 문구·spinner 유지. no-match 검색 뒤918개/idle에서 다시 멈춤. 다른 플레이어 인구 수집으로 전체2020개 도달 | 요청 중/추가 항목/실패/완료 구분, 기존 더 불러오기 버튼 노출. 완료·렌더 후 화면 근처 sentinel 재확인, 실패 자동 반복 금지. 이전 폴더 응답 차단, 불완전/반복 cursor 결과 보존 후 실패. 검색·필터 요약은 실제 표시 결과 집계 |
| PNG 안내 | 실제 PNG에서 영상용 stage/entry 이름. 카드 기본 문구도 영상용 | 이미지 stage에는 지원하지 않는 Space 재생 안내 제외, 이미지 제어 열기/원본 이미지 보기. 영상 전환 때 기존 영상 안내 복원 |
| 진행 막대 |9a51272의 모바일 간격 축소에32→24px 포함, 별도 조작 근거 기록 없음. 선3px와 실제 hit container는 별개. PC 네 모서리는 pill radius 때문에 부모 여백에 hit되어 입력 누락 | desktop32px, coarse/mobile44px. 선3px 유지, desktop hit container만 radius0. 실제 상·하단/양 끝 입력 검증 |
| 트랙 실패 복구 |1.23.1 코드의 상태·재시도 구현은 기해결 | 실제 선택적 조회 GET 하나를 통제 실패시켜 버튼 재시도 검증. 제품 트랙 코드 변경 없음 |
| Android45초 | 과거 실패 trace 없어 원인UNKNOWN | 단순 대기조건뿐 아니라 실제 미디어 시간·프레임·오류/버퍼·SW·이벤트를 비교. 재현되지 않으면 결함 원인으로 단정하지 않음 |

## 로컬 검증

915/915 제품 검사 통과.10개 페이지 집중검사는 실제 로딩/idle/실패/명시적 재시도, 빈/짧은 페이지 연속, 스크롤·중복 요청, 이전 폴더 늦은 응답, 필터/좋아요/전체 인구 수집, 잘못된 cursor, 캐시 뒤로 이동, 렌더 결과 수를 검증한다. 기존 배속·PNG 전환 검사는 stage/entry 이름 갱신도 확인한다.

격리 Chrome의360×740/1188×900/844×390 화면과 키보드/터치 emulation에서 원형·경계·focus/active/hover·선/조작 영역을 확인했다. Root가 최종 모바일 목록과 가로 플레이어 화면을 직접 시각 검토했다. 이는 실제 계정/휴대폰 증거와 별개다. 초기 로컬 MP4 fixture의 session/Range 준비 문제는 prior를 보존하고 올바른 Range fixture로 수정했으며 제품 재생 코드를 바꾸지 않았다.

## 실제 검증 결과

PC는 Windows11 Pro10.0.26200의 정상 사용자 프로필 Chrome154.0.8037.93, 최종1536×639이며 중간816×627도 실제 창으로 확인했다. 기존 운영 탭/로그인을 유지했고 임시 소스 치환 없이 정상1.23.2/1.23.3 업데이트를 받았다. 실제 폴더 진입458개/idle에서 추가 항목 안내와 버튼을 확인한 뒤 no-match 검색으로2020개·next=false까지 연속 수집, 실제 표시0개·로딩 종료를 확인했다. 선택적 다음 페이지 GET만 ConnectionReset→명확한 실패/활성 재시도→실제 버튼 클릭→2020개 완료. 보류된 다음 페이지 GET 도중 상위 폴더로 이동하고 요청을 풀어도 root14폴더/0미디어/idle 유지, 이전 결과 혼입 없음. 초기 과도한 패턴은 account-state OPTIONS에 걸려 목적에 맞지 않았으므로 통과 증거로 사용하지 않고 정확한 pageToken GET 패턴으로 수정했다. 최종 모든 intercept 해제.

1.23.1에서 실제 카드/메뉴로 트랙을 열고 페이지의 선택적 direct Drive GET Range 하나에 ConnectionReset을 주입했다. native SW/운영 데이터/보안 설정은 변경하지 않았다. 명확한 실패+활성 재시도 버튼→실제 클릭→ready/음성1·자막0/정리 완료 통과. 이때 짧은 영상은 자연 종료됐으므로 실패 중 연속 재생 유지 증거는 아니다. 트랙 구현은 최종 버전까지 변경되지 않았다.

PC1.23.2의 실제62,209바이트 PNG는 읽기 전용 메타데이터를 임시 목록에 준비한 뒤 실제 카드 클릭으로2400×840 디코딩을 확인했다. 카드/entry/stage에 이미지 문구, Space 안내 없음, 이미지 이전/다음 문구·화질 숨김 통과. Esc 후 원래 카드와 focus-visible 복원, 정상 reload로 임시 목록 제거. 영상으로 전환하면 영상 안내 복원. 실제 Shift+Tab은 닫기→마지막 SUMMARY,1.5배 실제/버튼/메뉴 일치→다른 영상1배 초기화, 재생·음소거 SVG 실제 display 상태 일치, 설정 하단537.6px→Esc→톱니바퀴 재개방0px, 검색 입력 중 Space, 필터·이름 정렬·폴더 뒤로/앞으로 통과. PC1.23.3에서32px 탐색 영역 네 모서리±2px 클릭은 시작0.064/0.318초·끝47.746/47.810초, 아래쪽 가장자리 드래그31.076초, 포인터 정리 및 오류 없음. 최초 모서리 누락은1.23.2에 재현/이벤트 대상 기록 후 수정했으며, 기준을 낮춰 통과시키지 않았다.

Android는 Samsung SM-F711N/Android15/Chrome154.0.8037.126. 정상 운영1.23.1에서 짧은20,891,042바이트/긴574,835,662바이트 원본을 실제 카드 터치로 각각3회 시작했다.6회3.165–3.198초, 실제 시간·프레임 진행과 이전 readiness oracle 함께 충족. 과거45초의 원인은 여전히UNKNOWN. 원본 긴 영상에서 탐색 없는1배속 연속900.029초 동안 미디어900.037초(0.459→900.496),26974프레임 진행.90개 관측 구간의 멈춤 없음, waiting/stalled/seeking/pause/error 증가0, dropped3. 실제15분 검증이며 전체41분53초 완료나 열/메모리 전반 검증이 아니다. 재생 구현은 최종 버전까지 그대로여서 이 증거를 재사용한다.

Android 선택적 트랙 Range 실패 시 실패/재시도 가능 상태, 재시도 후 메타데이터 확인 완료 및 기존 긴 영상 인덱스 제한으로 지원 불가 상태를 구분했다. 재시도 중 native는57프레임/1.913초 진행하며 오류 없음. 요청 보류 중 메뉴 닫기·다른 영상 전환 후 이전 owner 정리·늦은 응답 차단 통과. 실제 대체 트랙 존재를 추측하지 않았다.

운영1.23.2 Android는 실제 세로/가로18개 입력에서44px 진행 막대 상·하단 가장자리/양 끝 탭·드래그, 중앙 재생·외곽 오버레이·스와이프·EOF 재시작 통과. 실제360×744 목록에서 새로고침44×44/넘침 없음, 추억 폴더 터치·복귀 후 배경/그림자 동일·hover/focus-visible=false, 실제 PNG 카드 터치 후 선택 없음 및 키보드 focus-visible=true 통과. 운영1.23.3 실제 APP/활성SW 일치 후 모바일 막대 네 모서리±2px 터치도 목표 시간·14/14/14/15프레임 진행으로 확인. 네이티브 seeking과 실제 isSeekingPointer가 모두 해제된 상태를 확인했다. 정상 가로800×280에서는 desktop seek 컨테이너가 숨겨지고 모바일44px 막대가 표시되는 적용 범위를 별도 기록했다. 숨긴 desktop 영역을 강제로 노출하여 Android 통과로 주장하지 않는다.

첫 수정본 admission의 app1.23.2/SW1.23.1 혼합은 UI검사 전 중단, 정상 registration.update/settlement로 해결했다.18입력 후 라이브러리 QA가 없는 state.loading을 기다린 실패는 보존하고 실제 loadingFiles oracle만 고쳐 남은 목록 검사만 수행했다. production-controls-result의 completed=false는 그 뒤 QA 실패이며18개 실제 조작은 통과, 별도 production-library-result completed=true로 보완했다. 뷰포트와 원본1920×1080 해상도를 혼동한 보고 필드도 명시적으로 정정했다. 통합 검토에서 없는 state.isSeeking 대신 native video.seeking과 isSeekingPointer로 관측·대기 조건을 강화했고, 실제 네 모서리만 한 번 재검증해 통과했다. 기존18입력/900초 원본은 시간·프레임 증거와 함께 보존했으며 반복하지 않았다. 기기 회전/stay-awake/tabs/helpers/forward·관측기·intercept 모두 복원했다.

`android.cjs --production`은 기존1.23.1 재개방·15분 연속·선택적 트랙 실패/재시도용이다. `--controls`는 수정본의 실제 입력 회귀용으로 사용한다. ADB의 독립 forward/DevTools 연결을 사용하고 기기 회전·stayawake·인터셉트·임시 관측·탭·forward를 복원한다. 입력은 물리 Android 브라우저의 trusted CDP touch이며 사람 손가락 검증은 아니다. 파일 ID·실제 계정 화면·실패 raw 결과는 workspace maintenance/tools/uiux-followup 또는 uiux-polish-followup에만 보존한다.

## 배포와 남은 검증

main 병합/push, 동일 Worker 운영1.23.3 배포9ab1e4ad-477a-4ea3-b985-23578c74e68c 및5변경 공개 응답/64package Git blob 일치·private4routes404 통과.1.23.2의915검사와1.23.3의 버전·static20검사, 실제 수정 경계 재검증을 사용하며 전체 중복 테스트를 추가하지 않았다. 과거45초 실패 원인은 미확정, iOS는 사용자 검증 예정. 전체41분53초/모든 코퍼스/사람 손가락 검증은 수행하지 않았다. 기존 자동화PAUSED·Notion폐기·원본/보안 설정 유지.

## Current address note — 2026-10-04

D086 changed the operating origin to https://drive-original.jyw-drive.workers.dev/. `android.cjs` follows that address. The dated replay above was performed before this migration and keeps its original release identities; current address/login/playback evidence is owned by [ADDRESS-MIGRATION-20261004.md](../../memory/ADDRESS-MIGRATION-20261004.md).

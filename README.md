# Drive Original

Google Drive의 저화질 미리보기 대신 **원본 파일 바이트**를 iPhone Safari로 전달하는 정적 PWA입니다. 별도 앱 서버나 데이터베이스가 필요하지 않습니다.

## 정확히 무엇을 하는가

1. Google Identity Services로 사용자가 직접 Drive 읽기 전용 권한을 승인합니다.
2. Drive API에서 영상과 이미지 목록을 불러옵니다.
3. Drive가 제공한 실제 썸네일을 파일 카드에 표시합니다.
4. 재생기가 요청한 `Range` 바이트 구간을 서비스 워커가 가로챕니다.
5. 서비스 워커가 메모리의 액세스 토큰을 붙여 Drive `files.get?alt=media`에 전달합니다.
6. 구간 스트림이 실패하면 원본 전체를 브라우저 메모리에 임시로 불러와 다시 재생합니다.
7. 원본 코덱을 브라우저가 해독하지 못하면 Google Drive 호환 미리보기로 자동 전환합니다.

기본 경로와 임시 버퍼 경로는 원본 바이트를 사용합니다. Google Drive 호환 미리보기는 두 원본 경로가 모두 실패할 때만 마지막 수단으로 사용합니다.

## 재생 우선순위

1. **원본 구간 스트림**: 원본 화질, 필요한 바이트만 전송
2. **원본 임시 버퍼**: 원본 전체를 메모리에만 임시 저장하고 플레이어를 닫으면 해제
3. **Drive 호환 재생**: Google의 변환 미리보기를 사용하므로 화질이 낮아질 수 있음

## 중요한 한계

- **네트워크 전송 없는 스트리밍은 불가능합니다.** 재생하려면 필요한 바이트가 네트워크를 통해 기기의 임시 버퍼로 들어와야 합니다. 이 앱이 보장하는 것은 파일 앱이나 사진 앱에 영구 저장하지 않고, 재생에 필요한 구간만 요청하며, 미디어 응답을 앱 캐시에 저장하지 않는다는 뜻입니다.
- 원본 화질과 재생 가능성은 별개입니다. 브라우저가 원본 코덱 또는 컨테이너를 지원하지 않으면 마지막 단계에서 Drive 호환 미리보기로 전환합니다.
- iPhone에서는 **MP4 또는 MOV 컨테이너 + H.264 또는 HEVC 영상 + AAC 오디오** 조합이 가장 안정적입니다. MKV와 일부 WebM, 특수 오디오 코덱은 실패할 수 있습니다.
- 정적 웹앱만으로 모든 코덱을 원본 화질로 변환하는 것은 불가능합니다. 모든 형식의 원본 화질 재생을 보장하려면 FFmpeg 기반 서버 트랜스코딩 인프라가 필요합니다.
- 임시 버퍼는 전체 파일을 메모리에 담으므로 모바일은 350MB, 데스크톱은 2GB를 자동 전환 한도로 사용합니다. 더 큰 파일은 바로 Drive 호환 재생으로 전환합니다.
- Google OAuth 액세스 토큰은 짧게 유효합니다. 만료되면 사용자가 버튼을 눌러 연결을 갱신해야 합니다.
- 다운로드가 금지된 공유 파일은 원본 스트리밍도 할 수 없습니다.

## 1. 웹에 올리기

이 폴더는 빌드가 필요 없는 정적 사이트입니다. HTTPS를 제공하는 GitHub Pages, Cloudflare Pages, Netlify 등에 폴더 내용을 그대로 배포하세요.

로컬 확인:

```bash
cd drive-original
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 엽니다. 실제 iPhone 사용은 HTTPS 배포 주소가 필요합니다.

## 2. Google Cloud 최초 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만듭니다.
2. **API 및 서비스 → 라이브러리**에서 **Google Drive API**를 사용 설정합니다.
3. **Google Auth Platform / OAuth 동의 화면**을 구성합니다.
4. 앱이 테스트 상태라면 **테스트 사용자**에 본인의 Google 계정을 추가합니다.
5. **클라이언트 → 클라이언트 만들기 → 웹 애플리케이션**을 선택합니다.
6. **승인된 JavaScript 원본**에 배포 사이트의 원본만 추가합니다.
   - 예: `https://example.com`
   - GitHub Pages 예: `https://조직명.github.io`
   - 경로와 마지막 슬래시는 넣지 않습니다.
7. 생성된 `…apps.googleusercontent.com` 형식의 클라이언트 ID를 앱 첫 화면에 붙여넣습니다.

클라이언트 ID는 공개 식별자이며 비밀번호가 아닙니다. 그래도 승인된 JavaScript 원본을 정확히 제한해야 다른 사이트에서 무단 사용하기 어렵습니다.

## 3. iPhone에 설치

1. iPhone Safari에서 배포 주소를 엽니다.
2. Google Drive 연결을 완료합니다.
3. Safari의 **공유 → 홈 화면에 추가**를 선택합니다.
4. 홈 화면의 Drive Original을 실행합니다.

홈 화면 앱에서 Google 로그인 팝업이 완료되지 않으면 Safari 탭에서 먼저 연결하세요.

## 개인정보와 보안

- 권한: `drive.readonly`만 요청
- 액세스 토큰: 메모리에만 보관, 로컬 저장소에 저장하지 않음
- 장기 갱신 토큰: 사용하지 않음
- 미디어 경로: 브라우저 ↔ Google Drive API
- 자체 서버 업로드: 없음
- 미디어 Cache Storage 저장: 없음
- 로컬 저장소에 남는 값: OAuth 클라이언트 ID 하나

## 파일 구조

```text
index.html
styles.css
app.js
sw.js
manifest.webmanifest
icons/
README.md
LICENSE
```

## 개발용 데모 화면

Google 계정 연결 없이 UI만 확인하려면 주소 끝에 `?demo=1`을 붙입니다.

```text
http://localhost:8080/?demo=1
```

데모 모드는 실제 Drive 요청을 보내지 않습니다.

## 기술 근거

- Google Drive API의 `files.get`과 `alt=media`는 Drive에 저장된 바이너리 파일 내용을 반환합니다.
- Drive API는 `Range` 헤더를 이용한 부분 다운로드를 지원합니다.
- HTTP 범위 요청은 영상 재생기의 임의 위치 탐색과 부분 전송에 쓰입니다.
- Google Identity Services의 토큰 모델은 브라우저에서 REST와 CORS로 Google API를 호출하도록 설계됐습니다.

## 라이선스

MIT

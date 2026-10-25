정적 파일 빌드와 배포

편집할 파일
- app/js/ 아래 원본 모듈과 app/css/ 아래 원본 스타일을 수정합니다.
- app.<해시>.js, site.<해시>.css, js/build-manifest.json은 직접 편집하지 않습니다.
- 새 스타일 파일을 추가하면 이 폴더의 styles.json에 적용 순서대로 추가합니다.

이 폴더에서 실행
1. pnpm install --frozen-lockfile --ignore-scripts
2. pnpm run build
3. pnpm run check

Node.js와 pnpm은 개발 PC의 빌드 도구입니다. 운영 Python 서버에는 설치할 필요가 없습니다.
esbuild 버전은 package.json과 pnpm-lock.yaml에 고정되어 있습니다.

빌드 결과
- js/app.<내용 해시>.js: 기존 ES 모듈을 실행 순서와 기능을 유지해 묶습니다.
- css/site.<내용 해시>.css: styles.json 순서와 내부 @import를 유지해 묶습니다.
- index.html: 새 파일 주소를 참조합니다.
- js/build-manifest.json: 원본과 결과물의 SHA256을 기록합니다.
- --check는 파일을 쓰지 않고 원본과 결과물의 일치 여부를 검사합니다.

배포/커밋할 파일
변경한 원본, 새 묶음 JS/CSS, index.html, js/build-manifest.json을 함께 반영합니다.
tools/web-build의 스크립트·설정·잠금 파일도 저장소에 보관하되 node_modules는 제외합니다.
배포 직전에 pnpm run check를 실행합니다. API 응답·CSV·로그인·서비스워커는 장기 캐시 대상이 아닙니다.

브라우저 동작
HTML은 새로 읽고, 내용 해시가 일치하는 묶음 파일만 장기 캐시합니다.
소스를 바꾸어 다시 빌드하면 파일 주소가 달라져 새 버전이 자동 선택됩니다.
이미 열린 화면을 위해 빌드 도구는 이전 묶음 파일을 자동 삭제하지 않습니다.
업데이트 확인은 일반 새로고침으로 충분합니다. 매번 캐시를 지우지 않아도 됩니다.

서버 설정
server.WebServer의 request_queue_size는 128입니다. 이는 연결 수락 대기열 크기이며,
활성 사용자 수나 동시 작업 스레드 수를 128개로 제한한다는 뜻은 아닙니다.
인증·권한·알림·DB 계산 로직과 HTTP 프로토콜은 변경하지 않았습니다.

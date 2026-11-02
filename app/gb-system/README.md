# GB system · 최종 PR 검토 후보

2026-10-25 운영 배포 `gummybearing-fan:v18-report-preview-20261025`에서 미사용 자산과 중복 자료를 덜어낸 소스입니다. 실행 코드·현재 번들은 유지하고 최적화 이미지 목록 JSON만 남긴 자산에 맞췄습니다. 기존 작업본은 `outputs/gummybearing-role-preview-20261023/`에 남겨 두지만, 이 폴더의 로컬 실행에는 `outputs/`가 필요하지 않습니다. 세 PR을 합친 상태에서 사용합니다.

```text
app/             Python 웹서버·정적 화면·서비스용 데이터·테스트
db/              DB 기본 구조와 새 로컬 연습 DB용 mock seed
migrations/      기능별 추가 스키마 이력
compose.local.yaml  별도 로컬 검토 환경
tools/start_local.py  새 로컬 DB 초기 설치 / 기존 로컬 데이터 유지 후 시작
```

저장소 루트에서 `python tools/prepare_final_pr.py --check`로 선별 원본과의 차이를 확인합니다. 원본 수정이 완료된 후 `python tools/prepare_final_pr.py`로 후보를 갱신할 수 있습니다. `docs/final-pr/pr-exclusions.json`의 제외 규칙과 최적화 목록 필터링을 재적용하며, 후보를 따로 수정했다면 자동 덮어쓰기를 중단합니다.

## 로컬 실행

Docker Desktop(또는 로컬 Docker Engine + Compose)과 Python 3.11 이상을 준비하고, 저장소 루트에서 실행합니다.

```sh
python app/gb-system/tools/start_local.py
```

Docker가 PATH에 없다면 `--docker "Docker 실행 파일의 절대 경로"`를 추가합니다. 완료 후 `http://127.0.0.1:18088/`에서 역할 선택으로 검토합니다. 초기 mock 데이터와 데모 계정은 새 빈 DB에만 생성하고, 이후 실행은 기존 로컬 기록을 유지합니다. 초기화 도중 실패해 DB가 이미 존재하면 자동 초기화를 중단합니다.

이 환경은 `gb-final-pr-review` 프로젝트와 전용 DB·상태 볼륨을 사용합니다. DB 비밀번호는 Git에서 제외한 `.runtime/`에 생성합니다. 이메일·푸시 발송은 꺼져 있고, 원격 Docker 연결을 거부합니다. AWS 배포 스크립트가 아니므로 운영 서버에 이 Compose를 적용하지 않습니다.

데이터를 유지하고 로컬 서버를 종료하려면 저장소 루트에서 다음 명령을 사용합니다.

```sh
docker compose -p gb-final-pr-review -f app/gb-system/compose.local.yaml stop
```

Docker 빌드 컨텍스트는 `app/gb-system/app/`입니다. 이미 생성된 JS/CSS 번들을 포함하므로 로컬 서버 실행에는 Node가 필요하지 않습니다. 화면 원본을 수정할 때는 `app/tools/web-build/README.txt`에 따라 번들도 다시 빌드합니다.

## 검증

Node.js를 준비하고 로컬 이미지 생성 후 저장소 루트에서 실행합니다.

```sh
python tools/prepare_final_pr.py --check
python tools/validate_final_pr.py --node node --docker docker
```

Python 회귀 테스트는 네트워크 없는 임시 컨테이너에 소스만 읽기 전용으로 연결합니다. 운영/로컬 DB 볼륨을 연결하지 않습니다. Docker 옵션을 생략하면 현재 Python 환경에 `app/requirements.txt` 의존성이 있어야 합니다. `tests/`의 기존 HTTP 통합·fixture 스크립트 일부는 이전 검토 환경 전용이므로 전체 디렉터리를 무조건 실행하지 않습니다.

DB 파일은 운영 DB 백업이 아닙니다. `02_mock_seed.sql`은 새 연습 DB용이며, `tools/manage_users.py init`은 데모 계정 설정 도구입니다. 기존 계정을 유지하는 운영 업데이트에 자동으로 실행하지 않습니다. 이미 적용된 스키마를 확인하지 않고 migration 전체를 재실행하지 않습니다.

자세한 담당/검토 순서는 저장소의 `docs/final-pr/README.md`를 참고합니다.

## 단체 체험 시작 제한 (2026-10-26 운영 수정)

운영 이미지 `gummybearing-fan:v19-experience-capacity-20261026`부터 새 체험 생성 시도는 IP별 1시간 300회, 서비스 전체 1시간 1,000회로 제한합니다. 같은 와이파이를 사용하는 100명 이상의 발표 참석자를 고려한 기준이며, 동시 접속 처리 성능을 보장하는 수치는 아닙니다. 기존 체험 세션의 조회·복원은 새 체험 생성 횟수에 포함되지 않습니다.

운영 HTTPS 구성은 Caddy가 전달하는 실제 접속 IP를 사용하도록 웹 컨테이너에 `GB_TRUST_PROXY_HEADERS=1`을 지정합니다. 이 설정은 웹 포트가 `127.0.0.1:8081:8000`으로만 공개되고, Caddy가 외부에서 받은 `X-Forwarded-For`를 신뢰하지 않는 기본 구성을 유지할 때만 사용합니다. 웹 포트를 외부에 직접 공개하는 환경에는 이 설정을 추가하지 않습니다. 로컬 Compose는 기존 기본값을 유지합니다.

`tests/test_experience_capacity.py`는 공유 IP 150회 생성, IP별 301번째·전체 1,001번째 차단, 기존 카운터 유지, 1시간 후 재허용과 프록시 IP 처리를 검사합니다. AWS에서는 후보 이미지를 네트워크·DB 볼륨 없이 실행해 9개 검증을 통과한 뒤 웹 컨테이너만 교체했습니다. DB 백업·기존 볼륨 유지 및 실제 방문자 1명의 시작·세션 복원·설비 6대 조회를 확인했습니다. 변경 근거는 `docs/final-pr/experience-capacity-verification.json`에 기록했습니다.

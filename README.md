# 🧸 GummyBearing

### 베어링 진동 데이터 기반 이상징후 탐지 및 교체 시점 권고

포스코 K-뉴딜 아카데미 「설비 고장을 예측하는 AI 데이터 분석」 통합 프로젝트

## 1. 프로젝트 소개

베어링 진동 데이터를 분석하여 열화 시작 시점을 탐지하고, 이상징후 판단 근거를 기반으로 점검 및 교체 권고 시점을 제안하는 프로젝트입니다.

**분석 데이터**
* NASA IMS Bearing Dataset
* CWRU Bearing Dataset

**프로젝트 목표**

* 최소 목표: 열화 시작 판정 규칙 수립 및 교체 권고 시점 제시
* 최대 목표: Streamlit 대시보드 또는 교체 알림 프로토타입 구현 및 현장 적용 방안 제안

## 2. 프로젝트 진행 흐름

데이터 이해 → 문제 정의 → 전처리 및 EDA → 특징 추출 및 시계열 분석 → 이상탐지 및 모델링 → 모델 평가 → 교체 권고 → 현장 적용

※ 진행 상황에 따라 세부 일정은 변경될 수 있습니다.

## 3. 개발 환경

* Python / Conda / Jupyter Notebook / VS Code
* GitHub Organization을 통한 협업

**가상환경 생성 및 활성화**

```bash
conda env create -f environment.yml
conda activate GummyBearing
```

VS Code에서 Python 인터프리터와 Jupyter 커널을 `GummyBearing`으로 선택합니다.

## 4. 프로젝트 구조

```text
GummyBearing/
├── README.md
├── CONTRIBUTING.md
├── .gitignore
├── environment.yml
├── DATA/           # 원본 데이터 (Git 제외)
├── notebooks/      # 분석 Notebook
├── src/            # 재사용 Python 함수
├── figures/        # 분석 그래프
├── reports/        # 보고서 및 발표자료
├── app/            # 프로토타입 (선택)
└── tests/          # 테스트 코드
```

원본 데이터는 각자 로컬 `DATA/` 폴더에 저장하며 GitHub에 업로드하지 않습니다.

## 5. 협업 규칙

브랜치, 커밋, PR 및 파일 관리 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

## 6. 최종 산출물

* 문제정의서 및 데이터 분석 코드
* 이상징후 탐지 및 모델 평가 결과
* 열화 판정 및 교체 권고 알고리즘
* 최종 결과보고서 및 발표자료
* Streamlit 프로토타입 (선택)

---

※ 프로젝트 진행에 따라 분석 결과와 세부 내용을 업데이트합니다.

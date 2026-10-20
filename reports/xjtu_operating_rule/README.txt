XJTU-SY 모델 비교와 대표 운영 규칙 — 팀 공유본

이번 결론
N=20 · 연속 4회 · 고정 복합 B 방식 2/3을 대표 운영 규칙으로 사용함.
최적 모델 자동 선정이나 실제 열화 탐지 정확도의 우위를 주장하는 결과물이 아님.
초기 상한 초과가 같은 축의 여러 특징에서 연속 확인되는 상황을 운영 경보로 설명함.
원본 마할라노비스의 더 높은 선행시간·지속률도 비교 결과에 그대로 남겼음.

실행
1. 프로젝트 루트 또는 압축을 푼 최상위 폴더를 VS Code로 열기.
2. DATA/features/XJTU_SY_total_features.csv가 있는지 확인하기.
   팀 공유 ZIP에는 입력 CSV를 포함함. Git 저장소에서는 DATA가 제외되므로 별도 준비해야 함.
3. 사용할 Python 환경에서 다음 명령으로 패키지 설치하기.
   python -m pip install -r reports/xjtu_operating_rule/requirements.txt
4. notebooks/05_xjtu_final_model_comparison.ipynb 열기 → 해당 Python 커널 선택.
5. Restart Kernel → Run All. 위에서 아래로 실행하면 결과가 다시 생성됨.
   계산 도중 표준편차가 0이거나 공분산이 특이한 경우에는 기준을 몰래 바꾸지 않고 오류를 알림.

생성 위치
- results/xjtu_operating_rule/: 1~10번 CSV 10개, UTF-8 BOM. 엑셀 파일은 생성하지 않음.
- figures/xjtu_operating_rule/: 발표용 PNG 12개.
- 노트북: 표·그래프와 계산 코드·주석이 함께 있음.
- reports/xjtu_operating_rule/발표_설명.txt: 발표 문장과 선택 근거.
- reports/xjtu_operating_rule/analysis_protocol.json: 이번 실행의 설정·입력 해시·패키지 버전.
  노트북은 이 설정을 마지막 셀에 출력하며, 이 문서는 공유본 실행 기록임.
- tests/test_xjtu_final_model_comparison.py: 경보 정의와 실제 데이터 회귀검증.
ZIP은 저장소 밖에서 배포하며 export/exports 폴더를 생성하지 않음.

1~10번 구성
01_baseline_validation.csv
  초기 N=5~50, H/V RMS와 첨도의 MK 검증. 전체 15개를 남기고 자료 부족도 표시함.
02_rms_cumulative_consecutive.csv
  N20 통과 집단에서 고정 RMS K=1~8 누적·연속 비교.
03_fixed_single_composite.csv
  N20·K4 고정 RMS 및 B 1/3·2/3·3/3.
04_moving_single_composite.csv
  N20·K4 이동 RMS 및 B 1/3·2/3·3/3.
05_fixed_vs_mahalanobis.csv
  N20·K4 고정 RMS·복합과 원본 마할라노비스.
06_isolation_forest_thresholds.csv
  N20 IF 자동·직접 3σ 판정 K=1~8. 초기 학습 구간의 자동 이상 비율도 포함함.
07_overall_direct_comparison.csv
  N20·K4 고정 RMS·복합, 원본 MD, 직접 3σ IF.
08_common_N15_N20.csv
  N15·20 공통 통과 집단. 감시 시작은 모두 21번째. N20−N15 차이도 포함함.
09_md_direction_comparison.csv
  N20·K4 원본 MD, 증가분 MD, 고정 B 2/3 세 조건만 비교함.
10_representative_operating_rule.csv
  고정·이동 RMS/복합, 원본·증가분 MD, 직접 3σ IF 전체 비교.
  대표 운영 규칙 한 행과 선택 근거를 포함하며 최적 모델 순위나 절충 점수는 없음.

CSV 읽는 법
한 분석 파일 안에서 row_type으로 행의 종류를 구분함.
- summary: 방법별 집계.
- bearing: 베어링별 결과. 01번에서는 베어링별 baseline 검증.
- calibration: 06번 IF 상한·초기 자동 판정 진단.
- paired_delta: 08번 동일 베어링의 N20−N15 차이.
- direction_delta: 09번 원본 MD와 증가분 MD의 병렬 결과.
- operating_rule: 10번의 대표 운영 규칙. optimality_claim=False.
- selection_reason: 10번의 선택 이유와 한계. reason_no, reason_text 참조.
행 종류에 해당하지 않는 열은 빈값임. 빈값을 0이나 정상으로 해석하면 안 됨.
여러 분석 파일의 집계/개별 행을 합산하면 중복 집계되므로 필요한 row_type부터 선택해야 함.

주요 지표
- t_P: 1부터 세는 K번째 경보 확인 완료 측정번호. MK p-value와 다른 값임.
- t_P_elapsed_min: 첫 관측부터 P까지 경과 분. 측정번호 1은 경과 0분임.
- lead_time_min: 마지막 관측과 P의 시간 차이. 실제 고장 예측 시간이 아님.
- OR_persistence_pct: P를 포함해 종료까지 H 또는 V에서 현재 이상 조건이 성립한 비율.
- first_alarm_axis: H, V, H+V. 최초 확정 경보축임.
- first_axis_persistence_pct: 최초 경보축의 P 이후 이상 비율.
  동시 H+V 최초 경보이면 두 축의 비율 평균이며 OR 지속률과는 다름.
- no_alarm_count: 확정 경보가 없는 수. 비교 집단에서 제외하지 않음.
- min_lead_time_min, min_OR_persistence_pct: 전원 경보 시 전체 집단 최저값.
  두 최저값은 서로 다른 베어링에서 나올 수 있음.
- conditional_*: 경보가 난 베어링에만 한정한 별도 통계.
  미경보가 있는 방법을 전원 경보 방법보다 좋다고 평가하는 데 사용하면 안 됨.

계산상 주의
동일 특징이 같은 축에서 4회 연속 초과해야 B 방식의 한 표가 됨.
수평 RMS와 수직 Peak를 합쳐 2/3이라고 세지 않음.
최초 P와 경보 지속 표시는 별개이며, 지속률에는 횟수 조건 전의 현재 이상 여부를 사용함.
증가분 MD의 증가분은 초기 평균 대비 양의 편차임. 전 시점 대비 차분이 아님.
N20 통과 6개에 한정한 비교이며 MK 통과가 초기 정상 상태를 증명하지는 않음.

검증
python -m unittest discover -s tests -p test_xjtu_final_model_comparison.py -v
공유본은 노트북의 모든 코드 셀 실행, 내부 수치 검산, 테스트 9개를 통과했음.
저장된 실행번호는 비워 두고 표·그래프는 남겼음.
이는 이번 공유본의 저장 상태이며 팀원 VS Code의 저장 동작을 자동 변경하는 설정은 포함하지 않음.

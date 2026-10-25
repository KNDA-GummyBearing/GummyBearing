"""목업 DB 생성 스크립트.

원본 XJTU-SY 분석 CSV(data/source/XJTU_SY_service_db.csv)에서
  1) 센서 시계열      data/sensor_timeseries.csv   (화면 그래프·판정 엔진 입력)
  2) 설비 목록 DB     data/equipment_db.json / .csv
  3) 점검·정비 DB     data/maintenance_db.json / maintenance_*.csv
를 만든다.

실행:  python3 tools/build_db.py                       설비 DB·시계열 재생성 (정비 DB는 없을 때만 생성)
       python3 tools/build_db.py --reset-maintenance   정비 DB까지 초기 목업 상태로 되돌림
"""
import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "XJTU_SY_service_db.csv"
DATA = ROOT / "data"

AXES = {"h": "horizontal", "v": "vertical"}
FEATURES = ["rms", "kurtosis", "peak"]
BASELINE_N = 20
PROCESS_NAMES = {"sinter": "소결공정", "iron": "제선공정", "steel": "제강공정", "casting": "연주공정", "rolling": "압연공정"}

# ---------------------------------------------------------------------------
# 설비 목업 정의 — 실제 분석 데이터(베어링)를 가상의 배기가스 팬에 연결한다.
# demo_index: 재생 시작 위치 (v4: 모든 설비 0분 = 2026-10-26 14:00 에서 시작)
# closeup: 공장 화면 이미지(assets/img/plant_{sinter|steel}_{light|dark}.webp, 1672×941) 위 팬 위치(%)
# label: 배치도 라벨 방향 (tl 왼쪽 위 / tr 오른쪽 위 / bl 왼쪽 아래 / br 오른쪽 아래)
# 홈 화면(제철소 전체) 배치도에는 설비 대신 공장 구역을 표시한다 — 구역 좌표는 js/app.js 의 ZONES
# ---------------------------------------------------------------------------
FANS = [
    dict(equipment_id="EGF-01", equipment_name="배기가스 팬 01", process="sinter", plant="소결공장", area="1소결 주배풍기실",
         tag="SIN-EGF-01", closeup=(73.86, 69.61), label="tr",
         bearing_position="구동측(DE)", bearing_type="구면 롤러 베어링 22320", motor_kw=1250,
         manager="강민준", installed_on="2019-04-15", source_bearing="Bearing3_2", demo_index=0),
    dict(equipment_id="EGF-02", equipment_name="배기가스 팬 02", process="sinter", plant="소결공장", area="2소결 주배풍기실",
         tag="SIN-EGF-02", closeup=(64.29, 31.88), label="tl",
         bearing_position="반구동측(NDE)", bearing_type="구면 롤러 베어링 22318", motor_kw=900,
         manager="정온유", installed_on="2020-09-01", source_bearing="Bearing2_3", demo_index=0),
    dict(equipment_id="EGF-03", equipment_name="배기가스 팬 03", process="sinter", plant="소결공장", area="3소결 냉각기 배풍동",
         tag="SIN-EGF-03", closeup=(60.41, 59.51), label="tl",
         bearing_position="구동측(DE)", bearing_type="구면 롤러 베어링 22322", motor_kw=1600,
         manager="송상엽", installed_on="2018-11-20", source_bearing="Bearing3_4", demo_index=0),
    dict(equipment_id="EGF-04", equipment_name="배기가스 팬 04", process="steel", plant="제강공장", area="1전로 1차 집진설비",
         tag="STL-EGF-04", closeup=(62.2, 35.6), label="tl",
         bearing_position="구동측(DE)", bearing_type="구면 롤러 베어링 22316", motor_kw=750,
         manager="이수민", installed_on="2021-03-08", source_bearing="Bearing2_1", demo_index=0),
    dict(equipment_id="EGF-05", equipment_name="배기가스 팬 05", process="steel", plant="제강공장", area="2전로 2차 집진설비",
         tag="STL-EGF-05", closeup=(74.76, 41.98), label="tr",
         bearing_position="반구동측(NDE)", bearing_type="구면 롤러 베어링 22318", motor_kw=900,
         manager="정온유", installed_on="2017-06-12", source_bearing="Bearing2_2", demo_index=0),
    dict(equipment_id="EGF-06", equipment_name="배기가스 팬 06", process="steel", plant="제강공장", area="연주 배기설비",
         tag="STL-EGF-06", closeup=(70.57, 57.92), label="br",
         bearing_position="구동측(DE)", bearing_type="구면 롤러 베어링 22320", motor_kw=1250,
         manager="김수민", installed_on="2022-01-24", source_bearing="Bearing1_5", demo_index=0),
]


def load_source():
    rows = list(csv.DictReader(SRC.open(encoding="utf-8-sig")))
    by = defaultdict(list)
    for r in rows:
        by[r["bearing"]].append(r)
    for rs in by.values():
        rs.sort(key=lambda r: int(r["timestamp"]))
    return by


def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (";".join(v) if isinstance(v, list) else v) for k, v in r.items()})


def build_sensor_timeseries(by):
    out = []
    for fan in FANS:
        for r in by[fan["source_bearing"]]:
            row = {"equipment_id": fan["equipment_id"], "seq": int(r["timestamp"]) - 1}
            for a, axis in AXES.items():
                for f in FEATURES:
                    row[f"{a}_{f}"] = round(float(r[f"{axis}_{f}"]), 6)
            out.append(row)
    fields = ["equipment_id", "seq"] + [f"{a}_{f}" for a in AXES for f in FEATURES]
    write_csv(DATA / "sensor_timeseries.csv", out, fields)
    return len(out)


def build_equipment(by):
    rows = []
    for fan in FANS:
        rs = by[fan["source_bearing"]]
        first = rs[0]
        rec = {
            "equipment_id": fan["equipment_id"],
            "equipment_name": fan["equipment_name"],
            "tag": fan["tag"],
            "equipment_type": "배기가스 팬 (I.D. Fan)",
            "process": fan["process"],
            "process_name": PROCESS_NAMES[fan["process"]],
            "plant": fan["plant"],
            "area": fan["area"],
            "location": f'{fan["plant"]} {fan["area"]}',
            "monitored_part": "회전축 베어링",
            "bearing_position": fan["bearing_position"],
            "bearing_type": fan["bearing_type"],
            "monitored_signal": "진동",
            "sensor_axes": "수평;수직",
            "sensor_id": f'VIB-{fan["equipment_id"]}',
            "sampling_interval_min": 1,
            "motor_kw": fan["motor_kw"],
            "rated_rpm": int(first["rpm"]),
            "load_kn": float(first["load_kn"]),
            "manager": fan["manager"],
            "installed_on": fan["installed_on"],
            "alarm_rule_id": first["rule_id"],
            "data_source": f'XJTU-SY {fan["source_bearing"]} (condition {first["condition"]})',
            "data_points": len(rs),
            "demo_start_index": fan["demo_index"],
            "map_label": fan["label"],
            "map_x_pct": fan["closeup"][0],
            "map_y_pct": fan["closeup"][1],
        }
        # 정상 기준(Baseline N=20) 임계값 = 평균 + 3σ  — 판정 엔진(js/engine.js)과 같은 식
        for a, axis in AXES.items():
            for f in FEATURES:
                vals = [float(r[f"{axis}_{f}"]) for r in rs[:BASELINE_N]]
                rec[f"{a}_{f}_threshold"] = round(statistics.mean(vals) + 3 * statistics.stdev(vals), 6)
        rows.append(rec)
    (DATA / "equipment_db.json").write_text(
        json.dumps({"table": "equipment", "description": "모니터링 대상 배기가스 팬 설비 목록 (목업)",
                    "records": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(DATA / "equipment_db.csv", rows, list(rows[0].keys()))
    return rows


# ---------------------------------------------------------------------------
# 점검·정비 DB (목업 이력)
# ---------------------------------------------------------------------------
INSPECTION_FIELDS = [
    "inspection_id", "equipment_id", "inspected_at", "inspector", "operation_state",
    "noise", "noise_memo", "vibration", "heat", "visual", "visual_etc",
    "need_additional", "memo", "model_status", "decision", "recheck_date",
    "additional_items", "additional_assignee", "additional_due", "created_at", "source",
]
REVIEW_FIELDS = [
    "review_id", "inspection_id", "equipment_id", "necessity", "target", "content",
    "priority", "desired_date", "estimated_hours", "work_memo", "review_status",
    "registered_at", "source",
]
FOLLOWUP_FIELDS = [
    "follow_up_id", "equipment_id", "inspection_id", "type", "due_date", "assignee",
    "items", "status", "created_at", "source",
]
HISTORY_FIELDS = [
    "work_id", "equipment_id", "work_date", "work_type", "anomaly", "repeat_anomaly",
    "action", "result", "worker", "downtime_h", "source",
]


def seed_maintenance():
    inspections = [
        dict(inspection_id="INS-20260902-01", equipment_id="EGF-01", inspected_at="2026-09-02T10:20",
             inspector="강민준", operation_state="정상 운전", noise="이상 없음", noise_memo="",
             vibration="평소보다 증가", heat="이상 없음", visual=[], visual_etc="", need_additional="필요 없음",
             memo="구동측 베어링 하우징 진동 체감 약간 증가. 윤활 상태 양호.", model_status="주의",
             decision="계속 관찰", recheck_date="2026-09-16", additional_items="", additional_assignee="",
             additional_due="", created_at="2026-09-02T10:41", source="seed"),
        dict(inspection_id="INS-20261012-01", equipment_id="EGF-02", inspected_at="2026-10-12T14:05",
             inspector="정온유", operation_state="이상 징후 있음", noise="평소보다 증가", noise_memo="반구동측에서 간헐적 마찰음",
             vibration="평소보다 증가", heat="온도 상승 확인", visual=["오염"], visual_etc="",
             need_additional="추가 점검 필요", memo="하우징 표면 온도 평소 대비 약 8℃ 높음. 그리스 오염 의심.",
             model_status="주의", decision="추가 점검", recheck_date="",
             additional_items="윤활유 샘플 채취 및 오염도 확인", additional_assignee="정온유",
             additional_due="2026-10-21", created_at="2026-10-12T14:30", source="seed"),
        dict(inspection_id="INS-20260228-01", equipment_id="EGF-01", inspected_at="2026-02-28T09:10",
             inspector="강민준", operation_state="이상 징후 있음", noise="이상 소음 확인", noise_memo="구동측 금속성 소음",
             vibration="이상 진동 체감", heat="온도 상승 확인", visual=["누유"], visual_etc="",
             need_additional="추가 점검 필요", memo="구동측 베어링 손상 의심. 정비 검토 요청.",
             model_status="경보", decision="정비 검토", recheck_date="", additional_items="",
             additional_assignee="", additional_due="", created_at="2026-02-28T09:45", source="seed"),
        dict(inspection_id="INS-20260705-01", equipment_id="EGF-05", inspected_at="2026-07-05T15:30",
             inspector="정온유", operation_state="이상 징후 있음", noise="평소보다 증가", noise_memo="",
             vibration="이상 진동 체감", heat="이상 없음", visual=["풀림"], visual_etc="",
             need_additional="추가 점검 필요", memo="베이스 볼트 일부 풀림. 베어링 외륜 손상 의심.",
             model_status="경보", decision="정비 검토", recheck_date="", additional_items="",
             additional_assignee="", additional_due="", created_at="2026-07-05T16:02", source="seed"),
    ]
    reviews = [
        dict(review_id="MR-20260228-01", inspection_id="INS-20260228-01", equipment_id="EGF-01",
             necessity="정비 필요", target="베어링", content="구동측 베어링 교체 및 하우징 청소",
             priority="빠른 확인 필요", desired_date="2026-03-04", estimated_hours="8",
             work_memo="정기 보수 일정과 병행. 예비 베어링 재고 확인 완료.", review_status="정비 완료",
             registered_at="2026-02-28T10:05", source="seed"),
        dict(review_id="MR-20260705-01", inspection_id="INS-20260705-01", equipment_id="EGF-05",
             necessity="정비 필요", target="베어링", content="반구동측 베어링 교체, 베이스 볼트 재체결",
             priority="우선 검토", desired_date="2026-07-15", estimated_hours="8",
             work_memo="", review_status="정비 완료", registered_at="2026-07-05T16:10", source="seed"),
    ]
    follow_ups = [
        dict(follow_up_id="FU-20260902-01", equipment_id="EGF-01", inspection_id="INS-20260902-01",
             type="재확인", due_date="2026-09-16", assignee="강민준", items="진동 변화 재확인",
             status="완료", created_at="2026-09-02T10:41", source="seed"),
        dict(follow_up_id="FU-20261012-01", equipment_id="EGF-02", inspection_id="INS-20261012-01",
             type="추가 점검", due_date="2026-10-21", assignee="정온유",
             items="윤활유 샘플 채취 및 오염도 확인", status="예정", created_at="2026-10-12T14:30", source="seed"),
    ]
    history = [
        dict(work_id="WH-20251112-01", equipment_id="EGF-01", work_date="2025-11-12", work_type="윤활 보충",
             anomaly="수평 진동 증가", repeat_anomaly="N", action="구동측 베어링 그리스 보충",
             result="진동 정상 범위 복귀", worker="강민준", downtime_h=2, source="seed"),
        dict(work_id="WH-20260304-01", equipment_id="EGF-01", work_date="2026-03-04", work_type="베어링 교체",
             anomaly="이상 진동·금속성 소음 (재발)", repeat_anomaly="Y",
             action="구동측 베어링 교체, 하우징 청소", result="교체 후 진동 정상", worker="강민준 외 2명",
             downtime_h=8, source="seed"),
        dict(work_id="WH-20260618-01", equipment_id="EGF-02", work_date="2026-06-18", work_type="정렬 조정",
             anomaly="커플링 측 진동 증가", repeat_anomaly="N", action="모터-팬 커플링 축정렬 재조정",
             result="진동 감소 확인", worker="정온유", downtime_h=4, source="seed"),
        dict(work_id="WH-20260822-01", equipment_id="EGF-03", work_date="2026-08-22", work_type="정기 점검",
             anomaly="-", repeat_anomaly="N", action="베어링 상태·윤활 점검", result="이상 없음",
             worker="송상엽", downtime_h=2, source="seed"),
        dict(work_id="WH-20260530-01", equipment_id="EGF-04", work_date="2026-05-30", work_type="윤활 계통 정비",
             anomaly="-", repeat_anomaly="N", action="윤활 필터 교체", result="이상 없음",
             worker="이수민", downtime_h=2, source="seed"),
        dict(work_id="WH-20260210-01", equipment_id="EGF-05", work_date="2026-02-10", work_type="임펠러 청소",
             anomaly="분진 부착에 의한 불균형 진동", repeat_anomaly="N", action="임펠러 분진 제거 및 밸런스 확인",
             result="진동 감소 확인", worker="정온유", downtime_h=6, source="seed"),
        dict(work_id="WH-20260715-01", equipment_id="EGF-05", work_date="2026-07-15", work_type="베어링 교체",
             anomaly="이상 진동 (외륜 손상)", repeat_anomaly="Y", action="반구동측 베어링 교체, 베이스 볼트 재체결",
             result="교체 후 진동 정상", worker="정온유 외 2명", downtime_h=8, source="seed"),
        dict(work_id="WH-20260409-01", equipment_id="EGF-06", work_date="2026-04-09", work_type="정기 점검",
             anomaly="-", repeat_anomaly="N", action="베어링 상태·윤활 점검", result="이상 없음",
             worker="김수민", downtime_h=2, source="seed"),
    ]
    follow_ups += [
        dict(follow_up_id="FU-PLAN-20261027-03", equipment_id="EGF-03", inspection_id="", type="정기 점검",
             due_date="2026-10-27", assignee="송상엽", items="3소결 냉각기 배풍기 베어링 윤활·진동 정기 점검",
             status="예정", created_at="2026-10-01T09:00", source="seed"),
        dict(follow_up_id="FU-PLAN-20261103-04", equipment_id="EGF-04", inspection_id="", type="정기 점검",
             due_date="2026-11-03", assignee="이수민", items="1전로 1차 집진 팬 정기 점검",
             status="예정", created_at="2026-10-01T09:00", source="seed"),
        dict(follow_up_id="FU-PLAN-20261110-01", equipment_id="EGF-01", inspection_id="", type="정기 점검",
             due_date="2026-11-10", assignee="강민준", items="1소결 주배풍기 정기 보수 (베어링 상태 확인)",
             status="예정", created_at="2026-10-01T09:00", source="seed"),
    ]
    history += [
        dict(work_id="WH-20261006-06", equipment_id="EGF-06", work_date="2026-10-06", work_type="윤활 보충",
             anomaly="-", repeat_anomaly="N", action="구동측 베어링 그리스 보충", result="이상 없음",
             worker="김수민", downtime_h=1, source="seed"),
        dict(work_id="WH-20261014-02", equipment_id="EGF-02", work_date="2026-10-14", work_type="윤활유 분석",
             anomaly="그리스 오염 의심", repeat_anomaly="N", action="윤활유 샘플 채취 후 분석 의뢰", result="분석 결과 대기",
             worker="정온유", downtime_h=0, source="seed"),
    ]
    return dict(inspections=inspections, maintenance_reviews=reviews, follow_ups=follow_ups, work_history=history)


def merge_seed_into(db):
    """기존 정비 DB에 없는 시드 기록만 추가한다 (화면에서 등록한 기록은 그대로 유지)."""
    keys = {"inspections": "inspection_id", "maintenance_reviews": "review_id",
            "follow_ups": "follow_up_id", "work_history": "work_id"}
    seed = seed_maintenance()
    added = 0
    for table, key in keys.items():
        have = {r.get(key) for r in db.get(table, [])}
        for rec in seed[table]:
            if rec[key] not in have:
                db.setdefault(table, []).append(rec)
                added += 1
    return added


def write_maintenance(db):
    """정비 DB를 JSON(원본)과 테이블별 CSV(엑셀 확인용)로 저장한다. server.py도 이 함수를 쓴다."""
    payload = {
        "description": "배기가스 팬 점검·정비 DB (목업 + 화면에서 등록한 기록)",
        "tables": {
            "inspections": "현장 점검 결과",
            "maintenance_reviews": "정비 검토 등록 내용",
            "follow_ups": "후속 점검·재확인 일정",
            "work_history": "과거 정비 작업 이력 (조치 사례)",
        },
        **db,
    }
    (DATA / "maintenance_db.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(DATA / "maintenance_inspections.csv", db["inspections"], INSPECTION_FIELDS)
    write_csv(DATA / "maintenance_reviews.csv", db["maintenance_reviews"], REVIEW_FIELDS)
    write_csv(DATA / "maintenance_follow_ups.csv", db["follow_ups"], FOLLOWUP_FIELDS)
    write_csv(DATA / "maintenance_work_history.csv", db["work_history"], HISTORY_FIELDS)


def main():
    by = load_source()
    n = build_sensor_timeseries(by)
    eq = build_equipment(by)
    reset = "--reset-maintenance" in sys.argv
    if reset or not (DATA / "maintenance_db.json").exists():
        write_maintenance(seed_maintenance())
        note = "초기 목업으로 생성"
    else:
        db = json.loads((DATA / "maintenance_db.json").read_text(encoding="utf-8"))
        tables = {k: db.get(k, []) for k in ("inspections", "maintenance_reviews", "follow_ups", "work_history")}
        added = merge_seed_into(tables)
        write_maintenance(tables)
        note = f"기존 기록 유지 + 새 시드 {added}건 추가 (초기화하려면 --reset-maintenance)"
    print(f"sensor_timeseries.csv: {n} rows / equipment_db: {len(eq)} 대 / maintenance_db: {note}")


if __name__ == "__main__":
    main()

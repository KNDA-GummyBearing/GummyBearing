"""XJTU-SY: 원본 CSV 하나를 수평·수직 특징을 담은 한 행으로 변환한다.

메타데이터 출처: Introduction_to_XJTU-SY_Bearing_Dataset, 3쪽 Table 2.
timestamp는 파일명 숫자이며 실제 날짜가 아니다. 측정 간격은 1분이다.
fault_element는 종료 후 확인된 결함 부위이며 각 시점의 상태 라벨이 아니다.
"""

from collections import Counter
from pathlib import Path
import re

import numpy as np
import pandas as pd

from .common_features import calculate_features

CONDITIONS = {
    1: {"rpm": 2100, "load_kn": 12},
    2: {"rpm": 2250, "load_kn": 11},
    3: {"rpm": 2400, "load_kn": 10},
}

# (조건, PDF에 기록된 CSV 개수, 최종 결함 부위)
_BEARINGS = {
    "Bearing1_1": (1, 123, "Outer race"),
    "Bearing1_2": (1, 161, "Outer race"),
    "Bearing1_3": (1, 158, "Outer race"),
    "Bearing1_4": (1, 122, "Cage"),
    "Bearing1_5": (1, 52, "Inner race and outer race"),
    "Bearing2_1": (2, 491, "Inner race"),
    "Bearing2_2": (2, 161, "Outer race"),
    "Bearing2_3": (2, 533, "Cage"),
    "Bearing2_4": (2, 42, "Outer race"),
    "Bearing2_5": (2, 339, "Outer race"),
    "Bearing3_1": (3, 2538, "Outer race"),
    "Bearing3_2": (3, 2496, "Inner race, ball, cage and outer race"),
    "Bearing3_3": (3, 371, "Inner race"),
    "Bearing3_4": (3, 1515, "Inner race"),
    "Bearing3_5": (3, 114, "Outer race"),
}

BEARING_METADATA = {
    name: {
        "condition": condition,
        **CONDITIONS[condition],
        "expected_files": count,
        "fault_element": fault,
    }
    for name, (condition, count, fault) in _BEARINGS.items()
}

SIGNAL_COLUMNS = ["Horizontal_vibration_signals", "Vertical_vibration_signals"]
FEATURE_NAMES = ["rms", "kurtosis", "peak", "crest_factor"]
VALUE_COLUMNS = [
    f"{direction}_{feature}"
    for direction in ["horizontal", "vertical"]
    for feature in FEATURE_NAMES
]
FEATURE_COLUMNS = [
    "timestamp",
    "bearing",
    "condition",
    "rpm",
    "load_kn",
    "fault_element",
    *VALUE_COLUMNS,
]
ERROR_COLUMNS = ["bearing", "filename", "error"]


def find_bearing_folders(data_root, bearings=None):
    """원본 상위 폴더 아래에서 베어링 폴더를 찾는다. 중복 폴더는 오류로 알린다."""
    root = Path(data_root)
    if not root.is_dir():
        raise FileNotFoundError(f"원본 폴더를 찾을 수 없습니다: {root}")
    names = list(BEARING_METADATA) if bearings is None else list(bearings)
    if not names or len(names) != len(set(names)):
        raise ValueError("베어링 목록은 비어 있거나 중복되면 안 됩니다.")
    unknown = set(names) - set(BEARING_METADATA)
    if unknown:
        raise ValueError(f"등록되지 않은 베어링: {sorted(unknown)}")

    candidates = {name: [] for name in names}
    if root.name in candidates:
        candidates[root.name].append(root)
    for path in root.rglob("*"):
        if path.name in candidates and path.is_dir():
            candidates[path.name].append(path)
    for name, paths in candidates.items():
        if len(paths) != 1:
            raise ValueError(
                f"{name} 폴더가 {len(paths)}개입니다. 경로를 확인하세요: {paths}"
            )
    return {name: candidates[name][0] for name in names}


def extract_xjtu_features(folder_path, bearing):
    """베어링 하나를 처리하고 (특징 DataFrame, 오류 DataFrame)을 반환한다.

    특징 계산은 common_features.calculate_features를 재사용한다.
    파일 번호 누락·중복, CSV 형식, 계산 불가능한 값은 오류 목록에 남긴다.
    오류 파일은 보간하거나 일부 채널만 저장하지 않는다.
    """
    if bearing not in BEARING_METADATA:
        raise ValueError(f"등록되지 않은 베어링: {bearing}")
    folder = Path(folder_path)
    if not folder.is_dir():
        raise FileNotFoundError(f"폴더를 찾을 수 없습니다: {folder}")
    if folder.name != bearing:
        raise ValueError(f"폴더명 {folder.name}과 bearing={bearing}이 다릅니다.")

    metadata = BEARING_METADATA[bearing]
    rows, errors, candidates = [], [], []

    def record_error(filename, message):
        errors.append({"bearing": bearing, "filename": filename, "error": str(message)})

    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".csv":
            continue
        if re.fullmatch(r"[0-9]+", path.stem) is None:
            record_error(path.name, "파일명은 양의 정수.csv 형식이어야 합니다.")
            continue
        timestamp = int(path.stem)
        if not 1 <= timestamp <= metadata["expected_files"]:
            record_error(path.name, "파일 번호가 PDF에 기록된 범위를 벗어납니다.")
            continue
        candidates.append((timestamp, path))

    counts = Counter(timestamp for timestamp, _ in candidates)
    missing = sorted(set(range(1, metadata["expected_files"] + 1)) - set(counts))
    if missing:
        record_error("(파일 목록)", f"누락된 파일 번호 {len(missing)}개: {missing}")

    ordered = sorted(candidates, key=lambda item: (item[0], item[1].name))
    for number, (timestamp, path) in enumerate(ordered, start=1):
        try:
            # 1.csv와 01.csv 등 같은 측정 번호는 어느 쪽도 임의로 선택하지 않는다.
            if counts[timestamp] > 1:
                raise ValueError(f"중복된 timestamp: {timestamp}")
            df = pd.read_csv(path, skip_blank_lines=False, encoding="utf-8-sig")
            if df.shape != (32768, 2):
                raise ValueError(f"예상 크기: (32768, 2), 실제 크기: {df.shape}")
            if list(df.columns) != SIGNAL_COLUMNS:
                raise ValueError(
                    f"예상 열: {SIGNAL_COLUMNS}, 실제 열: {list(df.columns)}"
                )

            values = {}
            for direction, column in zip(["horizontal", "vertical"], SIGNAL_COLUMNS):
                features = calculate_features(df[column])
                if not np.isfinite(list(features.values())).all():
                    raise ValueError(
                        f"{direction}: 상수 신호 등으로 특징을 계산할 수 없습니다."
                    )
                values.update(
                    {f"{direction}_{key}": value for key, value in features.items()}
                )
            rows.append(
                {
                    "timestamp": timestamp,
                    "bearing": bearing,
                    "condition": metadata["condition"],
                    "rpm": metadata["rpm"],
                    "load_kn": metadata["load_kn"],
                    "fault_element": metadata["fault_element"],
                    **values,
                }
            )
        except Exception as error:
            record_error(path.name, error)
        if number % 100 == 0 or number == len(ordered):
            print(f"[{bearing}] {number}/{len(ordered)}개 파일 처리 완료")

    result_df = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    result_df = result_df.sort_values("timestamp").reset_index(drop=True)
    error_df = pd.DataFrame(errors, columns=ERROR_COLUMNS)
    return result_df, error_df

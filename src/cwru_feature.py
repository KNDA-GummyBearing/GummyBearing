import re
import numpy as np
from pathlib import Path
import pandas as pd

from .common_features import calculate_features


def extract_metadata(file_path):

    file_path = Path(file_path)

    filename = re.sub(r"\(\d+\)$", "", file_path.stem)

    pattern = (
        r"(?P<file_id>\d+)_"
        r"(?P<fault_type>Normal|IR|OR|B)"
        r"(?P<diameter>\d{3})?"
        r"(?:_pos(?P<or_pos>3|6|12))?"
        r"_(?P<load_hp>\d+)HP"
        r"_(?P<rpm>\d+)RPM"
    )

    match = re.fullmatch(pattern, filename, flags=re.IGNORECASE)

    if match is None:
        raise ValueError(f"파일명 형식 오류: {filename}")

    info = match.groupdict()

    fault_type = info["fault_type"].upper()

    if fault_type == "NORMAL":
        fault_type = "Normal"

    # 정상 / 고장 라벨
    if fault_type == "Normal":
        if info["diameter"] is not None:
            raise ValueError("정상 파일에 결함 크기가 존재합니다.")

        fault_diameter = 0.0
        label = 0

    else:
        if info["diameter"] is None:
            raise ValueError("고장 파일에 결함 크기가 없습니다.")

        fault_diameter = int(info["diameter"]) / 1000
        label = 1

    # 외륜 결함 위치
    if fault_type == "OR":
        or_pos = int(info["or_pos"]) if info["or_pos"] is not None else np.nan
    else:
        if info["or_pos"] is not None:
            raise ValueError("OR이 아닌 파일에 외륜 위치가 있습니다.")

        or_pos = np.nan

    return {
        "file_id": info["file_id"],
        "file_path": str(file_path),
        "fault_type": fault_type,
        "fault_diameter": fault_diameter,
        "load_hp": int(info["load_hp"]),
        "rpm": int(info["rpm"]),
        "or_pos": or_pos,
        "label": label,
    }


def extract_features(signal):
    """공통 계산 함수를 사용하되 기존 CWRU의 반환 키를 그대로 유지한다."""
    features = calculate_features(np.asarray(signal, dtype=float).ravel())
    return {
        "RMS": features["rms"],
        "Kurtosis": features["kurtosis"],
        "Peak": features["peak"],
        "Crest_Factor": features["crest_factor"],
    }

from pathlib import Path
from datetime import datetime
import re

import numpy as np
import pandas as pd

# 각 원본 열이 어느 베어링에 해당하는지 정의
BEARING_MAP = {
    1: ["B1", "B1", "B2", "B2", "B3", "B3", "B4", "B4"],
    2: ["B1", "B2", "B3", "B4"],
    3: ["B1", "B2", "B3", "B4"],
}

FEATURE_COLUMNS = [
    "timestamp",
    "bearing",
    "channel",
    "rms",
    "kurtosis",
    "peak",
    "crest_factor",
]


def calculate_features(signal):
    """채널 하나의 진동값으로 특징 4개를 계산한다."""
    x = np.asarray(signal, dtype=float)

    if x.ndim != 1 or x.size == 0:
        raise ValueError("비어 있지 않은 1차원 진동값이 필요합니다.")

    if not np.isfinite(x).all():
        raise ValueError("결측값 또는 무한대가 있습니다.")

    rms = np.sqrt(np.mean(x**2))
    peak = np.max(np.abs(x))

    centered = x - np.mean(x)
    variance = np.mean(centered**2)

    # Pearson 첨도: 정규분포 기준 3, 편향 보정 없음
    kurtosis = np.mean(centered**4) / variance**2 if variance > 0 else np.nan

    crest_factor = peak / rms if rms > 0 else np.nan

    return {
        "rms": float(rms),
        "kurtosis": float(kurtosis),
        "peak": float(peak),
        "crest_factor": float(crest_factor),
    }


def extract_ims_features(folder_path, test_number):
    """
    IMS 원본 폴더에서 파일별·채널별 특징을 계산한다.

    Parameters
    ----------
    folder_path : str 또는 Path
        압축을 푼 원본 측정 파일들이 있는 폴더.
    test_number : int
        1, 2, 3 중 하나.

    Returns
    -------
    result_df : DataFrame
        파일 하나당 1st는 8행, 2nd·3rd는 4행.
    error_df : DataFrame
        처리하지 못한 파일명과 오류 내용.
    """
    if test_number not in BEARING_MAP:
        raise ValueError("test_number는 1, 2, 3 중 하나여야 합니다.")

    folder = Path(folder_path)

    if not folder.is_dir():
        raise FileNotFoundError(f"폴더를 찾을 수 없습니다: {folder}")

    bearing_names = BEARING_MAP[test_number]
    expected_channels = len(bearing_names)

    # 연도 제한 없이 '숫자 4자리 + 점'으로 시작하는 파일 선택
    # 날짜 형식이 잘못된 후보 파일도 아래에서 오류 목록에 기록
    files = sorted(
        path
        for path in folder.iterdir()
        if path.is_file() and re.match(r"^\d{4}\.", path.name)
    )

    if not files:
        raise ValueError("날짜로 시작하는 IMS 측정 파일이 없습니다.")

    rows = []
    errors = []

    for number, file_path in enumerate(files, start=1):
        try:
            # 원본 파일명을 그대로 유지
            timestamp = file_path.name

            # YYYY.MM.DD.HH.MM.SS 형식 확인
            if not re.fullmatch(r"\d{4}(?:\.\d{2}){5}", timestamp):
                raise ValueError("파일명이 YYYY.MM.DD.HH.MM.SS 형식이 아닙니다.")

            # 실제로 존재하는 날짜·시간인지 확인
            datetime.strptime(timestamp, "%Y.%m.%d.%H.%M.%S")

            df = pd.read_csv(
                file_path,
                sep=r"\s+",
                header=None,
                skip_blank_lines=False,
            )

            expected_shape = (20480, expected_channels)

            if df.shape != expected_shape:
                raise ValueError(
                    f"예상 크기: {expected_shape}, " f"실제 크기: {df.shape}"
                )

            # 모든 채널이 성공한 뒤에만 결과에 추가
            file_rows = []

            for column_index, bearing in enumerate(bearing_names):
                features = calculate_features(df.iloc[:, column_index])

                file_rows.append(
                    {
                        "timestamp": timestamp,
                        "bearing": bearing,
                        "channel": f"CH{column_index + 1}",
                        **features,
                    }
                )

            rows.extend(file_rows)

        except Exception as error:
            errors.append(
                {
                    "filename": file_path.name,
                    "error": str(error),
                }
            )

        if number % 100 == 0 or number == len(files):
            print(f"[test {test_number}] " f"{number}/{len(files)}개 파일 처리 완료")

    result_df = pd.DataFrame(rows, columns=FEATURE_COLUMNS)

    error_df = pd.DataFrame(
        errors,
        columns=["filename", "error"],
    )

    return result_df, error_df

import numpy as np
import pandas as pd

from pathlib import Path

from src.cwru_feature import extract_metadata, extract_features


def process_cwru_file(file_path):
    """CWRU CSV 파일 하나를 읽어 특징값 1행 생성"""

    file_path = Path(file_path)

    # 1. 파일명 분석
    result = extract_metadata(file_path)

    # 2. CSV 읽기
    df = pd.read_csv(file_path)

    df.columns = df.columns.str.strip()

    channels = ["DE", "FE", "BA"]

    if not any(ch in df.columns for ch in channels):
        raise ValueError(f"진동 센서 컬럼이 없습니다: {file_path.name}")

    # 3. 센서별 특징값 계산
    for channel in channels:

        if channel in df.columns:

            signal = pd.to_numeric(df[channel], errors="raise").to_numpy()

            features = extract_features(signal)

            for feature_name, value in features.items():
                result[f"{channel}_{feature_name}"] = value

        else:

            for feature_name in ["RMS", "Kurtosis", "Peak", "Crest_Factor"]:
                result[f"{channel}_{feature_name}"] = np.nan

    return result

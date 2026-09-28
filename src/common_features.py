"""IMS, CWRU, XJTU-SY에서 함께 쓰는 시간영역 특징 계산.

RMS / Pearson 첨도(정규분포=3, 편향 보정 없음) / 절댓값 Peak / Peak÷RMS.
원본 신호에 필터링, 평균 제거, 정규화, 결측값 보간을 적용하지 않는다.
첨도를 계산할 때만 중심 모멘트를 사용한다.
"""

import numpy as np


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

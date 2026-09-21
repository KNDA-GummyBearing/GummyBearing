import pandas as pd


# 파일 당 결측 확인 함수
def check_missing(file_path):
    # 원본 파일 읽기
    df = pd.read_csv(file_path, sep=r"\s+", header=None)

    # 열별 결측값 개수
    missing_by_column = df.isna().sum()

    # 전체 결측값 개수
    missing_count = int(missing_by_column.sum())

    return {
        "file_path": str(file_path),
        "rows": df.shape[0],
        "columns": df.shape[1],
        "missing_count": missing_count,
        "has_missing": missing_count > 0,
        "missing_by_column": {
            int(column): int(count)
            for column, count in missing_by_column.items()
            if count > 0
        },
    }

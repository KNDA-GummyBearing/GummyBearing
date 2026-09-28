from pathlib import Path
import re
import sys

EXCLUDE_DIRS = {
    ".git",
    ".ipynb_checkpoints",
    ".venv",
    "venv",
}


def clear_execution_count(file_path: Path) -> bool:
    """출력은 유지하고 실행 번호만 초기화한다."""
    # 기존 줄바꿈 형식을 유지하며 읽기
    with file_path.open("r", encoding="utf-8", newline="") as file:
        text = file.read()

    # 코드 셀과 출력 내부의 실행 번호 모두 초기화
    new_text = re.sub(
        r'("execution_count"\s*:\s*)\d+',
        r"\1null",
        text,
    )

    if new_text == text:
        return False

    with file_path.open("w", encoding="utf-8", newline="") as file:
        file.write(new_text)

    return True


def find_notebooks(root: Path):
    """제외 폴더를 건너뛰고 하위 노트북을 탐색한다."""
    for file_path in sorted(root.rglob("*.ipynb")):
        relative_parts = file_path.relative_to(root).parts

        if any(part in EXCLUDE_DIRS for part in relative_parts):
            continue

        if file_path.is_file():
            yield file_path


def main():
    # 경로를 생략하면 이 스크립트 기준 프로젝트의 notebooks 사용
    default_target = Path(__file__).resolve().parent.parent / "notebooks"
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else default_target

    if not target.exists():
        print(f"❌ 경로가 존재하지 않습니다: {target}")
        return 1

    if target.is_file():
        if target.suffix != ".ipynb":
            print(f"❌ ipynb 파일이 아닙니다: {target}")
            return 1

        files = [target]
    elif target.is_dir():
        files = list(find_notebooks(target))
    else:
        print(f"❌ 파일 또는 폴더를 지정해주세요: {target}")
        return 1

    if not files:
        print(f"⚠️ 노트북 파일이 없습니다: {target}")
        return 0

    changed_count = 0
    error_count = 0

    for file_path in files:
        try:
            if clear_execution_count(file_path):
                print(f"✅ 실행 번호 초기화: {file_path}")
                changed_count += 1
            else:
                print(f"⏭ 변경 없음: {file_path}")
        except (OSError, UnicodeError) as error:
            print(f"❌ 처리 실패: {file_path} — {error}")
            error_count += 1

    print(
        f"\n총 {len(files)}개 | " f"변경 {changed_count}개 | " f"오류 {error_count}개"
    )

    return 1 if error_count else 0


if __name__ == "__main__":
    sys.exit(main())

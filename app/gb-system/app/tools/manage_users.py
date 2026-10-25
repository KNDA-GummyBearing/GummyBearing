# [LOGIN ADD] 신규 파일: 최초 계정 생성과 서버 관리자용 비밀번호 재설정.
"""Initialize the fixed five accounts or reset one password locally (never HTTP)."""
import argparse
import getpass
import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from auth import AuthStore, TEAM, AuthError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'demo-passwords', 'reset-password'])
    parser.add_argument('--user', choices=[x[0] for x in TEAM])
    parser.add_argument('--state-dir', type=Path, default=Path(os.getenv('GB_STATE_DIR', ROOT / '.runtime')))
    args = parser.parse_args()
    args.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    store = AuthStore()
    if args.action in ('init', 'demo-passwords'):
        # [LOGIN CHANGE] Explicit user-requested demo policy; not run on ordinary updates.
        store.configure_team_demo_passwords()
        print('팀 데모 계정 5개 설정 완료. 각 비밀번호는 해당 계정 아이디와 같습니다.')
        print('공유 배포 전 서버 관리자 도구로 각 비밀번호를 변경할 수 있습니다.')
    else:
        if not args.user:
            parser.error('reset-password에는 --user가 필요합니다.')
        password = getpass.getpass('새 비밀번호 (12~128자): ')
        if password != getpass.getpass('다시 입력: '):
            raise AuthError('두 비밀번호가 다릅니다.', 400)
        store.change_password(args.user, password)
        print('변경 완료. 해당 계정의 기존 로그인 세션도 종료했습니다.')


if __name__ == '__main__':
    try:
        main()
    except (AuthError, FileExistsError) as error:
        raise SystemExit(str(error))

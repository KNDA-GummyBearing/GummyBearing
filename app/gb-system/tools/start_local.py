"""Start the final source with isolated local Docker state; no outputs/ required.

Only a new empty review DB is initialized. Later starts preserve its records.
This is not an AWS update script: remote Docker contexts are refused.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.runtime'
PROJECT = 'gb-final-pr-review'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--docker', default=shutil.which('docker'))
    args = parser.parse_args()
    if not args.docker:
        parser.error('Docker with Compose is required')
    environment = os.environ.copy()
    for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
                 'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES'):
        environment.pop(name, None)
    context = json.loads(subprocess.check_output([args.docker, 'context', 'inspect'], env=environment, text=True))[0]
    endpoint = context['Endpoints']['docker']['Host']
    if not endpoint.startswith(('npipe://', 'unix://')):
        raise SystemExit('Use a local Docker context (named pipe or Unix socket)')
    base = [args.docker, 'compose', '-p', PROJECT, '-f', str(ROOT/'compose.local.yaml')]

    def run(arguments, content=None):
        result = subprocess.run(base+arguments, cwd=ROOT, env=environment, input=content,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-2000:])
        return result.stdout.decode('utf-8', errors='replace').strip()

    def sql(path):
        run(['exec', '-T', 'mysql', 'sh', '/tools/mysql-cli.sh', 'gummybearing_v5_draft'], path.read_bytes())

    STATE.mkdir(mode=0o700, exist_ok=True)
    # Keep secrets inside a private, gitignored folder; never print their values.
    for role in ('root', 'app'):
        path = STATE/f'local-{role}.txt'
        if not path.exists():
            path.write_text(secrets.token_hex(32), encoding='ascii')
            path.chmod(0o600 if role == 'root' else 0o644)
    run(['config', '--quiet'])
    print('Building the isolated local review image...', flush=True)
    run(['build', 'web'])
    run(['up', '-d', '--wait', 'mysql'])
    # Only this project's new named volume is touched, never a host/AWS state path.
    run(['run', '--rm', '--no-deps', '--user', '0', '--entrypoint', 'sh', 'web',
         '-c', 'chown 10001:10001 /login-state'])
    marker = STATE/'local-seeded.txt'
    if not marker.exists():
        count = run(['exec', '-T', 'mysql', 'sh', '/tools/mysql-cli.sh', '-N', '-B', '-e',
                     "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='gummybearing_v5_draft'"])
        if count != '0':
            raise SystemExit('Review DB is nonempty. Initialization stopped without resetting it; inspect the existing state.')
        sql(ROOT/'db/01_schema.sql')
        sql(ROOT/'db/02_mock_seed.sql')
        run(['exec', '-T', 'mysql', 'sh', '/tools/provision-app.sh'])
        for name in ('login_additive.sql', 'calendar_activity_additive.sql'):
            sql(ROOT/'migrations'/name)
        # Explicit enrollment is limited to the new local mock database.
        run(['run', '--rm', '--no-deps', 'web', 'python', 'tools/manage_users.py', 'init'])
        for name in ('role_notifications_additive.sql', 'schedule_approvals_additive.sql',
                     'completion_approvals_additive.sql', 'bell_inbox_additive.sql',
                     'report_deferred_schedule_additive.sql', 'experience_additive.sql'):
            sql(ROOT/'migrations'/name)
        marker.write_text('Local mock DB initialized; subsequent runs preserve it.\n', encoding='utf-8')
    run(['up', '-d', '--wait', 'web'])
    print('Ready: http://127.0.0.1:18088/ (email/push delivery disabled)', flush=True)


if __name__ == '__main__':
    main()

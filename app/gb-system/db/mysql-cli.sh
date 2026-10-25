#!/bin/sh
# Local administration only. Keep credentials out of command arguments/logs.
set -eu
umask 077
client_config="$(mktemp)"
trap 'rm -f "$client_config"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '[client]\nuser=root\npassword=%s\n' "$(cat /run/secrets/mysql_root_password)" > "$client_config"
client=mysql
if [ "${1:-}" = "--dump" ]; then
  client=mysqldump
  shift
fi
"$client" --defaults-extra-file="$client_config" \
  --protocol=TCP --host=127.0.0.1 --default-character-set=utf8mb4 "$@"

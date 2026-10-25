#!/bin/sh
set -eu
password="$(cat /run/secrets/mysql_app_password)"
case "$password" in ''|*[!A-Za-z0-9+/=]*) echo 'Invalid app password file format.' >&2; exit 1;; esac
{
  printf "CREATE USER IF NOT EXISTS 'gummy_app'@'%%' IDENTIFIED BY '%s';\n" "$password"
  for table in equipment inspections maintenance_reviews follow_ups work_history; do
    printf "GRANT SELECT ON gummybearing_v5_draft.%s TO 'gummy_app'@'%%';\n" "$table"
  done
  for table in inspections maintenance_reviews follow_ups; do
    printf "GRANT INSERT ON gummybearing_v5_draft.%s TO 'gummy_app'@'%%';\n" "$table"
  done
  printf "GRANT UPDATE (status, source) ON gummybearing_v5_draft.follow_ups TO 'gummy_app'@'%%';\n"
} | sh /tools/mysql-cli.sh

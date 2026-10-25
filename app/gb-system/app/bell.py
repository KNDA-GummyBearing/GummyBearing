"""[BELL INBOX] Approval notices independent of push/email delivery or devices.

Existing durable approval events are the inbox source. Only read receipts need
new storage; retries/reloads cannot create duplicate notices or trigger delivery.
The authenticated server role and current equipment scope determine recipients.
"""
from datetime import datetime, timedelta, timezone
import re
import time

from auth import AuthError
from mysql_store import connect, ValidationError

KST = timezone(timedelta(hours=9))
KINDS = ('approval_request', 'approval_approved', 'approval_rejected')
JOINS = (' FROM gb_alert_events e JOIN gb_alert_jobs j ON j.job_id=e.job_id '
         'JOIN equipment eq ON eq.equipment_id=e.equipment_id '
         'LEFT JOIN gb_bell_reads b ON b.event_id=e.event_id AND b.username=%s ')


def visibility(user):
    if user.get('role') not in ('supervisor', 'field'):
        raise AuthError('관리자 선택 화면에서 담당자를 선택해 주세요.', 403)
    # Requests are team-lead-only. Decision notices return only to the original
    # requester, provided that requester still has the equipment in their scope.
    decisions = "(j.kind IN ('approval_approved','approval_rejected') AND j.username=%s)"
    params = [user['id'], user['id']]
    if user['role'] == 'supervisor':
        where = "(j.kind='approval_request' OR " + decisions + ')'
    else:
        where = decisions + ' AND eq.process=%s'
        params.append(user.get('process') or '')
    where += ' AND e.due_epoch<=%s'
    params.append(time.time())
    return where, params


def unread(cur, user):
    where, params = visibility(user)
    cur.execute('SELECT COUNT(*) n' + JOINS + 'WHERE ' + where + ' AND b.event_id IS NULL', params)
    return cur.fetchone()['n']


def inbox(user):
    where, params = visibility(user)
    with connect() as conn, conn.cursor() as cur:
        # Approval IDs are derived by the same deterministic formula used when
        # the event is inserted, not by parsing user-controlled notification text.
        approval_join = ('LEFT JOIN gb_schedule_approvals a ON e.event_id='
                         "SHA2(CONCAT('approval:',a.request_id,':',j.kind),256) "
                         'LEFT JOIN gb_completion_approvals c ON e.event_id='
                         "SHA2(CONCAT('approval:',c.request_id,':',j.kind),256) ")
        query = ('SELECT e.event_id,e.equipment_id,e.title,e.body,e.due_epoch,j.kind,b.read_at,'
                 'COALESCE(a.request_id,c.request_id) AS request_id,'
                 'COALESCE(a.status,c.status) AS approval_status,'
                 "CASE WHEN c.request_id IS NOT NULL THEN 'completion' "
                 "WHEN a.submission_kind='report' THEN 'report' ELSE 'schedule' END AS request_kind"
                 + JOINS + approval_join + 'WHERE ' + where)
        # Include every unread item plus the latest 100 read items. A badge must
        # never count notices omitted from the list the user can mark as read.
        cur.execute(query + ' AND b.event_id IS NULL ORDER BY e.due_epoch DESC,e.event_id DESC', params)
        rows = list(cur.fetchall())
        unread_count = len(rows)
        cur.execute(query + ' AND b.event_id IS NOT NULL ORDER BY e.due_epoch DESC,e.event_id DESC LIMIT 100', params)
        rows.extend(cur.fetchall())
        rows.sort(key=lambda row: (row['due_epoch'], row['event_id']), reverse=True)
        result = []
        for row in rows:
            # Do not return usernames, destinations, credentials or delivery state.
            result.append(dict(id=row['event_id'], event_id=row['event_id'], kind=row['kind'],
                equipment_id=row['equipment_id'], title=row['title'], body=row['body'],
                url='/#/approvals', created_at=datetime.fromtimestamp(row['due_epoch'], KST).isoformat(timespec='seconds'),
                read=row['read_at'] is not None,
                read_at=row['read_at'].isoformat(timespec='seconds')+'+09:00' if row['read_at'] else None,
                request_id=row['request_id'], approval_status=row['approval_status'], request_kind=row['request_kind']))
        return dict(notifications=result, unread_count=unread_count)


def mark_read(user, payload):
    where, params = visibility(user)
    if not isinstance(payload, dict):
        raise ValidationError('읽음 처리 요청 형식을 확인해 주세요.')
    all_items = set(payload) == {'all'} and payload['all'] is True
    ids = payload.get('event_ids')
    if not all_items:
        if set(payload) != {'event_ids'} or not isinstance(ids, list) or not 1 <= len(ids) <= 1000:
            raise ValidationError('현재 확인한 알림 ID를 1개에서 1000개까지 보내 주세요.')
        if any(not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{64}', ident) for ident in ids):
            raise ValidationError('알림 ID 형식을 확인해 주세요.')
        ids = list(dict.fromkeys(ids))
    with connect() as conn, conn.cursor() as cur:
        try:
            restriction = '' if all_items else ' AND e.event_id IN (' + ','.join(['%s']*len(ids)) + ')'
            cur.execute('SELECT e.event_id' + JOINS + 'WHERE ' + where + restriction,
                        params if all_items else params + ids)
            visible = [row['event_id'] for row in cur.fetchall()]
            # Fail atomically if one ID is inaccessible/nonexistent. Never reveal
            # whether another recipient actually has the supplied event ID.
            if not all_items and set(visible) != set(ids):
                raise AuthError('본인에게 도착한 알림만 읽음 처리할 수 있습니다.', 403)
            for ident in visible:
                cur.execute('INSERT IGNORE INTO gb_bell_reads(event_id,username) VALUES(%s,%s)',
                            (ident, user['id']))
            remaining = unread(cur, user)
            conn.commit()
            return dict(ok=True, unread_count=remaining)
        except Exception:
            conn.rollback()
            raise

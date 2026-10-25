"""[APPROVAL 2026-10-24] Inspection -> team lead review -> one calendar schedule.

Business record, approval request and durable notification event commit together.
Historical rows have no approval request and retain their old display behaviour.
Passwordless demo roles are server-defined; this is not identity authentication.
"""
import hashlib
import json
import re
import time
import uuid
from datetime import date, datetime

from auth import AuthError
import mysql_store as records
from roles import assert_equipment

SCHEDULE_FIELDS = {'equipment_id', 'type', 'due_date', 'assignee', 'items'}
AUDIT_FIELDS = {'inspector_user_id', 'completed_by_user_id', 'completed_by', 'completed_at',
                'created_by_user_id', 'created_by', 'creator_recorded_at',
                'approval_status', 'approval_request_id'}


def completion_metadata(cur, row):
    """Latest completion decision is separate from the schedule creation approval."""
    cur.execute('SELECT request_id,status FROM gb_completion_approvals WHERE follow_up_id=%s '
                'ORDER BY requested_at DESC,request_id DESC LIMIT 1', (row['follow_up_id'],))
    latest = cur.fetchone()
    row.update(completion_approval_status=latest['status'] if latest else '',
               completion_approval_request_id=latest['request_id'] if latest else '')
    return row


def decorate_followups(data):
    # Call only after normal role/process filtering. This decorator does not
    # expose additional schedules or request details to another process.
    rows = [row for key in ('follow_ups', 'calendar_schedules', 'completions')
            for row in data.get(key, [])]
    ids = list(dict.fromkeys(row['follow_up_id'] for row in rows))
    if not ids:
        return data
    latest = {}
    with records.connect() as conn, conn.cursor() as cur:
        # Preserve the same newest-request tie break as completion_metadata().
        # Only IDs already authorized by the caller enter these bounded queries.
        for start in range(0, len(ids), 500):
            batch = ids[start:start+500]
            marks = ','.join(['%s']*len(batch))
            cur.execute('SELECT follow_up_id,request_id,status FROM gb_completion_approvals '
                        f'WHERE follow_up_id IN ({marks}) '
                        'ORDER BY requested_at DESC,request_id DESC', batch)
            for item in cur.fetchall():
                latest.setdefault(item['follow_up_id'], item)
    for row in rows:
        item = latest.get(row['follow_up_id'])
        row.update(completion_approval_status=item['status'] if item else '',
                   completion_approval_request_id=item['request_id'] if item else '')
    return data


def decorate_report_reviews(data):
    """Attach review audit only to records already authorized by process scope.

    No nearest-date or equipment-only matching: a report retains its exact
    inspection/schedule approval, separate from later completion approvals.
    """
    with records.connect() as conn, conn.cursor() as cur:
        for table, key in (('inspections', 'inspection_id'), ('follow_ups', 'follow_up_id')):
            rows = data.get(table, [])
            ids = list(dict.fromkeys(row[key] for row in rows))
            found = {}
            for start in range(0, len(ids), 500):
                batch = ids[start:start+500]
                marks = ','.join(['%s'] * len(batch))
                cur.execute(f'SELECT `{key}`,equipment_id,request_id,status,reviewer_name,reviewed_at,note '
                            f'FROM gb_schedule_approvals WHERE `{key}` IN ({marks}) '
                            'ORDER BY requested_at DESC,request_id DESC', batch)
                for row in cur.fetchall():
                    found.setdefault((row[key], row['equipment_id']), row)
            for row in rows:
                approval = found.get((row[key], row['equipment_id']))
                row['report_approval'] = None
                if approval:
                    row['report_approval'] = {field: approval.get(field) or '' for field in
                                             ('request_id', 'status', 'reviewer_name', 'note')}
                    stamp = approval.get('reviewed_at')
                    row['report_approval']['reviewed_at'] = (stamp.isoformat(timespec='seconds') + '+09:00'
                        if isinstance(stamp, datetime) else str(stamp or ''))
    return data


def completion_detail(cur, row):
    result = records.serialize(row)
    for key in ('payload_hash', 'request_key', 'pending_follow_up_id'):
        result.pop(key, None)
    result.update(request_kind='completion', inspection=None, review=None)
    for key in ('requested_at', 'reviewed_at'):
        if isinstance(row.get(key), datetime):
            result[key] = row[key].isoformat(timespec='microseconds') + '+09:00'
    cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s', (row['follow_up_id'],))
    followup = cur.fetchone()
    result.update({key: records.serialize(followup)[key] for key in SCHEDULE_FIELDS})
    result['inspection_id'] = followup.get('inspection_id')
    result['follow_up'] = completion_metadata(cur, records.audit_record(cur, 'follow_ups', followup))
    return result


def completion_result(cur, row):
    request = completion_detail(cur, row)
    return dict(ok=True, request=request, records=dict(inspections=[], maintenance_reviews=[],
                follow_ups=[request['follow_up']]))


def completion_submit(user, payload):
    require_role(user)
    if user['role'] != 'field':
        raise AuthError('설비 팀장은 대기 중인 완료 요청을 승인하거나 일정을 직접 완료할 수 있습니다.', 403)
    if not isinstance(payload, dict) or set(payload) - {'request_key', 'follow_up_id', 'note'}:
        raise records.ValidationError('완료 승인 요청 형식을 확인해 주세요.')
    key = text(payload.get('request_key'), '요청 식별자', 100)
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{8,100}', key):
        raise records.ValidationError('요청 식별자를 새로 생성해 주세요.')
    ident = text(payload.get('follow_up_id'), '일정 번호', 64)
    note = text(payload.get('note', ''), '완료 내용', 2000, required=False)
    digest = hashlib.sha256(json.dumps(dict(follow_up_id=ident, note=note), sort_keys=True,
                                      ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    with records.connect() as conn, conn.cursor() as cur:
        try:
            # All completion mutations use actor -> followup -> request locks.
            # No consistent reads before locks: retried submissions must see a
            # concurrent decision's committed completion/audit records.
            cur.execute('SELECT username FROM gb_users WHERE username=%s FOR UPDATE', (user['id'],))
            cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s FOR UPDATE', (ident,))
            followup = cur.fetchone()
            if not followup:
                raise AuthError('일정을 찾을 수 없습니다.', 404)
            cur.execute('SELECT * FROM gb_completion_approvals WHERE requested_by=%s AND request_key=%s FOR UPDATE',
                        (user['id'], key))
            existing = cur.fetchone()
            assert_equipment(user, followup['equipment_id'], cur)
            if existing:
                if existing['payload_hash'] != digest:
                    raise AuthError('같은 요청 식별자로 다른 완료 내용을 제출할 수 없습니다.', 409)
                response = completion_result(cur, existing)
                conn.commit()
                return response
            if followup['status'] == '완료':
                raise AuthError('이미 완료된 일정입니다. 새로고침해 주세요.', 409)
            cur.execute("SELECT request_id FROM gb_completion_approvals WHERE follow_up_id=%s AND status='pending'", (ident,))
            if cur.fetchone():
                raise AuthError('이미 완료 승인을 기다리는 일정입니다. 승인 요청 화면을 확인해 주세요.', 409)
            request_id = 'CMP-' + str(uuid.uuid4())
            cur.execute('INSERT INTO gb_completion_approvals(request_id,request_key,payload_hash,follow_up_id,'
                        'requested_by,requester_name,completion_note,note) VALUES(%s,%s,%s,%s,%s,%s,%s,\'\')',
                        (request_id, key, digest, ident, user['id'], user['name'], note))
            cur.execute('SELECT * FROM gb_completion_approvals WHERE request_id=%s', (request_id,))
            response = completion_result(cur, cur.fetchone())
            queue_notice(cur, response['request'], 'approval_request')
            conn.commit()
            return response
        except Exception:
            conn.rollback()
            raise


def completion_decide(user, payload):
    require_role(user, supervisor=True)
    if not isinstance(payload, dict) or set(payload) - {'request_id', 'action', 'note'}:
        raise records.ValidationError('완료 승인 처리 형식을 확인해 주세요.')
    ident = text(payload.get('request_id'), '요청 번호', 64)
    action = payload.get('action')
    if action not in ('approve', 'reject'):
        raise records.ValidationError('승인 또는 반려를 선택해 주세요.')
    note = text(payload.get('note', ''), '검토 의견', 2000, required=action == 'reject')
    target = 'approved' if action == 'approve' else 'rejected'
    with records.connect() as lookup, lookup.cursor() as cur:
        cur.execute('SELECT requested_by,follow_up_id FROM gb_completion_approvals WHERE request_id=%s', (ident,))
        owner = cur.fetchone()
        if not owner:
            raise AuthError('완료 승인 요청을 찾을 수 없습니다.', 404)
    with records.connect() as conn, conn.cursor() as cur:
        try:
            cur.execute('SELECT username FROM gb_users WHERE username=%s FOR UPDATE', (owner['requested_by'],))
            cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s FOR UPDATE', (owner['follow_up_id'],))
            followup = cur.fetchone()
            cur.execute('SELECT * FROM gb_completion_approvals WHERE request_id=%s FOR UPDATE', (ident,))
            request = cur.fetchone()
            if not request or not followup:
                raise AuthError('완료 승인 요청을 찾을 수 없습니다.', 404)
            assert_equipment(user, followup['equipment_id'], cur)
            if request['status'] != 'pending':
                if request['status'] != target:
                    raise AuthError('이미 다른 결과로 처리된 완료 요청입니다.', 409)
                response = completion_result(cur, request)
                conn.commit()
                return response
            if followup['status'] == '완료':
                raise AuthError('이미 완료된 일정입니다. 새로고침해 주세요.', 409)
            if action == 'approve':
                cur.execute("UPDATE follow_ups SET status='완료',source='app' WHERE follow_up_id=%s", (followup['follow_up_id'],))
                # The field manager performed the work. The team lead's review
                # remains a separate audit on this approval record.
                records.complete(cur, followup['follow_up_id'], dict(id=request['requested_by'], name=request['requester_name']))
            cur.execute('UPDATE gb_completion_approvals SET status=%s,reviewed_by=%s,reviewer_name=%s,'
                        'reviewed_at=NOW(6),note=%s WHERE request_id=%s',
                        (target, user['id'], user['name'], note, ident))
            cur.execute('SELECT * FROM gb_completion_approvals WHERE request_id=%s', (ident,))
            response = completion_result(cur, cur.fetchone())
            queue_notice(cur, response['request'], 'approval_' + target)
            conn.commit()
            return response
        except Exception:
            conn.rollback()
            raise


def direct_complete(user, payload):
    """Team lead shortcut only; a pending field request must be reviewed first."""
    require_role(user, supervisor=True)
    rows = payload.get('follow_ups') if isinstance(payload, dict) else None
    if (not isinstance(payload, dict) or set(payload) != {'operation', 'follow_ups'}
            or payload['operation'] != 'update' or not isinstance(rows, list) or not 1 <= len(rows) <= 50):
        raise records.ValidationError('완료할 일정 배열을 확인해 주세요.')
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'follow_up_id', 'status'} or row['status'] != '완료':
            raise records.ValidationError('일정 ID와 완료 상태를 확인해 주세요.')
        text(row['follow_up_id'], '일정 번호', 64)
    ids = sorted({row['follow_up_id'] for row in rows})
    with records.connect() as conn, conn.cursor() as cur:
        try:
            locked = []
            for ident in ids:
                cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s FOR UPDATE', (ident,))
                row = cur.fetchone()
                if not row:
                    raise AuthError('일정을 찾을 수 없습니다.', 404)
                locked.append(row)
            # Acquire all parent locks before the first consistent snapshot.
            # Concurrent field requests and bulk completion cannot bypass each
            # other or leave a pending request on a completed schedule.
            for row in locked:
                assert_equipment(user, row['equipment_id'], cur)
                cur.execute("SELECT request_id FROM gb_completion_approvals WHERE follow_up_id=%s AND status='pending'", (row['follow_up_id'],))
                if cur.fetchone():
                    raise AuthError('완료 승인 대기 중인 일정은 승인 요청 화면에서 처리해 주세요.', 409)
            saved = []
            for row in locked:
                if row['status'] != '완료':
                    cur.execute("UPDATE follow_ups SET status='완료',source='app' WHERE follow_up_id=%s", (row['follow_up_id'],))
                    records.complete(cur, row['follow_up_id'], user)
                cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s', (row['follow_up_id'],))
                saved.append(completion_metadata(cur, records.audit_record(cur, 'follow_ups', cur.fetchone())))
            conn.commit()
            return dict(ok=True, saved=len(saved), records=dict(follow_ups=saved))
        except Exception:
            conn.rollback()
            raise


def require_role(user, supervisor=False):
    if user.get('role') not in ('supervisor', 'field') or (supervisor and user['role'] != 'supervisor'):
        raise AuthError('일정 승인과 반려는 설비 팀장만 처리할 수 있습니다.' if supervisor
                        else '관리자 선택 화면에서 담당자를 선택해 주세요.', 403)


def text(value, label, maximum, required=True):
    if not isinstance(value, str) or len(value) > maximum or '\x00' in value:
        raise records.ValidationError(f'{label}: 입력 내용을 확인해 주세요.')
    value = value.strip()
    if required and not value:
        raise records.ValidationError(f'{label}: 내용을 입력해 주세요.')
    return value


def validate_schedule(schedule):
    if not isinstance(schedule, dict) or set(schedule) != SCHEDULE_FIELDS:
        raise records.ValidationError('설비, 일정 종류, 예정일, 담당자, 내용을 입력해 주세요.')
    result = dict(schedule)
    result['equipment_id'] = text(result['equipment_id'], '설비', 64)
    if result['type'] not in records.OPTIONS['type']:
        raise records.ValidationError('지원하지 않는 일정 종류입니다.')
    if not isinstance(result['due_date'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', result['due_date']):
        raise records.ValidationError('예정일은 연-월-일 형식으로 입력해 주세요.')
    try:
        due = date.fromisoformat(result['due_date'])
        if due.year < 1000:
            raise ValueError()
    except ValueError:
        raise records.ValidationError('유효한 예정일을 입력해 주세요.') from None
    result['assignee'] = text(result['assignee'], '담당자', 100)
    result['items'] = text(result['items'], '일정 내용', 16000)
    return result


def insert(cur, table, row, *, defer_followup=False):
    checked = records.validate_row(cur, table, row, defer_followup=defer_followup)
    fields = ','.join(f'`{k}`' for k in checked)
    cur.execute(f'INSERT INTO `{table}` ({fields}) VALUES ({",".join(["%s"] * len(checked))})',
                tuple(checked.values()))
    return checked


def queue_notice(cur, request, kind):
    # Stable IDs prevent repeated submits/decisions from sending duplicate notices.
    event = hashlib.sha256(f"approval:{request['request_id']}:{kind}".encode()).hexdigest()
    job = event[:32]
    heading = {'approval_request': '일정 승인 요청', 'approval_approved': '일정 승인 완료',
               'approval_rejected': '일정 요청 반려'}[kind]
    if request.get('request_kind') == 'completion':
        heading = {'approval_request': '일정 완료 승인 요청', 'approval_approved': '일정 완료 승인',
                   'approval_rejected': '일정 완료 요청 반려'}[kind]
    elif request.get('submission_kind') == 'report':
        heading = {'approval_request': '점검 보고서 승인 요청', 'approval_approved': '점검 승인 · 일정 등록 완료',
                   'approval_rejected': '점검 보고서 반려'}[kind]
    due_label = request.get('due_date') or '팀장 승인 시 날짜 지정'
    if request.get('submission_kind') == 'report' and kind == 'approval_rejected' and not request.get('due_date'):
        due_label = '일정 미등록'
    body = (f"{request['requester_name']} · {request['equipment_id']} · {due_label} · "
            f"{request['type']} · {request['items'][:200]}\n요청 번호: {request['request_id']}")
    if kind == 'approval_rejected':
        # Web Push payloads have a small provider budget. Full review notes stay
        # in MySQL and the approval screen; notification text is a short preview.
        body += '\n반려 사유: ' + request['note'][:200] + ('…' if len(request['note']) > 200 else '')
    cur.execute('INSERT INTO gb_alert_jobs(job_id,username,kind,created_epoch) VALUES(%s,%s,%s,%s)',
                (job, request['requested_by'], kind, time.time()))
    cur.execute('INSERT INTO gb_alert_events(event_id,job_id,equipment_id,title,body,due_epoch) '
                'VALUES(%s,%s,%s,%s,%s,%s)',
                (event, job, request['equipment_id'], heading, body, time.time()))


def detail(cur, row):
    result = records.serialize(row)
    result['request_kind'] = 'report' if row.get('submission_kind') == 'report' else 'schedule'
    result.pop('payload_hash', None)
    result.pop('request_key', None)
    # Preserve seconds + timezone for the review audit; simulation time is unrelated.
    for key in ('requested_at', 'reviewed_at'):
        if isinstance(row.get(key), datetime):
            result[key] = row[key].isoformat(timespec='seconds') + '+09:00'
    for key, table, ident in (('inspection', 'inspections', 'inspection_id'),
                              ('review', 'maintenance_reviews', 'review_id')):
        result[key] = None
        if row.get(ident):
            cur.execute(f'SELECT * FROM `{table}` WHERE `{ident}`=%s', (row[ident],))
            found = cur.fetchone()
            result[key] = records.audit_record(cur, table, found) if found else None
    return result


def result(cur, row):
    request = detail(cur, row)
    saved = dict(inspections=[], maintenance_reviews=[], follow_ups=[])
    if request['inspection']:
        saved['inspections'].append(request['inspection'])
    if request['review']:
        saved['maintenance_reviews'].append(request['review'])
    if row.get('follow_up_id'):
        cur.execute('SELECT * FROM follow_ups WHERE follow_up_id=%s', (row['follow_up_id'],))
        saved['follow_ups'].append(completion_metadata(cur, records.audit_record(cur, 'follow_ups', cur.fetchone())))
    return dict(ok=True, request=request, records=saved)


def listing(user):
    require_role(user)
    with records.connect() as conn, conn.cursor() as cur:
        if user['role'] == 'supervisor':
            cur.execute('SELECT * FROM gb_schedule_approvals ORDER BY requested_at DESC,request_id')
        else:
            # Field managers only see their requests, within their current process.
            cur.execute('SELECT a.* FROM gb_schedule_approvals a JOIN equipment e ON e.equipment_id=a.equipment_id '
                        'WHERE a.requested_by=%s AND e.process=%s ORDER BY a.requested_at DESC,a.request_id',
                        (user['id'], user.get('process')))
        rows = cur.fetchall()
        requests = [detail(cur, row) for row in rows]
        query = ('SELECT c.* FROM gb_completion_approvals c JOIN follow_ups f ON f.follow_up_id=c.follow_up_id '
                 'JOIN equipment e ON e.equipment_id=f.equipment_id ')
        if user['role'] == 'supervisor':
            cur.execute(query + 'ORDER BY c.requested_at DESC,c.request_id')
        else:
            cur.execute(query + 'WHERE c.requested_by=%s AND e.process=%s ORDER BY c.requested_at DESC,c.request_id',
                        (user['id'], user.get('process')))
        requests.extend(completion_detail(cur, row) for row in cur.fetchall())
        requests.sort(key=lambda r: (r['requested_at'], r['request_id']), reverse=True)
    return dict(requests=requests, counts={s: sum(r['status'] == s for r in requests)
                                         for s in ('pending', 'approved', 'rejected')})


def submit(user, payload):
    require_role(user)
    if not isinstance(payload, dict) or set(payload) - {'request_key', 'inspection', 'review', 'schedule', 'submission_kind'}:
        raise records.ValidationError('승인 요청 형식을 확인해 주세요.')
    key = text(payload.get('request_key'), '요청 식별자', 100)
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{8,100}', key):
        raise records.ValidationError('요청 식별자를 새로 생성해 주세요.')
    submission_kind = payload.get('submission_kind', 'schedule')
    if submission_kind not in ('schedule', 'report'):
        raise records.ValidationError('지원하지 않는 제출 유형입니다.')
    report = submission_kind == 'report'
    inspection, review = payload.get('inspection'), payload.get('review')
    if inspection is not None and not isinstance(inspection, dict):
        raise records.ValidationError('점검 입력 형식을 확인해 주세요.')
    if review is not None and (not isinstance(review, dict) or inspection is None):
        raise records.ValidationError('정비 검토는 새 점검 기록과 함께 제출해 주세요.')
    if report:
        if inspection is None or review is not None:
            raise records.ValidationError('보고서 제출에는 점검 기록만 포함해 주세요.')
        decision = inspection.get('decision')
        if decision not in records.OPTIONS['decision']:
            raise records.ValidationError('대응 결정을 선택해 주세요.')
        # The report records observations. Only the reviewing team lead sets the
        # resulting schedule; stale hidden inputs must not imply another date.
        if any(inspection.get(k) not in (None, '') for k in
               ('recheck_date', 'additional_due', 'additional_assignee', 'additional_items')):
            raise records.ValidationError('보고서의 후속 일정은 팀장 승인 단계에서 지정해 주세요.')
        if user['role'] == 'supervisor':
            schedule = validate_schedule(payload.get('schedule'))
        else:
            if 'schedule' in payload:
                raise records.ValidationError('보고서의 일정은 설비 팀장이 승인할 때 지정합니다.')
            schedule = dict(equipment_id=text(inspection.get('equipment_id'), '설비', 64),
                            type={'계속 관찰': '재확인', '추가 점검': '추가 점검', '정비 검토': '정비'}[decision],
                            due_date=None, assignee=user['name'],
                            items=text(inspection.get('memo', ''), '점검 메모', 16000, required=False)
                                  or '현장 점검 · ' + decision)
    else:
        schedule = validate_schedule(payload.get('schedule'))
        if inspection is not None and ((inspection.get('decision') == '정비 검토') != (review is not None)):
            raise records.ValidationError('정비 검토 결정에는 정비 검토 내용을 함께 제출해 주세요.')
    # Hash original content: retries may return the same result, changed submissions
    # must use a new key instead of silently receiving a prior request's success.
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()
    with records.connect() as conn, conn.cursor() as cur:
        try:
            # Serialize submissions for the actor before checking the unique key.
            # This avoids duplicate children even with concurrent identical POSTs.
            # Lock BEFORE any ordinary SELECT so a duplicate waiting in MySQL's
            # REPEATABLE READ gets the committed original's child records too.
            cur.execute('SELECT username FROM gb_users WHERE username=%s FOR UPDATE', (user['id'],))
            cur.execute('SELECT * FROM gb_schedule_approvals WHERE requested_by=%s AND request_key=%s FOR UPDATE',
                        (user['id'], key))
            existing = cur.fetchone()
            assert_equipment(user, schedule['equipment_id'], cur)
            if existing:
                if existing['payload_hash'] != digest:
                    raise AuthError('같은 요청 식별자로 다른 내용을 제출할 수 없습니다. 새 요청으로 제출해 주세요.', 409)
                response = result(cur, existing)
                conn.commit()
                return response
            cur.execute('SELECT NOW() now')
            now = cur.fetchone()['now'].isoformat(timespec='seconds')
            inspection_id, review_id = None, None
            if inspection is not None:
                row = {k: v for k, v in inspection.items() if k not in AUDIT_FIELDS}
                if row.get('equipment_id') != schedule['equipment_id']:
                    raise records.ValidationError('점검과 일정은 같은 설비여야 합니다.')
                inspection_id = 'INS-' + str(uuid.uuid4())
                row.update(inspection_id=inspection_id, inspector=user['name'], source='app', created_at=now)
                checked = insert(cur, 'inspections', row, defer_followup=report)
                if schedule['due_date'] and schedule['due_date'] < checked['inspected_at'].date().isoformat():
                    raise records.ValidationError('예정일은 점검일과 같거나 이후여야 합니다.')
                cur.execute('INSERT INTO gb_inspection_authors(inspection_id,username) VALUES(%s,%s)',
                            (inspection_id, user['id']))
            if review is not None:
                row = {k: v for k, v in review.items() if k not in AUDIT_FIELDS}
                if row.get('equipment_id') != schedule['equipment_id']:
                    raise records.ValidationError('정비 검토와 일정은 같은 설비여야 합니다.')
                if row.get('review_status') != '검토 중':
                    raise records.ValidationError('새 정비 검토는 검토 중 상태로 제출해 주세요.')
                review_id = 'MR-' + str(uuid.uuid4())
                row.update(review_id=review_id, inspection_id=inspection_id, source='app', registered_at=now)
                insert(cur, 'maintenance_reviews', row)
            request_id = 'APR-' + str(uuid.uuid4())
            cur.execute('INSERT INTO gb_schedule_approvals(request_id,request_key,payload_hash,equipment_id,'
                        'inspection_id,review_id,type,due_date,assignee,items,requested_by,requester_name,submission_kind,note) '
                        'VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,\'\')',
                        (request_id, key, digest, schedule['equipment_id'], inspection_id, review_id,
                         schedule['type'], schedule['due_date'], schedule['assignee'], schedule['items'],
                         user['id'], user['name'], submission_kind))
            cur.execute('SELECT * FROM gb_schedule_approvals WHERE request_id=%s', (request_id,))
            created = cur.fetchone()
            if user['role'] == 'supervisor':
                # A team lead's own submission is already authorized. Keep the
                # same approval audit, but commit the report and schedule in one
                # transaction without sending a review request to themselves.
                created = apply_schedule_decision(cur, user, created, schedule, 'approve', '설비 팀장 직접 제출')
            else:
                queue_notice(cur, created, 'approval_request')
            response = result(cur, created)
            conn.commit()
            return response
        except Exception:
            conn.rollback()
            raise


def apply_schedule_decision(cur, user, request, schedule, action, note):
    """Shared atomic write for a locked pending request, including direct submit.

    Callers validate the server-side supervisor role and hold actor/request locks.
    Notification policy remains with the caller: direct team submissions do not
    create a self-notification, while field requests receive the decision notice.
    """
    follow_up_id = None
    if action == 'approve':
        if request['inspection_id']:
            cur.execute('SELECT inspected_at FROM inspections WHERE inspection_id=%s', (request['inspection_id'],))
            if schedule['due_date'] < cur.fetchone()['inspected_at'].date().isoformat():
                raise records.ValidationError('예정일은 점검일과 같거나 이후여야 합니다.')
        cur.execute('SELECT NOW() now')
        now = cur.fetchone()['now'].isoformat(timespec='seconds')
        follow_up_id = 'FU-' + str(uuid.uuid4())
        insert(cur, 'follow_ups', dict(schedule, follow_up_id=follow_up_id,
               inspection_id=request['inspection_id'], status='예정', created_at=now, source='app'))
        # The requester authored it; the team lead's decision is audited below.
        cur.execute('INSERT INTO gb_followup_authors(follow_up_id,username,created_at) VALUES(%s,%s,NOW())',
                    (follow_up_id, request['requested_by']))
    target = 'approved' if action == 'approve' else 'rejected'
    cur.execute('UPDATE gb_schedule_approvals SET status=%s,reviewed_by=%s,reviewer_name=%s,'
                'reviewed_at=NOW(),note=%s,follow_up_id=%s,type=%s,due_date=%s,assignee=%s,items=%s '
                'WHERE request_id=%s', (target, user['id'], user['name'], note, follow_up_id,
                schedule['type'], schedule['due_date'], schedule['assignee'], schedule['items'], request['request_id']))
    cur.execute('SELECT * FROM gb_schedule_approvals WHERE request_id=%s', (request['request_id'],))
    return cur.fetchone()


def decide(user, payload):
    require_role(user, supervisor=True)
    if not isinstance(payload, dict) or set(payload) - {'request_id', 'action', 'note', 'schedule'}:
        raise records.ValidationError('승인 처리 요청 형식을 확인해 주세요.')
    request_id = text(payload.get('request_id'), '요청 번호', 64)
    action = payload.get('action')
    if action not in ('approve', 'reject'):
        raise records.ValidationError('승인 또는 반려를 선택해 주세요.')
    note = text(payload.get('note', ''), '검토 의견', 2000, required=action == 'reject')
    target = 'approved' if action == 'approve' else 'rejected'
    # Immutable requester lookup in its own short transaction. Then acquire the
    # same actor -> request locks as submit. Taking request first can deadlock
    # against a retry holding the actor while the author's FK needs that actor.
    with records.connect() as lookup, lookup.cursor() as cur:
        cur.execute('SELECT requested_by FROM gb_schedule_approvals WHERE request_id=%s', (request_id,))
        owner = cur.fetchone()
        if not owner:
            raise AuthError('승인 요청을 찾을 수 없습니다.', 404)
    with records.connect() as conn, conn.cursor() as cur:
        try:
            cur.execute('SELECT username FROM gb_users WHERE username=%s FOR UPDATE', (owner['requested_by'],))
            cur.execute('SELECT * FROM gb_schedule_approvals WHERE request_id=%s FOR UPDATE', (request_id,))
            request = cur.fetchone()
            if not request:
                raise AuthError('승인 요청을 찾을 수 없습니다.', 404)
            assert_equipment(user, request['equipment_id'], cur)
            if request['status'] != 'pending':
                if request['status'] != target:
                    raise AuthError('이미 다른 결과로 처리된 요청입니다. 새로고침해 주세요.', 409)
                # Duplicate same decision is an idempotent read, never another schedule.
                response = result(cur, request)
                conn.commit()
                return response
            schedule = {k: request[k] for k in SCHEDULE_FIELDS}
            schedule['due_date'] = schedule['due_date'].isoformat() if schedule['due_date'] else None
            if 'schedule' in payload:
                overrides = payload['schedule']
                if action != 'approve' or not isinstance(overrides, dict) or set(overrides) - (SCHEDULE_FIELDS - {'equipment_id'}):
                    raise records.ValidationError('승인할 일정의 날짜·담당자·내용·종류만 변경할 수 있습니다.')
                schedule.update(overrides)
            if request.get('submission_kind') == 'report' and action == 'approve':
                if not {'due_date', 'assignee', 'items'} <= set(payload.get('schedule', {})):
                    raise records.ValidationError('보고서를 승인할 날짜, 담당자, 일정 내용을 지정해 주세요.')
            # A deferred report can be rejected without inventing a date. Old
            # schedule requests retain their original strict validation path.
            if request.get('submission_kind') != 'report' or action == 'approve':
                schedule = validate_schedule(schedule)
            changed = apply_schedule_decision(cur, user, request, schedule, action, note)
            queue_notice(cur, changed, 'approval_' + target)
            response = result(cur, changed)
            conn.commit()
            return response
        except Exception:
            conn.rollback()
            raise

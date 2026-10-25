# [LOGIN CHANGE] 기존 MySQL 의존성과 비루트 실행 유지.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py mysql_store.py auth.py origin_policy.py roles.py notifications.py approvals.py bell.py export_xlsx.py experience.py static_delivery.py index.html manifest.webmanifest sw.js experience.webmanifest experience-sw.js ./
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/
COPY tools/build_db.py tools/manage_users.py ./tools/
COPY --chown=10001:10001 data/ ./data/

USER 10001:10001
EXPOSE 8000
CMD ["python", "server.py", "8000"]

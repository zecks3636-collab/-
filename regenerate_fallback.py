"""
data.js 폴백 데이터 재생성 스크립트

사내 DB(app_bti_schedule_prd) 전체 스냅샷을 data.js에 기록한다.
GitHub Pages 등 정적 호스팅에서 백엔드 미가용 시 사용된다.

사용:
  python regenerate_fallback.py
"""
import psycopg2
import psycopg2.extras
import json
import os

DB = {
    "host": "cm-ai-incubation-db.cluster-cjos2m24aqmu.ap-northeast-1.rds.amazonaws.com",
    "port": 5432,
    "dbname": os.environ.get("DB_NAME", "postgres"),
    "user": os.environ.get("DB_USER", "app_bti_schedule_prd"),
    "password": os.environ.get("DB_PASSWORD"),
}

if not DB["password"]:
    DB["password"] = input("DB password: ").strip()

conn = psycopg2.connect(**DB, options="-c search_path=app_bti_schedule_prd")
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT id, company, date, title FROM schedules ORDER BY date, company, title")
schedules = [dict(r) for r in cur.fetchall()]

cur.execute("SELECT id::text, date, team, rank, employee_name, leave_type, note FROM leave_plans ORDER BY date")
leaves = [dict(r) for r in cur.fetchall()]

cur.execute("SELECT id, date, title, category, note FROM request_schedules ORDER BY date")
requests = [dict(r) for r in cur.fetchall()]

cur.execute("SELECT event_id, bg, text_color FROM event_colors")
colors = {r["event_id"]: {"bg": r["bg"], "text": r["text_color"]} for r in cur.fetchall()}

conn.close()

body = (
    "// data.js — 사내 DB 백엔드 미가용 시 폴백용 (GitHub Pages 등 정적 호스팅)\n"
    "// ⚠️ 이 파일은 DB 스냅샷입니다. 갱신 스크립트: regenerate_fallback.py\n\n"
    f"window.fallbackEvents = {json.dumps(schedules, ensure_ascii=False, indent=2)};\n\n"
    f"window.fallbackLeavePlans = {json.dumps(leaves, ensure_ascii=False, indent=2)};\n\n"
    f"window.fallbackRequestSchedules = {json.dumps(requests, ensure_ascii=False, indent=2)};\n\n"
    f"window.fallbackEventColors = {json.dumps(colors, ensure_ascii=False, indent=2)};\n"
)

with open("data.js", "w", encoding="utf-8") as f:
    f.write(body)

print(f"[OK] data.js updated")
print(f"     schedules: {len(schedules)}")
print(f"     leave_plans: {len(leaves)}")
print(f"     request_schedules: {len(requests)}")
print(f"     event_colors: {len(colors)}")

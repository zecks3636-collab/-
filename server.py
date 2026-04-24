import os, json, boto3, psycopg2, psycopg2.extras
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ── DB 접속 (Secrets Manager → 환경변수 폴백) ──
def get_db_config():
    secret_arn = os.environ.get("DB_SECRET_ARN")
    if secret_arn:
        client = boto3.client("secretsmanager", region_name="ap-northeast-1")
        secret = json.loads(client.get_secret_value(SecretId=secret_arn)["SecretString"])
        return {
            "host":     secret.get("host",     os.environ.get("DB_HOST")),
            "port":     int(secret.get("port", os.environ.get("DB_PORT", 5432))),
            "dbname":   secret.get("dbname",   os.environ.get("DB_NAME", "postgres")),
            "user":     secret.get("username", os.environ.get("DB_USER")),
            "password": secret.get("password", os.environ.get("DB_PASSWORD")),
        }
    return {
        "host":     os.environ.get("DB_HOST"),
        "port":     int(os.environ.get("DB_PORT", 5432)),
        "dbname":   os.environ.get("DB_NAME", "postgres"),
        "user":     os.environ.get("DB_USER"),
        "password": os.environ.get("DB_PASSWORD"),
    }

def get_conn():
    cfg = get_db_config()
    conn = psycopg2.connect(
        **cfg,
        sslmode="require",
        channel_binding="disable",
        options="-c search_path=app_bti_schedule_prd",
    )
    return conn

# ── 모델 ──
class Schedule(BaseModel):
    id: str
    company: str
    date: str
    title: str

class LeavePlan(BaseModel):
    id: Optional[str] = None
    date: str
    team: Optional[str] = None
    rank: Optional[str] = None
    employee_name: Optional[str] = None
    leave_type: Optional[str] = None
    note: Optional[str] = None

class RequestSchedule(BaseModel):
    id: str
    date: str
    title: str
    category: Optional[str] = None
    note: Optional[str] = None

class ColorPayload(BaseModel):
    event_id: str
    bg: str
    text_color: str

# ── schedules ──
@app.get("/api/schedules")
def get_schedules():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, company, date, title FROM schedules ORDER BY date")
            return JSONResponse(cur.fetchall())

@app.post("/api/schedules/upsert")
def upsert_schedules(items: List[Schedule]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            for item in items:
                cur.execute("""
                    INSERT INTO schedules (id, company, date, title)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET company=EXCLUDED.company,
                    date=EXCLUDED.date, title=EXCLUDED.title
                """, (item.id, item.company, item.date, item.title))
        conn.commit()
    return {"status": "ok", "count": len(items)}

@app.delete("/api/schedules")
def delete_schedules(ids: List[str]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM schedules WHERE id = ANY(%s)", (ids,))
        conn.commit()
    return {"status": "ok"}

# ── leave_plans ──
@app.get("/api/leave_plans")
def get_leave_plans():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id::text, date, team, rank, employee_name, leave_type, note FROM leave_plans ORDER BY date")
            return JSONResponse(cur.fetchall())

@app.post("/api/leave_plans")
def insert_leave_plans(items: List[LeavePlan]):
    inserted = []
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for item in items:
                cur.execute("""
                    INSERT INTO leave_plans (id, date, team, rank, employee_name, leave_type, note)
                    VALUES (COALESCE(%s::uuid, gen_random_uuid()), %s, %s, %s, %s, %s, %s)
                    RETURNING id::text, date, team, rank, employee_name, leave_type, note
                """, (item.id, item.date, item.team, item.rank,
                      item.employee_name, item.leave_type, item.note))
                inserted.append(cur.fetchone())
        conn.commit()
    return JSONResponse(inserted)

@app.put("/api/leave_plans/{leave_id}")
def update_leave_plan(leave_id: str, item: LeavePlan):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE leave_plans SET date=%s, team=%s, rank=%s,
                employee_name=%s, leave_type=%s, note=%s WHERE id=%s::uuid
            """, (item.date, item.team, item.rank,
                  item.employee_name, item.leave_type, item.note, leave_id))
        conn.commit()
    return {"status": "ok"}

@app.delete("/api/leave_plans/{leave_id}")
def delete_leave_plan(leave_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM leave_plans WHERE id=%s::uuid", (leave_id,))
        conn.commit()
    return {"status": "ok"}

# ── request_schedules ──
@app.get("/api/request_schedules")
def get_request_schedules():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, date, title, category, note FROM request_schedules ORDER BY date")
            return JSONResponse(cur.fetchall())

@app.post("/api/request_schedules/upsert")
def upsert_request_schedules(items: List[RequestSchedule]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            for item in items:
                cur.execute("""
                    INSERT INTO request_schedules (id, date, title, category, note)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,
                    category=EXCLUDED.category, note=EXCLUDED.note
                """, (item.id, item.date, item.title, item.category, item.note))
        conn.commit()
    return {"status": "ok"}

# ── event_colors ──
@app.get("/api/event_colors")
def get_event_colors():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT event_id, bg, text_color FROM event_colors")
            rows = cur.fetchall()
            return JSONResponse({r["event_id"]: {"bg": r["bg"], "text": r["text_color"]} for r in rows})

@app.post("/api/event_colors")
def upsert_event_color(payload: ColorPayload):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO event_colors (event_id, bg, text_color)
                VALUES (%s, %s, %s)
                ON CONFLICT (event_id) DO UPDATE SET bg=EXCLUDED.bg, text_color=EXCLUDED.text_color
            """, (payload.event_id, payload.bg, payload.text_color))
        conn.commit()
    return {"status": "ok"}

@app.delete("/api/event_colors/{event_id}")
def delete_event_color(event_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM event_colors WHERE event_id=%s", (event_id,))
        conn.commit()
    return {"status": "ok"}

# ── 메뉴 이미지 스토리지 (/api/storage/menu-images/{week_key}) ──
@app.get("/api/storage/menu-images/{week_key}")
def get_menu_image(week_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT image_data FROM menu_weeks WHERE week_key=%s AND image_data IS NOT NULL",
                (week_key,)
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="image not found")
    return Response(content=bytes(row[0]), media_type="image/jpeg")

@app.post("/api/storage/menu-images/{week_key}")
async def upload_menu_image(week_key: str, file: UploadFile = File(...)):
    data = await file.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                   VALUES (%s, %s, %s, now(), %s)
                   ON CONFLICT (week_key) DO UPDATE
                   SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                       uploaded_at=now(), image_data=EXCLUDED.image_data""",
                (week_key, file.filename, week_key, psycopg2.Binary(data))
            )
        conn.commit()
    return {"status": "ok", "week_key": week_key}

# ── schedule_files (폴더별 원본 파일 보관) ──
_VALID_FOLDERS = {'Group', 'NBT', 'BIO', 'menu'}

@app.get("/api/files/{folder}")
def list_files(folder: str):
    if folder not in _VALID_FOLDERS:
        raise HTTPException(status_code=400, detail="invalid folder")
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id::text, filename, content_type, file_size, uploaded_at::text"
                " FROM schedule_files WHERE folder=%s ORDER BY uploaded_at DESC",
                (folder,)
            )
            return JSONResponse(cur.fetchall())

@app.post("/api/files/{folder}")
async def upload_file(folder: str, file: UploadFile = File(...)):
    if folder not in _VALID_FOLDERS:
        raise HTTPException(status_code=400, detail="invalid folder")
    data = await file.read()
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO schedule_files (folder, filename, content_type, file_data, file_size)"
                " VALUES (%s, %s, %s, %s, %s)"
                " RETURNING id::text, filename, file_size, uploaded_at::text",
                (folder, file.filename, file.content_type, psycopg2.Binary(data), len(data))
            )
        conn.commit()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id::text, filename, file_size, uploaded_at::text"
                " FROM schedule_files WHERE folder=%s AND filename=%s ORDER BY uploaded_at DESC LIMIT 1",
                (folder, file.filename)
            )
            return JSONResponse(cur.fetchone())

@app.get("/api/files/{folder}/{file_id}")
def download_file(folder: str, file_id: str):
    if folder not in _VALID_FOLDERS:
        raise HTTPException(status_code=400, detail="invalid folder")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT filename, content_type, file_data FROM schedule_files"
                " WHERE id=%s::uuid AND folder=%s",
                (file_id, folder)
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="file not found")
    filename, content_type, file_data = row
    return Response(
        content=bytes(file_data),
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.delete("/api/files/{folder}/{file_id}")
def delete_file(folder: str, file_id: str):
    if folder not in _VALID_FOLDERS:
        raise HTTPException(status_code=400, detail="invalid folder")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM schedule_files WHERE id=%s::uuid AND folder=%s",
                (file_id, folder)
            )
        conn.commit()
    return {"status": "ok"}

# ── 정적 파일 서빙 ──
app.mount("/", StaticFiles(directory=".", html=True), name="static")

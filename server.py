import os, json, io, re, datetime, base64, boto3, psycopg2, psycopg2.extras
from fastapi import FastAPI, File, UploadFile, HTTPException, Header
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
                    ON CONFLICT (id) DO UPDATE SET date=EXCLUDED.date,
                    title=EXCLUDED.title, category=EXCLUDED.category, note=EXCLUDED.note
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

# ── menu_weeks 목록 조회 ──
@app.get("/api/menu_weeks")
def list_menu_weeks():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT week_key, file_name, storage_path, uploaded_at::text"
                " FROM menu_weeks ORDER BY week_key"
            )
            return JSONResponse(cur.fetchall())

# ── menu_weeks upsert (앱이 스토리지 업로드 후 메타데이터 별도 upsert) ──
@app.post("/api/menu_weeks/upsert")
def upsert_menu_weeks(items: List[dict]):
    if not items:
        return JSONResponse({"data": [], "error": None})
    with get_conn() as conn:
        with conn.cursor() as cur:
            for item in items:
                cur.execute(
                    """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at)
                       VALUES (%(week_key)s, %(file_name)s, %(storage_path)s, %(uploaded_at)s)
                       ON CONFLICT (week_key) DO UPDATE
                       SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                           uploaded_at=EXCLUDED.uploaded_at""",
                    item,
                )
        conn.commit()
    return JSONResponse({"data": None, "error": None})

# ── request_months (요청자료 PDF 이미지) ──
@app.get("/api/request_months")
def list_request_months():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT month_key, file_name, storage_path, uploaded_at::text FROM request_months ORDER BY month_key"
            )
            return JSONResponse(cur.fetchall())

@app.post("/api/request_months/upsert")
def upsert_request_months(items: List[dict]):
    if not items:
        return JSONResponse({"data": [], "error": None})
    with get_conn() as conn:
        with conn.cursor() as cur:
            for item in items:
                cur.execute(
                    """INSERT INTO request_months (month_key, file_name, storage_path, uploaded_at)
                       VALUES (%(month_key)s, %(file_name)s, %(storage_path)s, %(uploaded_at)s)
                       ON CONFLICT (month_key) DO UPDATE
                       SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                           uploaded_at=EXCLUDED.uploaded_at""",
                    item,
                )
        conn.commit()
    return JSONResponse({"data": None, "error": None})

@app.get("/api/storage/request-images/{month_key}")
def get_request_image(month_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT image_data FROM request_months WHERE month_key=%s AND image_data IS NOT NULL",
                (month_key,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="image not found")
    return Response(content=bytes(row[0]), media_type="image/jpeg")

@app.post("/api/storage/request-images/{month_key}")
async def upload_request_image(month_key: str, file: UploadFile = File(...)):
    data = await file.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO request_months (month_key, file_name, storage_path, uploaded_at, image_data)
                   VALUES (%s, %s, %s, now(), %s)
                   ON CONFLICT (month_key) DO UPDATE
                   SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                       uploaded_at=now(), image_data=EXCLUDED.image_data""",
                (month_key, file.filename, month_key, psycopg2.Binary(data)),
            )
        conn.commit()
    return JSONResponse({"status": "ok", "month_key": month_key})

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

# ── schedules 개별/배치 삭제 ──
@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM schedules WHERE id=%s", (schedule_id,))
        conn.commit()
    return {"status": "ok"}

@app.post("/api/schedules/delete")
def delete_schedules_batch(ids: List[str]):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM schedules WHERE id = ANY(%s)", (ids,))
        conn.commit()
    return {"status": "ok"}

# ── request_schedules 삭제 ──
@app.delete("/api/request_schedules/{item_id}")
def delete_request_schedule(item_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM request_schedules WHERE id=%s", (item_id,))
        conn.commit()
    return {"status": "ok"}

# ── menu_weeks 삭제 ──
@app.delete("/api/menu_weeks/{week_key}")
def delete_menu_week(week_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM menu_weeks WHERE week_key=%s", (week_key,))
        conn.commit()
    return {"status": "ok"}

# ── request_months 삭제 ──
@app.delete("/api/request_months/{month_key}")
def delete_request_month(month_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM request_months WHERE month_key=%s", (month_key,))
        conn.commit()
    return {"status": "ok"}

# ── 스토리지 이미지 삭제 ──
@app.delete("/api/storage/menu-images/{week_key}")
def delete_menu_image(week_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE menu_weeks SET image_data=NULL WHERE week_key=%s OR storage_path=%s",
                (week_key, week_key)
            )
        conn.commit()
    return {"status": "ok"}

@app.delete("/api/storage/request-images/{month_key}")
def delete_request_image(month_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE request_months SET image_data=NULL WHERE month_key=%s OR storage_path=%s",
                (month_key, month_key)
            )
        conn.commit()
    return {"status": "ok"}

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

def _monday_of_week(d: datetime.date) -> str:
    """주어진 날짜가 속한 주의 월요일 (YYYY-MM-DD)"""
    return (d - datetime.timedelta(days=d.weekday())).strftime("%Y-%m-%d")

def _pdf_to_jpeg(data: bytes) -> bytes:
    """PDF 첫 페이지를 JPEG bytes로 변환 (pymupdf + Pillow)"""
    import fitz
    from PIL import Image
    doc = fitz.open(stream=data, filetype="pdf")
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()

@app.post("/api/files/{folder}")
async def upload_file(folder: str, file: UploadFile = File(...)):
    if folder not in _VALID_FOLDERS:
        raise HTTPException(status_code=400, detail="invalid folder")
    data = await file.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO schedule_files (folder, filename, content_type, file_data, file_size)"
                " VALUES (%s, %s, %s, %s, %s)",
                (folder, file.filename, file.content_type, psycopg2.Binary(data), len(data))
            )
        conn.commit()

    # menu 폴더 PDF → 주간식단표 자동 반영
    if folder == "menu" and (file.content_type == "application/pdf" or
                              file.filename.lower().endswith(".pdf")):
        try:
            jpeg = _pdf_to_jpeg(data)
            week_key = _monday_of_week(datetime.date.today())
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                           VALUES (%s, %s, %s, now(), %s)
                           ON CONFLICT (week_key) DO UPDATE
                           SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                               uploaded_at=now(), image_data=EXCLUDED.image_data""",
                        (week_key, file.filename, week_key, psycopg2.Binary(jpeg)),
                    )
                conn.commit()
        except Exception as e:
            print(f"[warn] menu PDF auto-convert failed: {e}")

    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id::text, filename, file_size, uploaded_at::text"
                " FROM schedule_files WHERE folder=%s AND filename=%s ORDER BY uploaded_at DESC LIMIT 1",
                (folder, file.filename),
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

# ── Gmail 식단표 자동 업로드 ──
MENU_AUTO_TOKEN = os.environ.get("MENU_AUTO_TOKEN", "bti-menu-2026")

def _next_monday(d: datetime.date) -> str:
    """금요일 수신 기준 → 다음 주 월요일 week_key 산출"""
    days_ahead = 7 - d.weekday()  # 월=0 → 7, 금=4 → 3
    if days_ahead == 7:
        days_ahead = 0
    return (d + datetime.timedelta(days=days_ahead)).strftime("%Y-%m-%d")

@app.post("/api/menu_auto")
async def menu_auto_upload(
    file: UploadFile = File(...),
    x_menu_token: Optional[str] = Header(None),
    week_key: Optional[str] = None,
):
    if x_menu_token != MENU_AUTO_TOKEN:
        raise HTTPException(status_code=403, detail="invalid token")
    data = await file.read()
    if not (file.content_type == "application/pdf" or
            file.filename.lower().endswith(".pdf")):
        raise HTTPException(status_code=400, detail="PDF only")
    jpeg = _pdf_to_jpeg(data)
    wk = week_key or _next_monday(datetime.date.today())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                   VALUES (%s, %s, %s, now(), %s)
                   ON CONFLICT (week_key) DO UPDATE
                   SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                       uploaded_at=now(), image_data=EXCLUDED.image_data""",
                (wk, file.filename, wk, psycopg2.Binary(jpeg)),
            )
        conn.commit()
    return {"status": "ok", "week_key": wk, "file": file.filename, "jpeg_size": len(jpeg)}

class MenuAutoB64(BaseModel):
    token: str
    filename: str
    pdf_base64: str
    week_key: Optional[str] = None

@app.post("/api/menu_auto_b64")
def menu_auto_b64(body: MenuAutoB64):
    if body.token != MENU_AUTO_TOKEN:
        raise HTTPException(status_code=403, detail="invalid token")
    data = base64.b64decode(body.pdf_base64)
    jpeg = _pdf_to_jpeg(data)
    wk = body.week_key or _next_monday(datetime.date.today())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                   VALUES (%s, %s, %s, now(), %s)
                   ON CONFLICT (week_key) DO UPDATE
                   SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                       uploaded_at=now(), image_data=EXCLUDED.image_data""",
                (wk, body.filename, wk, psycopg2.Binary(jpeg)),
            )
        conn.commit()
    return {"status": "ok", "week_key": wk, "file": body.filename, "jpeg_size": len(jpeg)}

class MenuAutoDrive(BaseModel):
    token: str
    filename: str
    drive_url: str
    week_key: Optional[str] = None

@app.post("/api/menu_auto_drive")
def menu_auto_drive(body: MenuAutoDrive):
    if body.token != MENU_AUTO_TOKEN:
        raise HTTPException(status_code=403, detail="invalid token")
    import urllib.request
    try:
        with urllib.request.urlopen(body.drive_url, timeout=30) as r:
            data = r.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Drive download failed: {e}")
    jpeg = _pdf_to_jpeg(data)
    wk = body.week_key or _next_monday(datetime.date.today())
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                   VALUES (%s, %s, %s, now(), %s)
                   ON CONFLICT (week_key) DO UPDATE
                   SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                       uploaded_at=now(), image_data=EXCLUDED.image_data""",
                (wk, body.filename, wk, psycopg2.Binary(jpeg)),
            )
        conn.commit()
    return {"status": "ok", "week_key": wk, "file": body.filename, "jpeg_size": len(jpeg)}

# ── 식단표 자동 반영 (Google Sheets 큐 폴링) ──
MENU_SHEET_ID = "1_KLMONstfHH0izaneMF_Y25U_MLbXrLPRVZY7GJN3VM"

@app.post("/api/menu_auto_poll")
def menu_auto_poll():
    import urllib.request, csv as csvmod
    sheet_url = f"https://docs.google.com/spreadsheets/d/{MENU_SHEET_ID}/gviz/tq?tqx=out:csv"
    try:
        with urllib.request.urlopen(sheet_url, timeout=15) as r:
            text = r.read().decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sheet read failed: {e}")
    rows = list(csvmod.reader(text.splitlines()))
    if len(rows) < 2:
        return {"status": "no_new", "message": "신규 항목 없음"}
    processed = []
    for row in rows[1:]:
        if len(row) < 4:
            continue
        drive_url, filename, timestamp, done = row[0], row[1], row[2], row[3]
        if done.strip().lower() in ("y", "done", "완료"):
            continue
        if not drive_url.startswith("http"):
            continue
        try:
            # Sheet 기록 시점(금요일) 기준으로 다음 주 월요일 산출
            try:
                sheet_date = datetime.datetime.strptime(timestamp.strip()[:10], "%Y-%m-%d").date()
            except Exception:
                sheet_date = datetime.date.today()
            wk = _next_monday(sheet_date)
            # 이미 해당 주에 데이터 있으면 스킵
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1 FROM menu_weeks WHERE week_key=%s AND image_data IS NOT NULL", (wk,))
                    if cur.fetchone():
                        continue
            with urllib.request.urlopen(drive_url, timeout=30) as r:
                data = r.read()
            jpeg = _pdf_to_jpeg(data)
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO menu_weeks (week_key, file_name, storage_path, uploaded_at, image_data)
                           VALUES (%s, %s, %s, now(), %s)
                           ON CONFLICT (week_key) DO UPDATE
                           SET file_name=EXCLUDED.file_name, storage_path=EXCLUDED.storage_path,
                               uploaded_at=now(), image_data=EXCLUDED.image_data""",
                        (wk, filename, wk, psycopg2.Binary(jpeg)),
                    )
                conn.commit()
            processed.append({"week_key": wk, "file": filename, "jpeg_size": len(jpeg)})
        except Exception as e:
            processed.append({"file": filename, "error": str(e)})
    if not processed:
        return {"status": "no_new", "message": "처리할 항목 없음"}
    return {"status": "ok", "processed": processed}

# ── 일정표 자동 import (Google Drive 폴더 감시 + diff 미리보기) ──
SCHEDULE_DRIVE_FOLDER = "1RDMeEGEq88IIUC4TdLSWHZJKDa9WtdYC"
SCHEDULE_AUTO_TOKEN = os.environ.get("SCHEDULE_AUTO_TOKEN", "bti-schedule-2026")

def _ensure_schedule_imports_table():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schedule_imports (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    drive_url TEXT NOT NULL,
                    target_month TEXT,
                    parsed_json JSONB,
                    diff_json JSONB,
                    status TEXT DEFAULT 'pending',
                    detected_at TIMESTAMP DEFAULT now(),
                    applied_at TIMESTAMP,
                    UNIQUE(filename, company)
                )
            """)
        conn.commit()

class ScheduleImportSubmit(BaseModel):
    token: str
    company: str   # Group/NBT/BIO
    filename: str
    drive_url: str

@app.post("/api/schedule_imports/submit")
def schedule_imports_submit(body: ScheduleImportSubmit):
    """Apps Script가 신규 파일 발견 시 호출 → 파싱 + diff 계산 + 저장"""
    if body.token != SCHEDULE_AUTO_TOKEN:
        raise HTTPException(status_code=403, detail="invalid token")
    if body.company not in ("Group", "NBT", "BIO"):
        raise HTTPException(status_code=400, detail="invalid company")
    _ensure_schedule_imports_table()

    # 중복 체크
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id::text, status FROM schedule_imports WHERE filename=%s AND company=%s",
                       (body.filename, body.company))
            row = cur.fetchone()
            if row:
                return {"status": "duplicate", "id": row[0], "existing_status": row[1]}

    # Drive에서 PDF 다운로드
    import urllib.request
    try:
        with urllib.request.urlopen(body.drive_url, timeout=60) as r:
            data = r.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Drive download failed: {e}")

    # 파싱
    import xls_parsers
    parser = {"Group": xls_parsers.parse_group,
              "NBT":   xls_parsers.parse_nbt,
              "BIO":   xls_parsers.parse_bio}[body.company]
    try:
        parsed = parser(data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")
    if not parsed:
        raise HTTPException(status_code=400, detail="파싱 결과 0건 — 양식 확인 필요")

    # 대상 월 식별
    target_month = parsed[0]['date'][:7]

    # 기존 DB schedules와 비교 (해당 월·회사)
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, company, to_char(date,'YYYY-MM-DD') as date, title FROM schedules "
                "WHERE company=%s AND to_char(date,'YYYY-MM')=%s",
                (body.company, target_month))
            existing = cur.fetchall()

    # diff 계산: 자동생성 ID (mirror, req-auto) 제외
    def is_auto(s):
        sid = s.get('id', '')
        return 'mirror' in sid or sid.startswith('req-auto-') or 'Group-' in sid and 'mirror' in sid

    manual_existing = [s for s in existing if not is_auto(s)]

    # 키: (date, normalized_title)
    def key(s):
        return (s['date'], re.sub(r'\s+', ' ', s['title']).strip())

    parsed_keys = {key(p): p for p in parsed}
    existing_keys = {key(s): s for s in manual_existing}

    adds = [p for k, p in parsed_keys.items() if k not in existing_keys]
    removes = [s for k, s in existing_keys.items() if k not in parsed_keys]
    unchanged = [s for k, s in existing_keys.items() if k in parsed_keys]

    diff = {
        "target_month": target_month,
        "adds": adds,
        "removes": [{"id": s["id"], "date": s["date"], "title": s["title"]} for s in removes],
        "unchanged_count": len(unchanged),
    }

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO schedule_imports (company, filename, drive_url, target_month, parsed_json, diff_json, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'pending')
                RETURNING id::text
            """, (body.company, body.filename, body.drive_url, target_month,
                  json.dumps(parsed), json.dumps(diff)))
            new_id = cur.fetchone()[0]
        conn.commit()
    return {"status": "ok", "id": new_id, "diff_summary": {
        "adds": len(adds), "removes": len(removes), "unchanged": len(unchanged)
    }}

@app.get("/api/schedule_imports")
def schedule_imports_list(status: Optional[str] = None):
    _ensure_schedule_imports_table()
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if status:
                cur.execute("SELECT id::text, company, filename, target_month, diff_json, status, "
                           "detected_at::text, applied_at::text FROM schedule_imports "
                           "WHERE status=%s ORDER BY detected_at DESC LIMIT 20", (status,))
            else:
                cur.execute("SELECT id::text, company, filename, target_month, diff_json, status, "
                           "detected_at::text, applied_at::text FROM schedule_imports "
                           "ORDER BY detected_at DESC LIMIT 20")
            return JSONResponse(cur.fetchall())

@app.get("/api/schedule_imports/{import_id}")
def schedule_imports_detail(import_id: str):
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id::text, company, filename, drive_url, target_month, "
                       "parsed_json, diff_json, status, detected_at::text, applied_at::text "
                       "FROM schedule_imports WHERE id=%s::uuid", (import_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    return JSONResponse(row)

class ScheduleApplyBody(BaseModel):
    apply_adds: bool = True
    apply_removes: bool = False  # 기본은 삭제 안 함 (안전 우선)
    remove_ids: Optional[List[str]] = None  # 명시적으로 삭제할 ID 목록

@app.post("/api/schedule_imports/{import_id}/apply")
def schedule_imports_apply(import_id: str, body: ScheduleApplyBody):
    import uuid
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id::text, company, diff_json, status FROM schedule_imports "
                       "WHERE id=%s::uuid", (import_id,))
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    if row['status'] != 'pending':
        raise HTTPException(status_code=400, detail=f"이미 처리됨 (status={row['status']})")

    diff = row['diff_json']
    company = row['company']
    applied_adds = 0
    applied_removes = 0

    with get_conn() as conn:
        with conn.cursor() as cur:
            # 추가
            if body.apply_adds:
                for item in diff.get('adds', []):
                    new_id = f"{company}-{item['date']}-{uuid.uuid4().hex[:8]}"
                    cur.execute("""
                        INSERT INTO schedules (id, company, date, title)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                    """, (new_id, company, item['date'], item['title']))
                    applied_adds += 1
            # 삭제 (사용자가 명시한 ID만)
            if body.apply_removes and body.remove_ids:
                for rid in body.remove_ids:
                    cur.execute("DELETE FROM schedules WHERE id=%s", (rid,))
                    applied_removes += cur.rowcount
            cur.execute("UPDATE schedule_imports SET status='applied', applied_at=now() WHERE id=%s::uuid",
                       (import_id,))
        conn.commit()
    return {"status": "ok", "applied_adds": applied_adds, "applied_removes": applied_removes}

@app.post("/api/schedule_imports/poll")
def schedule_imports_poll():
    """Sheet의 'schedules' 탭에서 신규 파일 감지 → submit 처리"""
    import urllib.request, csv as csvmod
    _ensure_schedule_imports_table()
    sheet_url = f"https://docs.google.com/spreadsheets/d/{MENU_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=schedules"
    try:
        with urllib.request.urlopen(sheet_url, timeout=15) as r:
            text = r.read().decode("utf-8-sig")
    except Exception as e:
        return {"status": "error", "message": f"Sheet read failed: {e}"}
    rows = list(csvmod.reader(text.splitlines()))
    if len(rows) < 2:
        return {"status": "no_new", "message": "큐 비어있음"}

    processed = []
    for row in rows[1:]:
        if len(row) < 5:
            continue
        company, drive_url, filename, timestamp, done = row[0], row[1], row[2], row[3], row[4]
        if done.strip().lower() in ("y", "done", "완료"):
            continue
        if not drive_url.startswith("http") or company not in ("Group", "NBT", "BIO"):
            continue
        # 중복 체크 (이미 import 기록 있으면 스킵)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM schedule_imports WHERE filename=%s AND company=%s",
                           (filename, company))
                if cur.fetchone():
                    continue
        try:
            req_body = ScheduleImportSubmit(
                token=SCHEDULE_AUTO_TOKEN, company=company,
                filename=filename, drive_url=drive_url
            )
            result = schedule_imports_submit(req_body)
            # 옵션 A: 자동 추가 적용 (삭제는 안 함)
            if result.get("status") == "ok" and result.get("id"):
                try:
                    apply_result = schedule_imports_apply(
                        result["id"],
                        ScheduleApplyBody(apply_adds=True, apply_removes=False)
                    )
                    processed.append({
                        "file": filename, "company": company,
                        "diff": result.get("diff_summary"),
                        "applied_adds": apply_result.get("applied_adds", 0),
                    })
                except Exception as e:
                    processed.append({"file": filename, "auto_apply_error": str(e)})
            else:
                processed.append({"file": filename, "company": company, "result": result})
        except HTTPException as e:
            processed.append({"file": filename, "error": e.detail})
        except Exception as e:
            processed.append({"file": filename, "error": str(e)})
    if not processed:
        return {"status": "no_new"}
    return {"status": "ok", "processed": processed}

@app.post("/api/schedule_imports/{import_id}/reject")
def schedule_imports_reject(import_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE schedule_imports SET status='rejected', applied_at=now() "
                       "WHERE id=%s::uuid AND status='pending'", (import_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="pending 항목 없음")
        conn.commit()
    return {"status": "ok"}

# ── 정적 파일 서빙 ──
app.mount("/", StaticFiles(directory=".", html=True), name="static")

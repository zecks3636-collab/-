import os
import json
import math
import re
import pandas as pd
import pdfplumber
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Event(BaseModel):
    id: str
    company: str
    date: str
    title: str

def get_company_from_filename(filename):
    name = filename.upper()
    if 'NBT' in name: return 'NBT'
    if 'BIO' in name: return 'BIO'
    return 'Group'

def load_schedules():
    if os.path.exists('schedules.json'):
        with open('schedules.json', 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return []
    return []

def save_schedules(schedules):
    with open('schedules.json', 'w', encoding='utf-8') as f:
        json.dump(schedules, f, ensure_ascii=False, indent=2)
    # ALSO UPDATE embedded data.js
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write('window.fallbackEvents = ' + json.dumps(schedules, ensure_ascii=False, indent=2) + ';')

def extract_events_from_excel(file_content: bytes, company: str, filename: str):
    new_events = []
    try:
        xls = pd.ExcelFile(file_content)
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
            for row_idx in range(len(df)):
                row = df.iloc[row_idx]
                for col_idx, cell in enumerate(row):
                    date_val = None
                    if isinstance(cell, pd.Timestamp):
                        date_val = cell.day
                    elif isinstance(cell, (int, float)) and not math.isnan(cell) and 1 <= cell <= 31:
                        date_val = int(cell)
                    elif isinstance(cell, str) and cell.strip().isdigit() and 1 <= int(cell.strip()) <= 31:
                        date_val = int(cell.strip())

                    if date_val is not None:
                        for offset in range(1, 6):
                            if row_idx + offset < len(df):
                                event_cell = df.iloc[row_idx + offset, col_idx]
                                if pd.isna(event_cell) or str(event_cell).strip() in ["", "nan"]:
                                    continue
                                
                                event_text = str(event_cell).strip()
                                if event_text.isdigit() or event_text in ['일', '월', '화', '수', '목', '금', '토'] or isinstance(event_cell, pd.Timestamp):
                                    break
                                    
                                new_events.append({
                                    "id": f"{company}-{date_val}-{offset}-upl",
                                    "company": company,
                                    "date": f"2026-04-{date_val:02d}",
                                    "title": event_text
                                })
    except Exception as e:
        print("Excel Parsing Error:", e)
    return new_events

def extract_events_from_pdf(filepath: str, company: str):
    new_events = []
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for r_idx, row in enumerate(table):
                        if not row: continue
                        for c_idx, cell in enumerate(row):
                            if not cell: continue
                            lines = cell.split('\n')
                            date_val = None
                            
                            first_line = lines[0].strip()
                            if first_line.isdigit() and 1 <= int(first_line) <= 31:
                                date_val = int(first_line)
                            
                            if date_val is not None and len(lines) > 1:
                                for offset, event_text in enumerate(lines[1:]):
                                    ev = event_text.strip()
                                    if ev:
                                        new_events.append({
                                            "id": f"{company}-{date_val}-{offset}-pdf",
                                            "company": company,
                                            "date": f"2026-04-{date_val:02d}",
                                            "title": ev
                                        })
    except Exception as e:
        print("PDF Parsing Error:", e)
    return new_events

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename
    company = get_company_from_filename(filename)
    
    contents = await file.read()
    temp_path = f"temp_{filename}"
    with open(temp_path, "wb") as f:
        f.write(contents)
        
    new_events = []
    if filename.lower().endswith('.pdf'):
        new_events = extract_events_from_pdf(temp_path, company)
    elif filename.lower().endswith('.xls') or filename.lower().endswith('.xlsx'):
        new_events = extract_events_from_excel(contents, company, filename)
        
    os.remove(temp_path)
    if not new_events:
        return JSONResponse({"status": "error", "message": "해당 문서에서 일정 달력 표를 완전히 읽지 못했습니다. 구조가 다를 수 있습니다."})
        
    return JSONResponse({
        "status": "success", 
        "message": f"총 {len(new_events)}개의 일정이 추출되었습니다. 표에서 확인 후 최종 반영해 주세요.",
        "events": new_events
    })

@app.post("/save")
async def save_events(events: List[Event]):
    all_events = load_schedules()
    seen = {(e['company'], e['date'], e['title']) for e in all_events}
    
    added_count = 0
    for ev in events:
        ne = ev.model_dump() # Support Pydantic 2
        k = (ne['company'], ne['date'], ne['title'])
        if k not in seen:
            seen.add(k)
            all_events.append(ne)
            added_count += 1
            
    if added_count > 0:
        all_events.sort(key=lambda x: x['date'])
        save_schedules(all_events)
        
    return JSONResponse({
        "status": "success", 
        "message": f"검토가 완료되어 {added_count}개의 새로운 일정이 캘린더에 성공적으로 신규 반영되었습니다.",
        "added_count": added_count
    })


# Serve static files at the root
app.mount("/", StaticFiles(directory=".", html=True), name="static")


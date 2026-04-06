import pandas as pd
import json
import re
import math

files = {
    "Group": "2026년 4월 그룹 일정표 - 1차수정.xls",
    "NBT": "2026년 4월 NBT일정표_공지용.xlsx",
    "BIO": "2026년 4월 BIO일정표.xls"
}
sheets = {
    "Group": "일정표",
    "NBT": "4월 일정표(2026년)",
    "BIO": "4월"
}

events = []

for company, f in files.items():
    try:
        df = pd.read_excel(f, sheet_name=sheets[company], header=None)
        
        # We need to find rows that contain numbers 1-31 which represent dates.
        # Then, events are usually in the rows directly below those dates.
        for row_idx in range(len(df)):
            row = df.iloc[row_idx]
            
            for col_idx, cell in enumerate(row):
                date_val = None
                
                # Check for timestamp
                if isinstance(cell, pd.Timestamp):
                    date_val = cell.day
                # Check for number
                elif isinstance(cell, (int, float)) and not math.isnan(cell) and 1 <= cell <= 31:
                    # Make sure it's actually acting as a date by checking if surrounding or previous row implies calendar
                    date_val = int(cell)
                # Check for string number
                elif isinstance(cell, str) and cell.strip().isdigit() and 1 <= int(cell.strip()) <= 31:
                    date_val = int(cell.strip())
                    
                if date_val is not None:
                    # Ensure it's part of a calendar timeline (very basic heuristic)
                    # We will scan down until next valid date or empty space
                    for offset in range(1, 6):
                        if row_idx + offset < len(df):
                            event_cell = df.iloc[row_idx + offset, col_idx]
                            
                            # if it's NaT or NaN
                            if pd.isna(event_cell) or str(event_cell).strip() == "" or str(event_cell).strip() == "nan":
                                continue
                            
                            event_text = str(event_cell).strip()
                            
                            if event_text.isdigit() or event_text in ['일', '월', '화', '수', '목', '금', '토'] or isinstance(event_cell, pd.Timestamp):
                                break
                                
                            events.append({
                                "id": f"{company}-{date_val}-{offset}-{col_idx}",
                                "company": company,
                                "date": f"2026-04-{date_val:02d}",
                                "title": event_text
                            })
    except Exception as e:
        print(f"Error parsing {company}: {e}")

# Remove duplicates if any
unique_events = []
seen = set()
for e in events:
    # Use company, date, title as unique key
    k = (e['company'], e['date'], e['title'])
    if k not in seen:
        seen.add(k)
        unique_events.append(e)

with open("schedules.json", "w", encoding="utf-8") as out:
    json.dump(unique_events, out, ensure_ascii=False, indent=2)

print(f"schedules.json created! Found {len(unique_events)} unique events.")

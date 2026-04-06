import pandas as pd
import json

files = [
    "2026년 4월 그룹 일정표 - 1차수정.xls",
    "2026년 4월 NBT일정표_공지용.xlsx",
    "2026년 4월 BIO일정표.xls"
]

for f in files:
    print(f"--- {f} ---")
    try:
        # We don't know the exact format, so we just read all sheets and the first few rows
        xls = pd.ExcelFile(f)
        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            print(f"Sheet: {sheet_name}")
            print(df.head(5).to_string())
            print(f"Columns: {df.columns.tolist()}")
    except Exception as e:
        print(f"Error: {e}")

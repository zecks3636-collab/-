@echo off
echo 대시보드 서버를 시작합니다... (이 창을 닫으면 종료됩니다)
start http://localhost:8000
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
pause

@echo off
echo Starting Stick Animation Pipeline...

REM Kill any existing process on port 8000
echo Checking port 8000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":8000[^0-9]"') do (
    echo Killing PID %%p on port 8000
    taskkill /PID %%p /F >nul 2>&1
)

REM Start backend in new window with conda env activated
start "Backend - FastAPI" cmd /k "call C:\Users\aliz\anaconda3\Scripts\activate.bat deepseekcrawler && cd /d "%~dp0backend" && uv sync && uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

REM Start frontend in new window
start "Frontend - Vite" cmd /k "cd /d "%~dp0frontend" && npm install && npm run dev"

echo.
echo Both processes started in separate windows.
echo Backend  -^> http://localhost:8000
echo Frontend -^> http://localhost:5173
echo.

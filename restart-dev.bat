@echo off
cd /d C:\Users\waqia\fe-system
echo Stopping any process on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /PID %%a /F 2>nul
timeout /t 2 /nobreak >nul
echo Starting npm run dev...
npm run dev

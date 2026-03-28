@echo off
title LanePilot Dev

echo ====================================
echo   LanePilot Starting...
echo ====================================

echo [1/2] Starting API server...
start "LanePilot-API" cmd /k "cd /d C:\"My Project"\lanepilot && uvicorn api.server:app --reload --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Expo app...
start "LanePilot-Expo" cmd /k "cd /d C:\"My Project"\lanepilot\mobile && npx expo start --web"

timeout /t 5 /nobreak >nul

echo Opening browser...
start http://localhost:8081

echo ====================================
echo   API:  http://localhost:8000/docs
echo   App:  http://localhost:8081
echo   Close the two cmd windows to stop.
echo ====================================

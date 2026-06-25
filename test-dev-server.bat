@echo off
start /b npm run dev
setlocal enabledelayedexpansion
set /a count=0
:wait
 timeout /t 1 /nobreak >nul
 set /a count+=1
 if !count! lss 10 goto wait

curl -s -o nul -w "127.0.0.1: %%{http_code}\n" http://127.0.0.1:5174
curl -s -o nul -w "localhost: %%{http_code}\n" http://localhost:5174

taskkill /f /im node.exe >nul 2>&1

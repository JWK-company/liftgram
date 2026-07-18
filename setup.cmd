@echo off
REM jwk-platform Windows installer — launches setup.ps1 with the built-in Windows PowerShell.
REM Double-click, or run from cmd:  setup.cmd            (full install)
REM                                 setup.cmd -Check     (status)
REM                                 setup.cmd -Channels  (channel guidance)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
if errorlevel 1 (
  echo.
  echo [X] setup failed. See messages above.
  pause
  exit /b 1
)
pause

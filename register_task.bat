@echo off
REM Run this as Administrator (right-click -> "Run as administrator")

set TASK_NAME=MinecraftServerStarterAgent
set SCRIPT_DIR=%~dp0

schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_DIR%run_agent.bat\"" /sc onstart /ru SYSTEM /rl highest /f

echo.
echo Task "%TASK_NAME%" has been registered.
echo The agent will now start automatically whenever this PC boots, even without logging in.
echo Logs are written to %SCRIPT_DIR%agent.log
echo.
echo If the agent does not start, the SYSTEM account may not be able to find "node".
echo In that case, run "where node" in a command prompt to get the full path,
echo then replace "node" in run_agent.bat with that full path (e.g. "C:\Program Files\nodejs\node.exe").
pause

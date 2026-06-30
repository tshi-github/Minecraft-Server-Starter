@echo off
cd /d "%~dp0"
node local_agent.js >> agent.log 2>&1

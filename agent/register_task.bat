@echo off
REM 管理者権限の「コマンドプロンプト」または「PowerShell」で実行してください
REM (右クリック→「管理者として実行」したcmdの中でこのbatを実行する)

set TASK_NAME=MinecraftServerStarterAgent
set SCRIPT_DIR=%~dp0

schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_DIR%run_agent.bat\"" /sc onstart /ru SYSTEM /rl highest /f

echo.
echo タスク "%TASK_NAME%" を登録しました。
echo PCを再起動すると、ログインしなくても自動でエージェントが起動します。
echo ログは %SCRIPT_DIR%agent.log に出力されます。
echo.
echo もし起動しない場合は、SYSTEM権限から node コマンドが見つからない可能性があります。
echo その場合は run_agent.bat の「node」の部分を、コマンドプロンプトで
echo   where node
echo を実行して表示されるフルパス(例: "C:\Program Files\nodejs\node.exe")に書き換えてください。
pause

@echo off
rem Ohomt Android test: start the emulator (if not running), install the latest test build, open the app.
rem Double-click to run. App data (records, payment test state) is kept.
setlocal
set SDK=C:\Users\GreenIT\Android\sdk
set ADB=%SDK%\platform-tools\adb.exe
set APK=%~dp0..\android\app\build\outputs\apk\debug\app-debug.apk

"%ADB%" get-state >nul 2>&1
if errorlevel 1 (
  echo Starting emulator... first boot takes 2-3 minutes.
  start "" "%SDK%\emulator\emulator.exe" -avd homet -timezone Asia/Seoul -no-snapshot-save -gpu swiftshader_indirect
)
"%ADB%" wait-for-device
:boot
set BOOT=
for /f %%b in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set BOOT=%%b
if not "%BOOT%"=="1" ( timeout /t 3 >nul & goto boot )

echo Installing app...
"%ADB%" install -r "%APK%"
"%ADB%" shell am start -n com.can3719.homet/.MainActivity
echo.
echo Ready. Use the emulator window to test.
echo Payment test: Settings - bottom - Test menu
pause

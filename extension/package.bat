@echo off
echo 🚀 Creating AnimeStars Kodik Extension Package...

cd /d "%~dp0"

echo 📦 Building extension...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo 📁 Creating ZIP archive...
cd dist
powershell -Command "Compress-Archive -Path * -DestinationPath '../animestars-kodik-extension.zip' -Force"
cd ..

if exist "animestars-kodik-extension.zip" (
    echo ✅ Package created successfully: animestars-kodik-extension.zip
    echo 📊 Package size:
    dir animestars-kodik-extension.zip | findstr ".zip"
    echo.
    echo 🎯 Ready for installation in Chrome!
) else (
    echo ❌ Failed to create package
)

pause

@echo off
echo 🚀 AnimeStars Kodik Optimizer Release Builder
echo.

echo 📦 Installing dependencies...
call npm install
if errorlevel 1 goto :error

echo.
echo 🔢 Updating version...
call npm run version
if errorlevel 1 goto :error

echo.
echo 🏗️ Building release...
call npm run release
if errorlevel 1 goto :error

echo.
echo ✅ Release build complete!
echo 📁 Check the releases/ folder for the ZIP file
echo.
echo 📋 Next steps:
echo 1. Test the extension manually
echo 2. Commit and push changes
echo 3. Create GitHub release and upload the ZIP
echo.
pause
goto :end

:error
echo.
echo ❌ Build failed!
pause

:end

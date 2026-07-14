@echo off
setlocal
echo === Building ListsManager Docker image ===
cd /d "C:\Appdev\ListsManager"

:: Clean up stale tar files
if exist listsmanager.tar del listsmanager.tar

if not exist .env.local (
    echo ERROR: .env.local not found - copy env.local.example and fill it in first.
    pause
    exit /b 1
)

:: Build the image only - do NOT start it here.
:: Starting on Windows would attempt migrations against a missing /data volume
:: and could save a broken container state into the tar.
echo.
echo === Building image (this may take a few minutes)...
docker build --no-cache -t listsmanager:latest .
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo X Docker build failed - check output above
    pause
    exit /b 1
)
echo + Image built successfully

echo.
echo === Saving image to tar ===
docker save listsmanager:latest -o listsmanager.tar
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo X Failed to save image tar
    pause
    exit /b 1
)
echo + Image saved to %CD%\listsmanager.tar

echo.
echo === Resolving NAS IP (sovereign-main) ===
set NAS_IP=
for /f "tokens=2 delims=[]" %%a in ('ping -n 1 sovereign-main 2^>nul') do (
    if not defined NAS_IP set NAS_IP=%%a
)

if not defined NAS_IP (
    echo Could not resolve sovereign-main - check you are on the local network.
    echo.
    echo Copy these files to the NAS manually:
    echo   %CD%\listsmanager.tar  -^>  /volume1/docker/listsmanager/listsmanager.tar
    echo   %CD%\deploy-nas.sh     -^>  /volume1/docker/listsmanager/deploy-nas.sh
    echo   %CD%\.env.local        -^>  /volume1/docker/listsmanager/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/listsmanager/deploy-nas.sh
    pause
    exit /b 0
)

echo NAS IP: %NAS_IP%

echo.
echo === Copying files to NAS ===
ssh admin@%NAS_IP% "mkdir -p /volume1/docker/listsmanager"
scp listsmanager.tar deploy-nas.sh .env.local admin@%NAS_IP%:/volume1/docker/listsmanager/
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo X SCP failed - copy these files to the NAS manually:
    echo   %CD%\listsmanager.tar  -^>  /volume1/docker/listsmanager/listsmanager.tar
    echo   %CD%\deploy-nas.sh     -^>  /volume1/docker/listsmanager/deploy-nas.sh
    echo   %CD%\.env.local        -^>  /volume1/docker/listsmanager/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/listsmanager/deploy-nas.sh
    pause
    exit /b 0
)

echo + Files copied to NAS

echo.
echo ============================================
echo   Build complete - Deployment Notes
echo ============================================
echo.
echo   Now run on the NAS to deploy:
echo     sudo sh /volume1/docker/listsmanager/deploy-nas.sh
echo.
echo   - App runs on NAS port 3002 (container port 3000)
echo   - Database migrations run automatically on startup
echo     (entrypoint.sh backs up the DB first, keeps 10 backups)
echo   - Daily DB backup at 03:00, overdue digest at 07:00
echo   - Cloudflare tunnel: set up once from Settings -^> Remote
echo     access (admin only) at http://sovereign-main:3002
echo     Public URL: https://lists.liddleapps.com
echo.
echo ============================================
pause

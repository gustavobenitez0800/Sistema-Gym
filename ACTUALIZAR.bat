@echo off
setlocal
title Actualizador Sistema Gimnasio
color 0A

:: ---------------------------------------------------------------------
:: 1. VERIFICAR PERMISOS DE ADMINISTRADOR
:: ---------------------------------------------------------------------
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo.
    echo ==============================================================
    echo  SOLICITANDO PERMISOS DE ADMINISTRADOR...
    echo ==============================================================
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

cls
echo ========================================
echo    ACTUALIZADOR - SISTEMA DE GIMNASIO
echo ========================================
echo.

:: ---------------------------------------------------------------------
:: 2. CERRAR LA APLICACION SI ESTA CORRIENDO
:: ---------------------------------------------------------------------
echo Verificando si el sistema esta abierto...
taskkill /F /IM "AyD Funcional Gym.exe" >nul 2>&1
taskkill /F /IM "electron.exe" >nul 2>&1
echo.

:: ---------------------------------------------------------------------
:: 3. DESCARGAR ACTUALIZACION
:: ---------------------------------------------------------------------
echo Descargando ultima version desde GitHub...
echo.

REM Limpiar carpeta temporal anterior si existe
if exist "%TEMP%\gym-update" rd /s /q "%TEMP%\gym-update"
mkdir "%TEMP%\gym-update"

REM Descargar el ZIP
powershell -Command "$ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri 'https://github.com/gustavobenitez0800/Sistema-Gym/archive/refs/heads/main.zip' -OutFile '%TEMP%\gym-update\latest.zip' -ErrorAction Stop } catch { Write-Host 'Error de descarga: ' $_; exit 1 }"

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] No se pudo descargar la actualizacion.
    echo Verifique su conexion a internet.
    echo.
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------
:: 4. EXTRAER ARCHIVOS
:: ---------------------------------------------------------------------
echo.
echo Extrayendo archivos...
powershell -Command "Expand-Archive -Path '%TEMP%\gym-update\latest.zip' -DestinationPath '%TEMP%\gym-update' -Force"

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [ERROR] Fallo al extraer los archivos.
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------
:: 5. APLICAR ACTUALIZACION
:: ---------------------------------------------------------------------
echo.
echo Instalando actualizacion...

REM Detectar si estamos en modo instalado (junto a resources\app)
set "TARGET_DIR=%~dp0"
:: Remove trailing backslash if present to make quotes work in robocopy
if "%TARGET_DIR:~-1%"=="\" set "TARGET_DIR=%TARGET_DIR:~0,-1%"
if exist "%~dp0resources\app" (
    echo Detectado modo instalado. Actualizando resources\app...
    set "TARGET_DIR=%~dp0resources\app"
)

REM Copiar archivos usando Robocopy (mas robusto)
echo Copiando archivos...
:: /E = subdirectorios incluyendo vacios
:: /XO = excluir archivos mas antiguos (solo actualiza si es mas nuevo)
:: /XF = excluir archivos especificos
:: /XD = excluir directorios
robocopy "%TEMP%\gym-update\Sistema-Gym-main" "%TARGET_DIR%" /E /XO /XF "update-exclude.txt" "ACTUALIZAR.bat" ".env" "config.js" /XD ".git" ".vscode" "node_modules"

:: Verificamos el codigo de salida de Robocopy
:: Robocopy usa codigos de bit. Todo menor a 8 es exito
if %ERRORLEVEL% GEQ 8 (
    color 0C
    echo.
    echo [ERROR] Hubo problemas al copiar los archivos.
    echo Codigo de error Robocopy: %ERRORLEVEL%
    pause
    exit /b 1
)

:: ---------------------------------------------------------------------
:: 6. LIMPIEZA Y FINALIZACION
:: ---------------------------------------------------------------------
rd /s /q "%TEMP%\gym-update"

cls
color 0A
echo ========================================
echo   ACTUALIZACION COMPLETADA CON EXITO
echo ========================================
echo.
echo El sistema ha sido actualizado a la ultima version.
echo Ya puedes volver a abrir el programa.
echo.
pause

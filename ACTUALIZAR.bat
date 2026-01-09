@echo off
title Actualizador Sistema Gimnasio
color 0A
cls

echo ========================================
echo    ACTUALIZADOR - SISTEMA DE GIMNASIO
echo ========================================
echo.
echo Descargando ultima version...
echo.

REM Crear carpeta temporal si no existe
if not exist "%TEMP%\gym-update" mkdir "%TEMP%\gym-update"

REM Descargar la última versión desde GitHub
powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/gustavobenitez0800/Sistema-Gym/archive/refs/heads/main.zip' -OutFile '%TEMP%\gym-update\latest.zip'}"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] No se pudo descargar la actualizacion.
    echo Verifica tu conexion a internet.
    pause
    exit /b 1
)

echo.
echo Extrayendo archivos...
powershell -Command "& {Expand-Archive -Path '%TEMP%\gym-update\latest.zip' -DestinationPath '%TEMP%\gym-update' -Force}"

echo.
echo Aplicando actualizacion...

REM Copiar archivos actualizados (excepto config y datos)
xcopy /E /Y /I "%TEMP%\gym-update\Sistema-Gym-main\*" "%~dp0" /EXCLUDE:%~dp0update-exclude.txt

REM Limpiar archivos temporales
rd /s /q "%TEMP%\gym-update"

echo.
echo ========================================
echo   ACTUALIZACION COMPLETADA CON EXITO
echo ========================================
echo.
echo El sistema ha sido actualizado.
echo Puedes cerrar esta ventana.
echo.
pause

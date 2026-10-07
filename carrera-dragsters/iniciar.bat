@echo off
rem Inicia el servidor de la carrera y abre la pantalla de control en el navegador.
rem Alcanza con hacerle doble clic. Para apagar el servidor, cerra esta ventana.
cd /d "%~dp0"
title Carreras de dragsters - servidor

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y volve a abrir este archivo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Falta el archivo .env con los datos de MySQL.
  echo Copia ".env.example" como ".env" y completa la clave de MySQL.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primera vez: instalando las dependencias. Puede tardar un minuto...
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias. Revisa la conexion a internet.
    pause
    exit /b 1
  )
)

echo Iniciando el servidor. Cuando este listo se abre el navegador solo.
echo Para apagarlo, cerra esta ventana.
echo.
set ABRIR_NAVEGADOR=1
call npm start

echo.
echo El servidor se detuvo. Si dice que no se pudo usar la base de datos, revisa que MySQL este prendido y el archivo .env.
pause

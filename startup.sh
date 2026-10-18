#!/bin/bash
# ============================================================
# Script de inicio para Azure App Service (LINUX)
# ============================================================
# Azure ejecuta este script como Startup Command:  bash startup.sh
# Se entra a backend/ para instalar AHI las dependencias (el backend
# tiene su propio package.json con las versiones correctas, p.ej.
# mssql ^12) y luego se arranca el servidor.

echo "Iniciando IA Educativa Colombia..."
echo "Directorio actual: $(pwd)"
echo "Puerto asignado por Azure: ${PORT:-no definido}"

# Ir al directorio del backend
cd backend || { echo "No se encontro la carpeta backend"; exit 1; }

echo "Instalando dependencias del backend..."
if [ -f "package-lock.json" ]; then
    npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund
else
    npm install --no-audit --no-fund
fi
if [ $? -ne 0 ]; then
    echo "Fallo la instalacion de dependencias"
    exit 1
fi

# El servidor sirve el frontend estatico de web/ cuando NODE_ENV=production
export NODE_ENV=${NODE_ENV:-production}

echo "Iniciando servidor en puerto ${PORT:-8080}..."
exec node src/server.js

# Script de Instalación Rápida de Redis para Windows
# IA Educativa - Sistema de Caché

Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🚀 INSTALACIÓN RÁPIDA DE REDIS (WINDOWS)      ║" -ForegroundColor Cyan
Write-Host "║   Sistema IA Educativa Colombia                  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Verificar si ya está instalado
Write-Host "🔍 Verificando si Redis ya está instalado..." -ForegroundColor Yellow

$redisPath = "C:\Redis"
$redisInstalled = Test-Path "$redisPath\redis-server.exe"

if ($redisInstalled) {
    Write-Host "✅ Redis ya está instalado en $redisPath" -ForegroundColor Green

    # Intentar hacer ping
    Write-Host ""
    Write-Host "🧪 Probando conexión..." -ForegroundColor Yellow
    $pingResult = & "$redisPath\redis-cli.exe" ping 2>&1

    if ($pingResult -eq "PONG") {
        Write-Host "✅ Redis está corriendo correctamente" -ForegroundColor Green
        Write-Host ""
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
        Write-Host "✅ TODO LISTO - Redis funcionando" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
        Write-Host ""
        Write-Host "📝 Próximos pasos:" -ForegroundColor Cyan
        Write-Host "   1. Reinicia tu servidor backend (Ctrl+C y 'npm run dev')"
        Write-Host "   2. Verifica los logs: deberías ver '✅ Redis conectado'"
        Write-Host "   3. Ejecuta test: node backend/test-redis.js"
        Write-Host ""
        exit 0
    } else {
        Write-Host "⚠️  Redis está instalado pero no está corriendo" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "🔧 Iniciando Redis..." -ForegroundColor Yellow

        try {
            # Intentar iniciar como servicio
            & "$redisPath\redis-server.exe" --service-start 2>&1 | Out-Null
            Start-Sleep -Seconds 2

            $pingResult = & "$redisPath\redis-cli.exe" ping 2>&1
            if ($pingResult -eq "PONG") {
                Write-Host "✅ Redis iniciado exitosamente" -ForegroundColor Green
                exit 0
            }
        } catch {
            Write-Host "⚠️  No se pudo iniciar como servicio, iniciando manualmente..." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "📝 Ejecuta este comando en otra terminal:" -ForegroundColor Cyan
            Write-Host "   C:\Redis\redis-server.exe" -ForegroundColor White
            Write-Host ""
            exit 1
        }
    }
}

# Si no está instalado, ofrecer opciones
Write-Host "❌ Redis no está instalado" -ForegroundColor Red
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "📦 OPCIONES DE INSTALACIÓN" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "1️⃣  DOCKER (Recomendado - Más Fácil)" -ForegroundColor Green
Write-Host "   Requiere: Docker Desktop instalado"
Write-Host "   Comando: docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest"
Write-Host ""
Write-Host "2️⃣  MEMURAI (Redis Compatible para Windows)" -ForegroundColor Yellow
Write-Host "   Descarga: https://www.memurai.com/get-memurai"
Write-Host "   Instalador gráfico, muy fácil de usar"
Write-Host ""
Write-Host "3️⃣  REDIS MANUAL (No Oficial)" -ForegroundColor Cyan
Write-Host "   Descarga: https://github.com/tporadowski/redis/releases"
Write-Host "   Manual: Requiere instalación manual"
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "¿Qué opción prefieres? (1/2/3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🐳 Instalando Redis con Docker..." -ForegroundColor Cyan
        Write-Host ""

        # Verificar si Docker está instalado
        try {
            $dockerVersion = docker --version 2>&1
            Write-Host "✅ Docker encontrado: $dockerVersion" -ForegroundColor Green
            Write-Host ""

            # Verificar si ya existe un contenedor con ese nombre
            $existingContainer = docker ps -a --filter "name=redis-ia-educativa" --format "{{.Names}}" 2>&1

            if ($existingContainer -eq "redis-ia-educativa") {
                Write-Host "⚠️  Ya existe un contenedor llamado 'redis-ia-educativa'" -ForegroundColor Yellow
                $removeOld = Read-Host "¿Eliminar el contenedor viejo? (s/n)"

                if ($removeOld -eq "s") {
                    Write-Host "🗑️  Eliminando contenedor viejo..." -ForegroundColor Yellow
                    docker rm -f redis-ia-educativa 2>&1 | Out-Null
                    Write-Host "✅ Contenedor eliminado" -ForegroundColor Green
                } else {
                    Write-Host "❌ Instalación cancelada" -ForegroundColor Red
                    exit 1
                }
            }

            # Descargar e iniciar Redis
            Write-Host "📥 Descargando imagen de Redis..." -ForegroundColor Cyan
            docker pull redis:latest

            Write-Host ""
            Write-Host "🚀 Iniciando contenedor Redis..." -ForegroundColor Cyan
            docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest

            # Esperar un momento
            Start-Sleep -Seconds 3

            # Verificar
            Write-Host ""
            Write-Host "🧪 Verificando instalación..." -ForegroundColor Yellow
            $pingResult = docker exec redis-ia-educativa redis-cli ping 2>&1

            if ($pingResult -eq "PONG") {
                Write-Host ""
                Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
                Write-Host "✅ REDIS INSTALADO EXITOSAMENTE CON DOCKER" -ForegroundColor Green
                Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
                Write-Host ""
                Write-Host "📝 Comandos útiles:" -ForegroundColor Cyan
                Write-Host "   docker ps                              Ver contenedores"
                Write-Host "   docker stop redis-ia-educativa         Detener Redis"
                Write-Host "   docker start redis-ia-educativa        Iniciar Redis"
                Write-Host "   docker logs redis-ia-educativa         Ver logs"
                Write-Host "   docker exec -it redis-ia-educativa redis-cli   Conectar a Redis CLI"
                Write-Host ""
                Write-Host "🎉 Próximos pasos:" -ForegroundColor Green
                Write-Host "   1. Reinicia tu servidor backend"
                Write-Host "   2. Deberías ver: '✅ Redis conectado'"
                Write-Host "   3. Ejecuta test: node backend/test-redis.js"
                Write-Host ""
            } else {
                Write-Host "❌ Error al verificar Redis" -ForegroundColor Red
                Write-Host "Verifica con: docker logs redis-ia-educativa" -ForegroundColor Yellow
            }

        } catch {
            Write-Host "❌ Docker no está instalado" -ForegroundColor Red
            Write-Host ""
            Write-Host "📝 Instala Docker Desktop desde:" -ForegroundColor Yellow
            Write-Host "   https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Luego ejecuta este script de nuevo." -ForegroundColor Yellow
        }
    }

    "2" {
        Write-Host ""
        Write-Host "📦 Abriendo página de descarga de Memurai..." -ForegroundColor Cyan
        Start-Process "https://www.memurai.com/get-memurai"
        Write-Host ""
        Write-Host "📝 Sigue estos pasos:" -ForegroundColor Yellow
        Write-Host "   1. Descarga 'Memurai Developer' (gratis)"
        Write-Host "   2. Ejecuta el instalador"
        Write-Host "   3. Memurai se instalará como servicio de Windows"
        Write-Host "   4. Se iniciará automáticamente"
        Write-Host "   5. Ejecuta este script de nuevo para verificar"
        Write-Host ""
    }

    "3" {
        Write-Host ""
        Write-Host "📦 Abriendo página de descarga de Redis..." -ForegroundColor Cyan
        Start-Process "https://github.com/tporadowski/redis/releases"
        Write-Host ""
        Write-Host "📝 Sigue estos pasos:" -ForegroundColor Yellow
        Write-Host "   1. Descarga 'Redis-x64-X.X.XX.zip' (última versión)"
        Write-Host "   2. Extrae a C:\Redis"
        Write-Host "   3. Abre PowerShell como Administrador"
        Write-Host "   4. Ejecuta estos comandos:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "      cd C:\Redis" -ForegroundColor White
        Write-Host "      .\redis-server.exe --service-install redis.windows.conf" -ForegroundColor White
        Write-Host "      .\redis-server.exe --service-start" -ForegroundColor White
        Write-Host "      .\redis-cli.exe ping" -ForegroundColor White
        Write-Host ""
        Write-Host "   5. Si ves 'PONG', ¡Redis está funcionando!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📖 Guía completa: GUIA_REDIS.md" -ForegroundColor Cyan
        Write-Host ""
    }

    default {
        Write-Host ""
        Write-Host "❌ Opción no válida" -ForegroundColor Red
        Write-Host ""
        Write-Host "📖 Consulta la guía completa en: GUIA_REDIS.md" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "📞 ¿Necesitas ayuda?" -ForegroundColor Cyan
Write-Host "   Lee: GUIA_REDIS.md - Guía completa de instalación"
Write-Host "   Test: node backend/test-redis.js - Script de prueba"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

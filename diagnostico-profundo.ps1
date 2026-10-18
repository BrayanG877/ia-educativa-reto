# ====================================================
# DIAGNOSTICO PROFUNDO - DETECTAR ERROR ESPECIFICO
# ====================================================

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTICO PROFUNDO DE AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "[INFO] Segun el log de actividad:" -ForegroundColor Yellow
Write-Host "  - Variables de entorno configuradas hace 2 horas" -ForegroundColor Gray
Write-Host "  - App Service iniciado y reiniciado multiples veces" -ForegroundColor Gray
Write-Host "  - Problema: Error en el codigo del servidor`n" -ForegroundColor Gray

# Test 1: Verificar que el sitio esta activo
Write-Host "[Test 1] Verificando sitio web..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $productionURL -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "   [OK] Sitio activo (HTTP $($response.StatusCode))" -ForegroundColor Green
    Write-Host "   Content-Type: $($response.Headers.'Content-Type')" -ForegroundColor Gray
    Write-Host "   Content-Length: $($response.Content.Length) bytes" -ForegroundColor Gray
} catch {
    Write-Host "   [X] Sitio no accesible" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""

# Test 2: Probar health endpoint con mas detalle
Write-Host "[Test 2] Probando endpoint /health con detalles..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop
    Write-Host "   [OK] Backend responde!" -ForegroundColor Green
    Write-Host "   Respuesta: $($health | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorMsg = $_.Exception.Message

    Write-Host "   [X] Backend no responde" -ForegroundColor Red

    if ($statusCode) {
        Write-Host "   Codigo HTTP: $statusCode" -ForegroundColor Gray

        if ($statusCode -eq 500) {
            Write-Host "`n   [ERROR 500] Error interno del servidor" -ForegroundColor Red
            Write-Host "   Causa mas probable:" -ForegroundColor Yellow
            Write-Host "   - Error al conectarse a SQL Server" -ForegroundColor White
            Write-Host "   - Firewall SQL Server bloqueando conexion" -ForegroundColor White
            Write-Host "   - Credenciales de BD incorrectas" -ForegroundColor White
        } elseif ($statusCode -eq 503) {
            Write-Host "`n   [ERROR 503] Servicio no disponible" -ForegroundColor Red
            Write-Host "   Causa mas probable:" -ForegroundColor Yellow
            Write-Host "   - Aplicacion no se inicio correctamente" -ForegroundColor White
            Write-Host "   - Error en el codigo al arrancar" -ForegroundColor White
        }
    } else {
        Write-Host "   Error: $errorMsg" -ForegroundColor Gray

        if ($errorMsg -like "*timeout*" -or $errorMsg -like "*tiempo*") {
            Write-Host "`n   [TIMEOUT] El servidor no responde" -ForegroundColor Red
            Write-Host "   Causa mas probable:" -ForegroundColor Yellow
            Write-Host "   - El servidor Node.js no se inicio" -ForegroundColor White
            Write-Host "   - Error critico al arrancar la aplicacion" -ForegroundColor White
            Write-Host "   - Puerto incorrecto (debe ser 8080)" -ForegroundColor White
        }
    }
}

Write-Host ""

# Test 3: Intentar diferentes endpoints
Write-Host "[Test 3] Probando diferentes endpoints..." -ForegroundColor Yellow

$endpoints = @{
    "/" = "Pagina principal"
    "/health" = "Health check"
    "/api" = "Base API"
    "/login.html" = "Login page"
    "/index.html" = "App principal"
}

foreach ($endpoint in $endpoints.GetEnumerator()) {
    try {
        $testResponse = Invoke-WebRequest -Uri "$productionURL$($endpoint.Key)" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Host "   [OK] $($endpoint.Value) - HTTP $($testResponse.StatusCode)" -ForegroundColor Green
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code) {
            Write-Host "   [X] $($endpoint.Value) - HTTP $code" -ForegroundColor Red
        } else {
            Write-Host "   [X] $($endpoint.Value) - No responde" -ForegroundColor Red
        }
    }
}

Write-Host ""

# Test 4: Verificar si es un problema de archivos estaticos
Write-Host "[Test 4] Verificando servidor estatico vs Node.js..." -ForegroundColor Yellow

# Intentar obtener un archivo JS
try {
    $jsResponse = Invoke-WebRequest -Uri "$productionURL/app.js" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   [INFO] Archivos estaticos SI se sirven" -ForegroundColor Cyan
    Write-Host "   Esto significa:" -ForegroundColor Yellow
    Write-Host "   - El web server de Azure funciona" -ForegroundColor Gray
    Write-Host "   - Pero Node.js NO esta corriendo" -ForegroundColor Gray
    $staticOK = $true
} catch {
    Write-Host "   [INFO] Archivos estaticos NO se sirven" -ForegroundColor Cyan
    Write-Host "   Esto significa:" -ForegroundColor Yellow
    Write-Host "   - Problema mas general con el despliegue" -ForegroundColor Gray
    $staticOK = $false
}

Write-Host ""

# Analisis final
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTICO FINAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Basado en los tests anteriores:`n" -ForegroundColor White

if ($staticOK) {
    Write-Host "[PROBLEMA IDENTIFICADO]" -ForegroundColor Red
    Write-Host "Node.js NO esta iniciando correctamente`n" -ForegroundColor Red

    Write-Host "Causas posibles (en orden de probabilidad):`n" -ForegroundColor Yellow

    Write-Host "1. ERROR DE CONEXION A SQL SERVER (MAS PROBABLE)" -ForegroundColor White
    Write-Host "   - El firewall esta bloqueando Azure" -ForegroundColor Gray
    Write-Host "   - Solucion:" -ForegroundColor Cyan
    Write-Host "     a) Azure Portal -> miservidorbr" -ForegroundColor Gray
    Write-Host "     b) Seguridad -> Redes" -ForegroundColor Gray
    Write-Host "     c) Busca la regla 'AllowAzureServices'" -ForegroundColor Gray
    Write-Host "     d) Verifica que este:" -ForegroundColor Gray
    Write-Host "        IP inicio: 0.0.0.0" -ForegroundColor Gray
    Write-Host "        IP fin: 0.0.0.0" -ForegroundColor Gray
    Write-Host "     e) Guarda y reinicia mini-banco77`n" -ForegroundColor Gray

    Write-Host "2. PUERTO INCORRECTO" -ForegroundColor White
    Write-Host "   - La variable PORT debe ser 8080" -ForegroundColor Gray
    Write-Host "   - Solucion:" -ForegroundColor Cyan
    Write-Host "     a) mini-banco77 -> Variables de entorno" -ForegroundColor Gray
    Write-Host "     b) Verifica: PORT = 8080" -ForegroundColor Gray
    Write-Host "     c) Si es diferente, cambialo y guarda`n" -ForegroundColor Gray

    Write-Host "3. ERROR EN EL CODIGO" -ForegroundColor White
    Write-Host "   - Algun modulo falta o hay error de sintaxis" -ForegroundColor Gray
    Write-Host "   - Solucion:" -ForegroundColor Cyan
    Write-Host "     a) Ver logs: mini-banco77 -> Log stream" -ForegroundColor Gray
    Write-Host "     b) Busca lineas con 'ERROR' o 'Cannot find module'" -ForegroundColor Gray
    Write-Host "     c) Copia el error completo`n" -ForegroundColor Gray

} else {
    Write-Host "[PROBLEMA IDENTIFICADO]" -ForegroundColor Red
    Write-Host "El despliegue del codigo NO esta completo`n" -ForegroundColor Red

    Write-Host "Solucion:" -ForegroundColor Cyan
    Write-Host "1. Abre una NUEVA PowerShell (con Azure CLI)" -ForegroundColor Gray
    Write-Host "2. cd C:\Users\USER\Downloads\claurst-main\claurst-main" -ForegroundColor Gray
    Write-Host "3. az login" -ForegroundColor Gray
    Write-Host "4. .\deploy-to-azure.ps1" -ForegroundColor Gray
    Write-Host "5. Espera a que termine" -ForegroundColor Gray
    Write-Host "6. Reinicia el App Service`n" -ForegroundColor Gray
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ACCION INMEDIATA REQUERIDA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "VER LOS LOGS DEL SERVIDOR:" -ForegroundColor Yellow
Write-Host "1. Azure Portal -> mini-banco77" -ForegroundColor White
Write-Host "2. Monitoring -> Log stream" -ForegroundColor White
Write-Host "3. Copia las ultimas 20-30 lineas" -ForegroundColor White
Write-Host "4. Pegamelas para diagnostico exacto`n" -ForegroundColor White

Write-Host "Los logs te diran EXACTAMENTE cual es el error." -ForegroundColor Cyan
Write-Host ""

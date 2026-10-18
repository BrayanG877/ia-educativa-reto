# ====================================================
# DIAGNOSTICO COMPLETO DE AZURE + SOLUCION
# ====================================================

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTICO Y REPARACION AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Verificar conectividad basica
Write-Host "[1] Verificando accesibilidad del sitio..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $productionURL -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "   [OK] Sitio accesible (HTTP $($response.StatusCode))" -ForegroundColor Green
    $siteUp = $true
} catch {
    Write-Host "   [X] Sitio no accesible" -ForegroundColor Red
    $siteUp = $false
}

Write-Host ""

# Test 2: Verificar backend health
Write-Host "[2] Probando endpoint /health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 10 -ErrorAction Stop
    Write-Host "   [OK] Backend responde!" -ForegroundColor Green
    Write-Host "      Estado: $($health.status)" -ForegroundColor White
    if ($health.database) {
        Write-Host "      Base de datos: $($health.database.status)" -ForegroundColor White
    }
    $backendOK = $true
} catch {
    Write-Host "   [X] Backend no responde" -ForegroundColor Red

    # Intentar obtener mas detalles del error
    $errorMsg = $_.Exception.Message
    if ($errorMsg -like "*500*") {
        Write-Host "   Error 500 - Error interno del servidor" -ForegroundColor Gray
    } elseif ($errorMsg -like "*503*") {
        Write-Host "   Error 503 - Servicio no disponible" -ForegroundColor Gray
    } elseif ($errorMsg -like "*timeout*" -or $errorMsg -like "*tiempo*") {
        Write-Host "   Timeout - El servidor no responde a tiempo" -ForegroundColor Gray
    }

    $backendOK = $false
}

Write-Host ""

# Test 3: Verificar si las paginas estaticas funcionan
Write-Host "[3] Probando archivos estaticos..." -ForegroundColor Yellow

$testFiles = @{
    "index.html" = "/index.html"
    "login.html" = "/login.html"
    "app.js" = "/app.js"
    "api-client.js" = "/api-client.js"
}

$staticOK = $true
foreach ($file in $testFiles.GetEnumerator()) {
    try {
        $fileResponse = Invoke-WebRequest -Uri "$productionURL$($file.Value)" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Host "   [OK] $($file.Key)" -ForegroundColor Green
    } catch {
        Write-Host "   [X] $($file.Key) - No accesible" -ForegroundColor Red
        $staticOK = $false
    }
}

Write-Host ""

# Analisis
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ANALISIS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($siteUp -and -not $backendOK) {
    Write-Host "[DIAGNOSTICO] El sitio esta activo pero el backend no responde" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Esto significa que:" -ForegroundColor White
    Write-Host "  1. El codigo esta desplegado correctamente" -ForegroundColor Gray
    Write-Host "  2. Azure esta sirviendo los archivos estaticos" -ForegroundColor Gray
    Write-Host "  3. Pero el servidor Node.js tiene un problema" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Posibles causas:" -ForegroundColor Yellow
    Write-Host "  [A] Variables de entorno no configuradas o incorrectas" -ForegroundColor White
    Write-Host "  [B] Error en la conexion a SQL Server (firewall)" -ForegroundColor White
    Write-Host "  [C] Error en el codigo del servidor al iniciar" -ForegroundColor White
    Write-Host "  [D] Puerto incorrecto o conflicto" -ForegroundColor White
    Write-Host ""

} elseif (-not $siteUp) {
    Write-Host "[DIAGNOSTICO] El sitio no esta accesible" -ForegroundColor Red
    Write-Host ""
    Write-Host "El App Service puede estar:" -ForegroundColor White
    Write-Host "  1. Detenido" -ForegroundColor Gray
    Write-Host "  2. Reiniciandose" -ForegroundColor Gray
    Write-Host "  3. Con error critico" -ForegroundColor Gray

} else {
    Write-Host "[EXITO] Todo funciona correctamente!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SOLUCIONES" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not $backendOK) {
    Write-Host "Opcion 1: Ver logs en tiempo real (Azure Portal)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Ve a: https://portal.azure.com" -ForegroundColor White
    Write-Host "  2. Busca: mini-banco77" -ForegroundColor White
    Write-Host "  3. En el menu izquierdo:" -ForegroundColor White
    Write-Host "     Monitoring -> Log stream" -ForegroundColor Cyan
    Write-Host "  4. Observa los errores en tiempo real" -ForegroundColor White
    Write-Host ""

    Write-Host "Opcion 2: Ver logs con Azure CLI" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Abre una nueva PowerShell (con Azure CLI) y ejecuta:" -ForegroundColor White
    Write-Host "  az webapp log tail --name mini-banco77 --resource-group mini-banco77_group" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Opcion 3: Verificar variables de entorno" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  En Azure Portal:" -ForegroundColor White
    Write-Host "  1. mini-banco77 -> Configuracion -> Variables de entorno" -ForegroundColor White
    Write-Host "  2. Verifica que TODAS estas variables existan:" -ForegroundColor White
    Write-Host ""
    Write-Host "     - NODE_ENV = production" -ForegroundColor Gray
    Write-Host "     - PORT = 8080" -ForegroundColor Gray
    Write-Host "     - DB_HOST = miservidorbr.database.windows.net" -ForegroundColor Gray
    Write-Host "     - DB_USER = adminsoloverde" -ForegroundColor Gray
    Write-Host "     - DB_PASSWORD = TU_PASSWORD_BD_AQUI" -ForegroundColor Gray
    Write-Host "     - ANTHROPIC_API_KEY = sk-ant-api03-..." -ForegroundColor Gray
    Write-Host "     - JWT_SECRET = educativa_ia_..." -ForegroundColor Gray
    Write-Host "     - FRONTEND_URL = https://mini-banco77-..." -ForegroundColor Gray
    Write-Host "     + 12 variables mas (ver CONFIGURAR-MANUAL.md)" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Opcion 4: Verificar firewall SQL Server" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Ve a: Azure Portal -> miservidorbr (SQL Server)" -ForegroundColor White
    Write-Host "  2. Seguridad -> Redes" -ForegroundColor White
    Write-Host "  3. Verifica que este activado:" -ForegroundColor White
    Write-Host "     [X] Permitir servicios de Azure" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Opcion 5: Reiniciar App Service" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Azure Portal -> mini-banco77" -ForegroundColor White
    Write-Host "  2. Informacion general" -ForegroundColor White
    Write-Host "  3. Click en 'Reiniciar'" -ForegroundColor White
    Write-Host "  4. Esperar 2-3 minutos" -ForegroundColor White
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ACCIONES INMEDIATAS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "1. Abre Azure Portal en el navegador:" -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "https://portal.azure.com"
Write-Host "   [i] Abriendo navegador..." -ForegroundColor Gray
Write-Host ""

Write-Host "2. Una vez ahi, haz esto:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   A) Ver logs en tiempo real:" -ForegroundColor Cyan
Write-Host "      mini-banco77 -> Monitoring -> Log stream" -ForegroundColor White
Write-Host ""
Write-Host "   B) Verificar variables:" -ForegroundColor Cyan
Write-Host "      mini-banco77 -> Configuracion -> Variables de entorno" -ForegroundColor White
Write-Host "      (Deben haber 20 variables configuradas)" -ForegroundColor Gray
Write-Host ""
Write-Host "   C) Verificar firewall SQL:" -ForegroundColor Cyan
Write-Host "      miservidorbr -> Seguridad -> Redes" -ForegroundColor White
Write-Host "      (Activar: Permitir servicios de Azure)" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Mientras tanto, tu entorno LOCAL funciona:" -ForegroundColor Green
Write-Host "   http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESUMEN" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($backendOK) {
    Write-Host "[EXCELENTE] Tu aplicacion esta funcionando en produccion!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accede aqui:" -ForegroundColor White
    Write-Host "  $productionURL/login.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Login: camilamiamor@gmail.com / 2804" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "[PENDIENTE] Backend necesita configuracion" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Prioridad:" -ForegroundColor White
    Write-Host "  1. Ver logs en Azure Portal (Log stream)" -ForegroundColor Cyan
    Write-Host "  2. Identificar el error especifico" -ForegroundColor Gray
    Write-Host "  3. Aplicar solucion correspondiente" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Mientras tanto, usa tu version local:" -ForegroundColor Yellow
    Write-Host "  http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
    Write-Host ""
}

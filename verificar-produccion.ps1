# ====================================================
# SCRIPT DE VERIFICACIÓN DEL DESPLIEGUE EN AZURE
# ====================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN DE PRODUCCIÓN - AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

# Test 1: Verificar conectividad básica
Write-Host "[Test 1] Verificando conectividad..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri $productionURL -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Sitio accesible (HTTP $($response.StatusCode))" -ForegroundColor Green
    $siteAccessible = $true
} catch {
    if ($_.Exception.Response.StatusCode.Value__ -eq 503) {
        Write-Host "   [!] Sitio retorna 503 - App detenida o inicializandose" -ForegroundColor Yellow
        Write-Host "   [i] Solucion: Inicia el App Service desde Azure Portal" -ForegroundColor Cyan
    } elseif ($_.Exception.Message -like "*timeout*") {
        Write-Host "   [X] Timeout - El sitio no responde" -ForegroundColor Red
        Write-Host "   [i] Solucion: Verifica que el App Service este iniciado" -ForegroundColor Cyan
    } else {
        Write-Host "   [X] Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    $siteAccessible = $false
}

Write-Host ""

# Test 2: Health Check del Backend
Write-Host "[Test 2] Health Check del Backend..." -ForegroundColor Yellow

try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 10 -ErrorAction Stop
    Write-Host "   ✅ Backend funcionando" -ForegroundColor Green
    Write-Host "      • Servicio: $($health.service)" -ForegroundColor White
    Write-Host "      • Estado: $($health.status)" -ForegroundColor White
    Write-Host "      • Base de datos: $($health.database.status)" -ForegroundColor White
    $backendOK = $true
} catch {
    Write-Host "   [X] Backend no responde" -ForegroundColor Red
    if ($_.Exception.Message -like "*timeout*") {
        Write-Host "   [i] Posibles causas:" -ForegroundColor Cyan
        Write-Host "      1. App Service no está iniciado" -ForegroundColor White
        Write-Host "      2. Variables de entorno no configuradas" -ForegroundColor White
        Write-Host "      3. Error en el código del servidor" -ForegroundColor White
    } else {
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
    $backendOK = $false
}

Write-Host ""

# Test 3: Verificar paginas estaticas
Write-Host "[Test 3] Verificando paginas frontend..." -ForegroundColor Yellow

$pages = @{
    "Login" = "/login.html"
    "App Principal" = "/index.html"
}

foreach ($page in $pages.GetEnumerator()) {
    try {
        $response = Invoke-WebRequest -Uri "$productionURL$($page.Value)" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "   ✅ $($page.Key): Accesible" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ❌ $($page.Key): No accesible" -ForegroundColor Red
    }
}

Write-Host ""

# Test 4: Verificar local (comparacion)
Write-Host "[Test 4] Verificando servidores locales..." -ForegroundColor Yellow

$backendLocal = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
$frontendLocal = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($backendLocal) {
    Write-Host "   ✅ Backend local (3001): Corriendo" -ForegroundColor Green
} else {
    Write-Host "   [!] Backend local (3001): Detenido" -ForegroundColor Yellow
}

if ($frontendLocal) {
    Write-Host "   ✅ Frontend local (3000): Corriendo" -ForegroundColor Green
} else {
    Write-Host "   [!] Frontend local (3000): Detenido" -ForegroundColor Yellow
}

Write-Host ""

# RESUMEN Y ACCIONES
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESUMEN Y PRÓXIMOS PASOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($siteAccessible -and $backendOK) {
    Write-Host "[OK] PRODUCCION FUNCIONANDO!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tu aplicacion esta lista en:" -ForegroundColor White
    Write-Host "  [URL] $productionURL/login.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Credenciales de prueba:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804" -ForegroundColor Gray

}
elseif ($siteAccessible -and -not $backendOK) {
    Write-Host "[!] SITIO ACCESIBLE PERO BACKEND NO RESPONDE" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Acciones requeridas:" -ForegroundColor White
    Write-Host ""
    Write-Host "[1] Verificar variables de entorno en Azure:" -ForegroundColor Cyan
    Write-Host "   • Ve a: Azure Portal → mini-banco77 → Configuración → Variables de entorno" -ForegroundColor White
    Write-Host "   • Verifica que todas las 18 variables estén configuradas" -ForegroundColor White
    Write-Host "   • Ver lista completa en: VARIABLES_ENTORNO_AZURE.md" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[2] Configurar firewall de SQL Server:" -ForegroundColor Cyan
    Write-Host "   • Ve a: Azure Portal → SQL servers → miservidorbr" -ForegroundColor White
    Write-Host "   • Activa: 'Permitir servicios de Azure'" -ForegroundColor White
    Write-Host ""
    Write-Host "[3] Reiniciar App Service:" -ForegroundColor Cyan
    Write-Host "   • Azure Portal → mini-banco77 → Reiniciar" -ForegroundColor White
    Write-Host "   • O ejecuta: az webapp restart --name mini-banco77 --resource-group mini-banco77_group" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[4] Ver logs en tiempo real:" -ForegroundColor Cyan
    Write-Host "   • Azure Portal → mini-banco77 → Monitoring → Log stream" -ForegroundColor White
    Write-Host "   • O ejecuta: az webapp log tail --name mini-banco77 --resource-group mini-banco77_group" -ForegroundColor Gray

}
else {
    Write-Host "[X] SITIO NO ACCESIBLE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Acciones requeridas:" -ForegroundColor White
    Write-Host ""
    Write-Host "[1] Iniciar el App Service:" -ForegroundColor Cyan
    Write-Host "   • Ve a: Azure Portal → mini-banco77 → Información general" -ForegroundColor White
    Write-Host "   • Click en 'Iniciar'" -ForegroundColor White
    Write-Host "   • O ejecuta: az webapp start --name mini-banco77 --resource-group mini-banco77_group" -ForegroundColor Gray
    Write-Host ""
    Write-Host "[2] Verificar que el codigo fue desplegado:" -ForegroundColor Cyan
    Write-Host "   • Azure Portal → mini-banco77 → Deployment Center" -ForegroundColor White
    Write-Host "   • Revisa el último despliegue y su estado" -ForegroundColor White
    Write-Host ""
    Write-Host "[3] Si aun no has desplegado, ejecuta:" -ForegroundColor Cyan
    Write-Host "   • .\deploy-to-azure.ps1" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "[Docs] Documentacion disponible:" -ForegroundColor White
Write-Host "   • AZURE_QUICKSTART.md - Guía rápida" -ForegroundColor Gray
Write-Host "   • DESPLIEGUE_AZURE.md - Guía completa" -ForegroundColor Gray
Write-Host "   • VARIABLES_ENTORNO_AZURE.md - Variables de entorno" -ForegroundColor Gray
Write-Host ""

# Test de comparacion
if ($backendLocal) {
    Write-Host "[TIP] Tu entorno local esta funcionando." -ForegroundColor Cyan
    Write-Host "   Puedes seguir usandolo mientras configuras produccion:" -ForegroundColor White
    Write-Host "   http://127.0.0.1:3000/login.html" -ForegroundColor Gray
    Write-Host ""
}

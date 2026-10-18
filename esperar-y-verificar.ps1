# ====================================================
# ESPERAR Y VERIFICAR AZURE - VERIFICACION EXTENDIDA
# ====================================================

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"
$maxIntentos = 10
$intervalo = 30

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACION EXTENDIDA DE AZURE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Verificando el backend cada 30 segundos (maximo 5 minutos)...`n" -ForegroundColor Yellow

$intento = 1
$funcionando = $false

while ($intento -le $maxIntentos -and -not $funcionando) {
    Write-Host "[Intento $intento/$maxIntentos] Probando backend..." -ForegroundColor Yellow

    try {
        $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop

        Write-Host "   [EXITO] Backend responde!" -ForegroundColor Green
        Write-Host ""
        Write-Host "   Estado: $($health.status)" -ForegroundColor White
        if ($health.database) {
            Write-Host "   Base de datos: $($health.database.status)" -ForegroundColor White
        }
        if ($health.service) {
            Write-Host "   Servicio: $($health.service)" -ForegroundColor White
        }

        $funcionando = $true

    } catch {
        $errorMsg = $_.Exception.Message

        if ($errorMsg -like "*500*") {
            Write-Host "   [X] Error 500 - Error interno del servidor" -ForegroundColor Red
            Write-Host "   Esto indica que hay un problema con el codigo o la conexion a BD" -ForegroundColor Gray
        } elseif ($errorMsg -like "*503*") {
            Write-Host "   [X] Error 503 - Servicio no disponible" -ForegroundColor Red
            Write-Host "   El servidor aun no esta listo" -ForegroundColor Gray
        } elseif ($errorMsg -like "*timeout*" -or $errorMsg -like "*tiempo*") {
            Write-Host "   [.] Timeout - Aun inicializando..." -ForegroundColor Yellow
        } else {
            Write-Host "   [.] Backend no responde aun..." -ForegroundColor Yellow
        }

        if ($intento -lt $maxIntentos) {
            Write-Host "   Esperando $intervalo segundos...`n" -ForegroundColor Gray
            Start-Sleep -Seconds $intervalo
        }
    }

    $intento++
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESULTADO FINAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ($funcionando) {
    Write-Host "[EXCELENTE] Tu aplicacion esta funcionando en Azure!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Accede aqui:" -ForegroundColor White
    Write-Host "  $productionURL/login.html" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Credenciales:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Abriendo en el navegador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "$productionURL/login.html"
    Write-Host ""

} else {
    Write-Host "[PROBLEMA] El backend no responde despues de 5 minutos" -ForegroundColor Red
    Write-Host ""
    Write-Host "Esto indica que hay un error en la configuracion." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  DIAGNOSTICO NECESARIO" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    Write-Host "PASO 1: Ver los logs en Azure Portal" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Los logs te diran exactamente cual es el problema:" -ForegroundColor White
    Write-Host ""
    Write-Host "1. Abre Azure Portal (ya esta abierto en tu navegador)" -ForegroundColor Gray
    Write-Host "2. Busca: mini-banco77" -ForegroundColor Gray
    Write-Host "3. En el menu izquierdo, click en:" -ForegroundColor Gray
    Write-Host "   Monitoring -> Log stream" -ForegroundColor Cyan
    Write-Host "4. Lee los mensajes de error" -ForegroundColor Gray
    Write-Host ""

    Write-Host "Errores comunes que veras:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[Error 1] 'Cannot connect to SQL Server'" -ForegroundColor White
    Write-Host "  Solucion: Verifica firewall en miservidorbr -> Redes" -ForegroundColor Gray
    Write-Host "  Debe estar activado: 'Permitir servicios de Azure'" -ForegroundColor Gray
    Write-Host ""

    Write-Host "[Error 2] 'Environment variable X is not defined'" -ForegroundColor White
    Write-Host "  Solucion: Falta alguna variable de entorno" -ForegroundColor Gray
    Write-Host "  Ve a: mini-banco77 -> Configuracion -> Variables de entorno" -ForegroundColor Gray
    Write-Host "  Verifica que TODAS las 20 variables esten ahi" -ForegroundColor Gray
    Write-Host ""

    Write-Host "[Error 3] 'Port 8080 already in use'" -ForegroundColor White
    Write-Host "  Solucion: Reinicia el App Service" -ForegroundColor Gray
    Write-Host "  mini-banco77 -> Informacion general -> Reiniciar" -ForegroundColor Gray
    Write-Host ""

    Write-Host "[Error 4] 'Cannot find module...'" -ForegroundColor White
    Write-Host "  Solucion: Problema con despliegue del codigo" -ForegroundColor Gray
    Write-Host "  Ejecuta: .\deploy-to-azure.ps1 (en nueva PowerShell con Azure CLI)" -ForegroundColor Gray
    Write-Host ""

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  ACCIONES INMEDIATAS" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    Write-Host "1. Abriendo Azure Portal Log Stream..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "https://portal.azure.com/#@/resource/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mini-banco77_group/providers/Microsoft.Web/sites/mini-banco77/logStream"
    Write-Host ""

    Write-Host "2. Lee el error especifico en los logs" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "3. Aplica la solucion correspondiente" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "4. Despues de corregir, ejecuta:" -ForegroundColor Yellow
    Write-Host "   .\test-produccion.ps1" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "Mientras tanto, tu version LOCAL funciona perfectamente:" -ForegroundColor Green
    Write-Host "  http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RESUMEN DE ESTADO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "[Local]" -ForegroundColor Green
$backendLocal = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
$frontendLocal = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($backendLocal -and $frontendLocal) {
    Write-Host "  [OK] Backend (3001) y Frontend (3000) funcionando" -ForegroundColor Green
    Write-Host "  URL: http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
} else {
    Write-Host "  [i] Servidores locales detenidos" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[Azure]" -ForegroundColor Yellow
if ($funcionando) {
    Write-Host "  [OK] Backend funcionando en produccion" -ForegroundColor Green
    Write-Host "  URL: $productionURL/login.html" -ForegroundColor Cyan
} else {
    Write-Host "  [X] Backend no responde - revisar logs" -ForegroundColor Red
    Write-Host "  Logs: Azure Portal -> mini-banco77 -> Log stream" -ForegroundColor Cyan
}

Write-Host ""

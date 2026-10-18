# ====================================================
# CONFIGURACION MANUAL RAPIDA - AZURE PORTAL
# ====================================================
# Como el script automatico parece no haber funcionado,
# vamos a configurar manualmente en 5 minutos

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACION MANUAL PASO A PASO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "El diagnostico muestra que las variables de entorno" -ForegroundColor Yellow
Write-Host "no se configuraron. Vamos a hacerlo manualmente.`n" -ForegroundColor Yellow

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PASO 1: ABRIR AZURE PORTAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Abriendo Azure Portal en el navegador..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Start-Process "https://portal.azure.com"
Write-Host "[OK] Navegador abierto`n" -ForegroundColor Green

Start-Sleep -Seconds 3

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PASO 2: CONFIGURAR VARIABLES" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "En Azure Portal, haz lo siguiente:`n" -ForegroundColor White

Write-Host "1. En la barra de busqueda (arriba), escribe:" -ForegroundColor Yellow
Write-Host "   mini-banco77" -ForegroundColor Cyan
Write-Host ""

Write-Host "2. Click en tu App Service 'mini-banco77'`n" -ForegroundColor Yellow

Write-Host "3. En el menu izquierdo, busca:" -ForegroundColor Yellow
Write-Host "   Configuracion -> Variables de entorno" -ForegroundColor Cyan
Write-Host "   (o 'Configuration' -> 'Application settings')" -ForegroundColor Gray
Write-Host ""

Write-Host "4. Agrega estas 20 variables (una por una):" -ForegroundColor Yellow
Write-Host "   Click en '+ Agregar' para cada variable`n" -ForegroundColor Gray

Write-Host "========================================" -ForegroundColor Green
Write-Host "  VARIABLES A COPIAR (20 EN TOTAL)" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

$variables = @"
1.  NODE_ENV = production
2.  PORT = 8080
3.  WEBSITE_NODE_DEFAULT_VERSION = 22-lts
4.  DB_HOST = miservidorbr.database.windows.net
5.  DB_PORT = 1433
6.  DB_NAME = ia_educativa
7.  DB_USER = adminsoloverde
8.  DB_PASSWORD = TU_PASSWORD_BD_AQUI
9.  REDIS_HOST = localhost
10. REDIS_PORT = 6379
11. REDIS_PASSWORD = (dejar vacio)
12. JWT_SECRET = educativa_ia_colombia_2026_PRODUCTION_KEY_CHANGE_THIS
13. JWT_EXPIRES_IN = 24h
14. ANTHROPIC_API_KEY = sk-ant-api03-TU_CLAVE_ANTHROPIC_AQUI
15. RATE_LIMIT_WINDOW_MS = 900000
16. RATE_LIMIT_MAX_REQUESTS = 100
17. MAX_TOKENS_PER_REQUEST = 1000
18. MAX_CONVERSATION_HISTORY = 5
19. CACHE_TTL_SECONDS = 3600
20. FRONTEND_URL = https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net
"@

Write-Host $variables -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Red
Write-Host "  MUY IMPORTANTE" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "Despues de agregar las 20 variables:" -ForegroundColor Yellow
Write-Host "  1. Busca el boton 'Aplicar' o 'Save' ABAJO" -ForegroundColor White
Write-Host "  2. Click en ese boton" -ForegroundColor White
Write-Host "  3. Espera a que diga 'Successfully updated'" -ForegroundColor White
Write-Host ""

Read-Host "Presiona Enter cuando hayas agregado las 20 variables y clickeado 'Aplicar'"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PASO 3: CONFIGURAR FIREWALL SQL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Ahora configura el acceso a la base de datos:`n" -ForegroundColor White

Write-Host "1. En Azure Portal, busca:" -ForegroundColor Yellow
Write-Host "   miservidorbr" -ForegroundColor Cyan
Write-Host ""

Write-Host "2. Click en tu SQL Server 'miservidorbr'`n" -ForegroundColor Yellow

Write-Host "3. En el menu izquierdo:" -ForegroundColor Yellow
Write-Host "   Seguridad -> Redes (o 'Networking')" -ForegroundColor Cyan
Write-Host ""

Write-Host "4. En 'Excepciones', activa la casilla:" -ForegroundColor Yellow
Write-Host "   [X] Permitir que los servicios y recursos de Azure accedan" -ForegroundColor Cyan
Write-Host ""

Write-Host "5. Click en 'Guardar' (Save)`n" -ForegroundColor Yellow

Read-Host "Presiona Enter cuando hayas guardado la configuracion del firewall"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PASO 4: REINICIAR APP SERVICE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Finalmente, reinicia el servicio:`n" -ForegroundColor White

Write-Host "1. Vuelve a 'mini-banco77' en Azure Portal`n" -ForegroundColor Yellow

Write-Host "2. En 'Informacion general' (Overview):" -ForegroundColor Yellow
Write-Host "   Click en 'Reiniciar' (Restart)" -ForegroundColor Cyan
Write-Host ""

Write-Host "3. Confirma el reinicio`n" -ForegroundColor Yellow

Read-Host "Presiona Enter cuando hayas reiniciado el App Service"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ESPERANDO INICIALIZACION..." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Esperando 2 minutos para que Azure aplique todo..." -ForegroundColor Yellow
Write-Host ""

for ($i = 120; $i -gt 0; $i--) {
    Write-Progress -Activity "Esperando inicializacion de Azure" -Status "$i segundos restantes" -PercentComplete ((120-$i)/120*100)
    Start-Sleep -Seconds 1
}

Write-Host "`n[OK] Tiempo de espera completado`n" -ForegroundColor Green

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VERIFICANDO RESULTADO..." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$productionURL = "https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net"

try {
    $health = Invoke-RestMethod -Uri "$productionURL/health" -TimeoutSec 15 -ErrorAction Stop
    Write-Host "[EXITO] Backend funcionando correctamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Estado: $($health.status)" -ForegroundColor White
    if ($health.database) {
        Write-Host "Base de datos: $($health.database.status)" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  TU APP ESTA FUNCIONANDO!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green

    Write-Host "Accede aqui:" -ForegroundColor White
    Write-Host "  $productionURL/login.html`n" -ForegroundColor Cyan

    Write-Host "Credenciales:" -ForegroundColor White
    Write-Host "  Email: camilamiamor@gmail.com" -ForegroundColor Gray
    Write-Host "  Password: 2804`n" -ForegroundColor Gray

    Write-Host "Abriendo en el navegador..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process "$productionURL/login.html"

} catch {
    Write-Host "[ADVERTENCIA] Backend aun no responde" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Esto puede ser normal. Opciones:" -ForegroundColor White
    Write-Host ""
    Write-Host "1. Espera 2-3 minutos mas y ejecuta:" -ForegroundColor Yellow
    Write-Host "   .\test-produccion.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Ve a Azure Portal y revisa los logs:" -ForegroundColor Yellow
    Write-Host "   mini-banco77 -> Monitoring -> Log stream" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Verifica que clickeaste 'Aplicar' despues de agregar variables" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Mientras tanto, usa tu version local:" -ForegroundColor Green
    Write-Host "  http://127.0.0.1:3000/login.html" -ForegroundColor Cyan
}

Write-Host ""

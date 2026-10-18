# ====================================================
# VERIFICAR ARCHIVOS EN KUDU Y REINICIAR
# ====================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACION Y REINICIO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$appName = "mini-banco77"
$resourceGroup = "mini-banco77_group"

# 1. Verificar que los archivos están en Kudu
Write-Host "[1] Verificando archivos en Azure..." -ForegroundColor Yellow

try {
    # Obtener lista de archivos via Kudu API
    $kuduUrl = "https://$appName.scm.azurewebsites.net/api/vfs/site/wwwroot/"

    Write-Host "    Obteniendo credenciales..." -ForegroundColor Gray
    $publishProfile = az webapp deployment list-publishing-profiles --name $appName --resource-group $resourceGroup --xml 2>$null

    if ($publishProfile) {
        [xml]$xml = $publishProfile
        $profile = $xml.publishData.publishProfile | Where-Object { $_.publishMethod -eq "MSDeploy" } | Select-Object -First 1
        $username = $profile.userName
        $password = $profile.userPWD

        $base64Auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${username}:${password}"))
        $headers = @{ "Authorization" = "Basic $base64Auth" }

        Write-Host "    Consultando archivos..." -ForegroundColor Gray
        $files = Invoke-RestMethod -Uri $kuduUrl -Headers $headers -Method Get -UseBasicParsing

        Write-Host "`n    [i] Archivos en /home/site/wwwroot:" -ForegroundColor Cyan
        foreach ($file in $files) {
            if ($file.mime -eq "inode/directory") {
                Write-Host "       📁 $($file.name)/" -ForegroundColor Yellow
            } else {
                Write-Host "       📄 $($file.name)" -ForegroundColor White
            }
        }

        # Verificar que existan las carpetas clave
        $hasBackend = $files | Where-Object { $_.name -eq "backend" }
        $hasWeb = $files | Where-Object { $_.name -eq "web" }
        $hasPackageJson = $files | Where-Object { $_.name -eq "package.json" }

        Write-Host ""
        if ($hasBackend) {
            Write-Host "    [OK] Carpeta 'backend' encontrada" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta carpeta 'backend'" -ForegroundColor Red
        }

        if ($hasWeb) {
            Write-Host "    [OK] Carpeta 'web' encontrada" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta carpeta 'web'" -ForegroundColor Red
        }

        if ($hasPackageJson) {
            Write-Host "    [OK] Archivo 'package.json' encontrado" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta archivo 'package.json'" -ForegroundColor Red
        }

        if (-not $hasBackend -or -not $hasWeb -or -not $hasPackageJson) {
            Write-Host "`n    [!] Faltan archivos clave. El despliegue no está completo." -ForegroundColor Red
            Write-Host "    [i] Asegúrate de arrastrar TODAS las carpetas y archivos." -ForegroundColor Yellow
            exit 1
        }

    } else {
        Write-Host "    [!] No se pudieron obtener credenciales" -ForegroundColor Yellow
    }

} catch {
    Write-Host "    [!] No se pudo verificar via API: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# 2. Reiniciar App Service
Write-Host "[2] Reiniciando App Service..." -ForegroundColor Yellow
Write-Host "    Esto forzará a Azure a detectar los nuevos archivos" -ForegroundColor Gray

try {
    az webapp restart --name $appName --resource-group $resourceGroup 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "    [OK] App Service reiniciado" -ForegroundColor Green
    } else {
        Write-Host "    [!] Error al reiniciar" -ForegroundColor Yellow
    }
} catch {
    Write-Host "    [!] Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Esperar y verificar
Write-Host "[3] Esperando a que el servicio inicie..." -ForegroundColor Yellow
Write-Host "    (60 segundos)" -ForegroundColor Gray

for ($i = 1; $i -le 60; $i++) {
    Write-Progress -Activity "Esperando inicio del servicio" -Status "$i de 60 segundos" -PercentComplete (($i/60)*100)
    Start-Sleep -Seconds 1
}
Write-Progress -Completed -Activity "Esperando inicio del servicio"

Write-Host ""

# 4. Verificar endpoints
Write-Host "[4] Verificando endpoints..." -ForegroundColor Yellow

$baseUrl = "https://$appName.azurewebsites.net"
$endpoints = @(
    @{ Name = "Health"; Url = "$baseUrl/health" },
    @{ Name = "API Root"; Url = "$baseUrl/api" },
    @{ Name = "Login Page"; Url = "$baseUrl/login.html" }
)

$allWorking = $true

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $endpoint.Url -UseBasicParsing -TimeoutSec 10
        Write-Host "    [OK] $($endpoint.Name): HTTP $($response.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "    [X] $($endpoint.Name): Error" -ForegroundColor Red
        $allWorking = $false
    }
}

Write-Host ""

if ($allWorking) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ¡TODO FUNCIONANDO!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`n  Abre tu app en:" -ForegroundColor White
    Write-Host "  $baseUrl/login.html`n" -ForegroundColor Cyan

    # Abrir en navegador
    $openBrowser = Read-Host "¿Abrir en el navegador? (S/N)"
    if ($openBrowser -eq "S" -or $openBrowser -eq "s") {
        Start-Process "$baseUrl/login.html"
    }
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  DIAGNOSTICO NECESARIO" -ForegroundColor Yellow
    Write-Host "========================================`n" -ForegroundColor Yellow

    Write-Host "Los endpoints no responden. Posibles causas:" -ForegroundColor White
    Write-Host "  1. Variables de entorno no configuradas" -ForegroundColor Gray
    Write-Host "  2. Firewall SQL Server bloqueando conexion" -ForegroundColor Gray
    Write-Host "  3. Error en el código Node.js`n" -ForegroundColor Gray

    Write-Host "Para ver logs en Azure Portal:" -ForegroundColor Yellow
    Write-Host "  1. Ve a: https://portal.azure.com" -ForegroundColor White
    Write-Host "  2. Busca: mini-banco77" -ForegroundColor White
    Write-Host "  3. Ve a: Monitoring → Log stream" -ForegroundColor White
    Write-Host "  4. O: Diagnose and solve problems → Application Logs`n" -ForegroundColor White

    $openPortal = Read-Host "¿Abrir Azure Portal para ver logs? (S/N)"
    if ($openPortal -eq "S" -or $openPortal -eq "s") {
        Start-Process "https://portal.azure.com/#view/WebsitesExtension/SiteMenuBlade/~/logStream/resourceId/%2Fsubscriptions%2F$(az account show --query id -o tsv)%2FresourceGroups%2F$resourceGroup%2Fproviders%2FMicrosoft.Web%2Fsites%2F$appName"
    }
}

Write-Host ""

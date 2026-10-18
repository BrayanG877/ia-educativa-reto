# VERIFICAR Y REINICIAR APP SERVICE

Write-Host "`n========================================"  -ForegroundColor Cyan
Write-Host "  VERIFICACION Y REINICIO" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$appName = "mini-banco77"
$resourceGroup = "mini-banco77_group"

# 1. Verificar archivos en Kudu
Write-Host "[1] Verificando archivos en Azure..." -ForegroundColor Yellow

try {
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

        Write-Host "`n    Archivos en /home/site/wwwroot:" -ForegroundColor Cyan
        foreach ($file in $files) {
            if ($file.mime -eq "inode/directory") {
                Write-Host "       [DIR] $($file.name)" -ForegroundColor Yellow
            } else {
                Write-Host "       [FILE] $($file.name)" -ForegroundColor White
            }
        }

        # Verificar carpetas clave
        $hasBackend = $files | Where-Object { $_.name -eq "backend" }
        $hasWeb = $files | Where-Object { $_.name -eq "web" }
        $hasPackageJson = $files | Where-Object { $_.name -eq "package.json" }

        Write-Host ""
        if ($hasBackend) {
            Write-Host "    [OK] Carpeta backend encontrada" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta carpeta backend" -ForegroundColor Red
        }

        if ($hasWeb) {
            Write-Host "    [OK] Carpeta web encontrada" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta carpeta web" -ForegroundColor Red
        }

        if ($hasPackageJson) {
            Write-Host "    [OK] Archivo package.json encontrado" -ForegroundColor Green
        } else {
            Write-Host "    [X] Falta archivo package.json" -ForegroundColor Red
        }

        if (-not $hasBackend -or -not $hasWeb -or -not $hasPackageJson) {
            Write-Host "`n    [!] Faltan archivos clave" -ForegroundColor Red
            exit 1
        }

    } else {
        Write-Host "    [!] No se pudieron obtener credenciales" -ForegroundColor Yellow
    }

} catch {
    Write-Host "    [!] Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# 2. Reiniciar App Service
Write-Host "[2] Reiniciando App Service..." -ForegroundColor Yellow

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

# 3. Esperar
Write-Host "[3] Esperando inicio del servicio (60 seg)..." -ForegroundColor Yellow

for ($i = 1; $i -le 60; $i++) {
    Write-Progress -Activity "Esperando" -Status "$i/60" -PercentComplete (($i/60)*100)
    Start-Sleep -Seconds 1
}
Write-Progress -Completed -Activity "Esperando"

Write-Host ""

# 4. Verificar endpoints
Write-Host "[4] Verificando endpoints..." -ForegroundColor Yellow

$baseUrl = "https://$appName.azurewebsites.net"
$allWorking = $true

try {
    $health = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "    [OK] Health: HTTP $($health.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "    [X] Health: Error" -ForegroundColor Red
    $allWorking = $false
}

try {
    $login = Invoke-WebRequest -Uri "$baseUrl/login.html" -UseBasicParsing -TimeoutSec 10
    Write-Host "    [OK] Login: HTTP $($login.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "    [X] Login: Error" -ForegroundColor Red
    $allWorking = $false
}

Write-Host ""

if ($allWorking) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  TODO FUNCIONANDO" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`n  Abre: $baseUrl/login.html`n" -ForegroundColor Cyan

    $openBrowser = Read-Host "Abrir navegador? (S/N)"
    if ($openBrowser -eq "S" -or $openBrowser -eq "s") {
        Start-Process "$baseUrl/login.html"
    }
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  DIAGNOSTICO NECESARIO" -ForegroundColor Yellow
    Write-Host "========================================`n" -ForegroundColor Yellow

    Write-Host "Posibles causas:" -ForegroundColor White
    Write-Host "  1. Variables de entorno no configuradas" -ForegroundColor Gray
    Write-Host "  2. Firewall SQL bloqueando" -ForegroundColor Gray
    Write-Host "  3. Error en el codigo`n" -ForegroundColor Gray

    $openPortal = Read-Host "Abrir Azure Portal para ver logs? (S/N)"
    if ($openPortal -eq "S" -or $openPortal -eq "s") {
        Start-Process "https://portal.azure.com"
    }
}

Write-Host ""

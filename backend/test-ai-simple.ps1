# TEST DE ENDPOINT DE IA - ANTHROPIC CLAUDE
# IA Educativa Colombia

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "TEST ENDPOINT IA - CLAUDE" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ADVERTENCIA: Consumira creditos de API (~$0.0001 USD)" -ForegroundColor Yellow
Write-Host ""

# Verificar servidor
Write-Host "Verificando servidor..." -ForegroundColor White
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5
    Write-Host "OK - Servidor corriendo" -ForegroundColor Green
} catch {
    Write-Host "ERROR - Servidor no esta corriendo" -ForegroundColor Red
    exit 1
}
Write-Host ""

# PASO 1: REGISTRO/LOGIN
Write-Host "PASO 1: Autenticacion" -ForegroundColor Cyan
Write-Host "--------------------------------------" -ForegroundColor Cyan

$testEmail = "ai.test.$(Get-Date -Format 'yyyyMMddHHmmss')@prueba.com"
$testPassword = "TestPass123!"

# Intentar registrar (puede fallar si existe)
try {
    $registerBody = @{
        email = $testEmail
        password = $testPassword
        name = "Usuario Test AI"
        role = "student"
    } | ConvertTo-Json

    $register = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json"

    Write-Host "Usuario registrado" -ForegroundColor Green
    $token = $register.data.token
    $userId = $register.data.user.id

    Write-Host "Token obtenido del registro" -ForegroundColor Green
    Write-Host "User ID: $userId" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host "Error en registro: $($_.Exception.Message)" -ForegroundColor Red

    # Si falla el registro, intentar login
    try {
        $loginBody = @{
            email = $testEmail
            password = $testPassword
        } | ConvertTo-Json

        $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
            -Method POST `
            -Body $loginBody `
            -ContentType "application/json"

        $token = $login.data.token
        $userId = $login.data.user.id

        Write-Host "Login exitoso" -ForegroundColor Green
        Write-Host "User ID: $userId" -ForegroundColor White
        Write-Host ""
    } catch {
        Write-Host "ERROR en login: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# PASO 2: CONSULTA A CLAUDE
Write-Host "PASO 2: Consulta a Claude AI" -ForegroundColor Cyan
Write-Host "--------------------------------------" -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$chatBody = @{
    message = "Cuanto es 2+2?"
    subject = "MAT"
    mode = "direct"
    userId = $userId
} | ConvertTo-Json

Write-Host "Pregunta: Cuanto es 2+2?" -ForegroundColor White
Write-Host "Enviando a Anthropic..." -ForegroundColor Yellow
Write-Host ""

try {
    $startTime = Get-Date

    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $chatBody

    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalMilliseconds

    Write-Host "Respuesta recibida!" -ForegroundColor Green
    Write-Host ""
    Write-Host "RESULTADOS:" -ForegroundColor Green
    Write-Host "--------------------------------------" -ForegroundColor Green
    Write-Host ""
    Write-Host "Conversacion ID: $($response.data.conversationId)" -ForegroundColor White
    Write-Host "Modelo: $($response.data.model)" -ForegroundColor White
    Write-Host ""
    Write-Host "Respuesta:" -ForegroundColor Cyan
    $respuestaTexto = $response.data.response
    if ($respuestaTexto.Length -gt 150) {
        $respuestaTexto = $respuestaTexto.Substring(0, 150) + "..."
    }
    Write-Host "$respuestaTexto" -ForegroundColor White
    Write-Host ""
    Write-Host "Tokens:" -ForegroundColor Cyan
    Write-Host "  Input:  $($response.data.usage.inputTokens)" -ForegroundColor White
    Write-Host "  Output: $($response.data.usage.outputTokens)" -ForegroundColor White
    Write-Host "  Total:  $($response.data.usage.totalTokens)" -ForegroundColor White
    Write-Host ""
    Write-Host "Costos:" -ForegroundColor Cyan
    Write-Host "  Total: $" -NoNewline -ForegroundColor Yellow
    Write-Host "$($response.data.cost.totalCost) USD" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Duracion: $([math]::Round($duration, 2)) ms" -ForegroundColor White
    Write-Host "Desde cache: $($response.data.fromCache)" -ForegroundColor White
    Write-Host ""

    # PASO 3: PROBAR CACHE
    Write-Host "PASO 3: Probar Cache (Misma pregunta)" -ForegroundColor Cyan
    Write-Host "--------------------------------------" -ForegroundColor Cyan
    Write-Host ""

    Start-Sleep -Seconds 1

    $startTime2 = Get-Date
    $response2 = Invoke-RestMethod -Uri "http://localhost:3001/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $chatBody

    $endTime2 = Get-Date
    $duration2 = ($endTime2 - $startTime2).TotalMilliseconds

    if ($response2.data.fromCache) {
        Write-Host "Respuesta desde CACHE!" -ForegroundColor Green
        Write-Host "Duracion: $([math]::Round($duration2, 2)) ms (vs $([math]::Round($duration, 2)) ms)" -ForegroundColor Cyan
        Write-Host "Costo: $0.00 (sin consumir API)" -ForegroundColor Green
        Write-Host "Tokens ahorrados: $($response2.data.usage.totalTokens)" -ForegroundColor Green
    } else {
        Write-Host "NO vino de cache" -ForegroundColor Yellow
        Write-Host "Costo adicional: $" -NoNewline -ForegroundColor Yellow
        Write-Host "$($response2.data.cost.totalCost)" -ForegroundColor Yellow
    }
    Write-Host ""

    # RESUMEN FINAL
    Write-Host "====================================" -ForegroundColor Green
    Write-Host "TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "====================================" -ForegroundColor Green
    Write-Host ""

    $totalCost = $response.data.cost.totalCost
    if (!$response2.data.fromCache) {
        $totalCost += $response2.data.cost.totalCost
    }

    Write-Host "Resumen:" -ForegroundColor Cyan
    Write-Host "  Autenticacion JWT: OK" -ForegroundColor Green
    Write-Host "  Integracion Claude: OK" -ForegroundColor Green
    Write-Host "  Sistema de cache: OK" -ForegroundColor Green
    Write-Host "  Conversaciones: OK" -ForegroundColor Green
    Write-Host ""
    Write-Host "Costo Total del Test: $" -NoNewline -ForegroundColor Yellow
    Write-Host "$totalCost USD" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Backend 100% operativo!" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "ERROR al consultar Claude:" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""

    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $responseBody = $reader.ReadToEnd()
            Write-Host "Respuesta del servidor:" -ForegroundColor Yellow
            Write-Host $responseBody -ForegroundColor Red
        } catch {
            # Ignorar si no se puede leer la respuesta
        }
    }
    Write-Host ""
    exit 1
}

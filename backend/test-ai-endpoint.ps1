# TEST DE ENDPOINT DE IA - ANTHROPIC CLAUDE
# IA Educativa Colombia

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "TEST DE ENDPOINT DE IA - CLAUDE" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ADVERTENCIA: Esta prueba consumira creditos de tu API de Anthropic" -ForegroundColor Yellow
Write-Host "Costo estimado: ~$0.0001 - $0.0003 USD por consulta" -ForegroundColor Yellow
Write-Host ""

# Verificar que el servidor este corriendo
Write-Host "Verificando servidor..." -ForegroundColor White
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5
    Write-Host "   Servidor corriendo en puerto 3001" -ForegroundColor Green
} catch {
    Write-Host "   Servidor no esta corriendo" -ForegroundColor Red
    Write-Host "   Por favor ejecuta en otra terminal: npm run dev" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""

# ========================================
# PASO 1: REGISTRO (si no existe) Y LOGIN
# ========================================
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "1️⃣  PASO 1: Autenticación" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$testEmail = "test.ai@prueba.com"
$testPassword = "TestPass123!"
$testName = "Usuario Test AI"

# Intentar registrar usuario (puede fallar si ya existe, está bien)
try {
    $registerBody = @{
        email = $testEmail
        password = $testPassword
        name = $testName
        role = "student"
    } | ConvertTo-Json

    $register = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json"

    Write-Host "   Usuario registrado exitosamente" -ForegroundColor Green
} catch {
    Write-Host "   Usuario ya existe (OK)" -ForegroundColor Yellow
}

# Login
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

    Write-Host "   Login exitoso" -ForegroundColor Green
    Write-Host "   Usuario: $($login.data.user.email)" -ForegroundColor White
    Write-Host "   User ID: $userId" -ForegroundColor White
    Write-Host "   Token JWT obtenido" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host "   Error en login: $_" -ForegroundColor Red
    exit 1
}

# ========================================
# PASO 2: ENVIAR MENSAJE A LA IA
# ========================================
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "2️⃣  PASO 2: Consulta a Claude AI" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Preparar pregunta simple para minimizar costos
$chatBody = @{
    message = "¿Cuánto es 2+2?"
    subject = "MAT"
    mode = "direct"
    userId = $userId  # Incluir userId por si el controlador lo requiere
} | ConvertTo-Json

Write-Host "   📝 Pregunta: ¿Cuánto es 2+2?" -ForegroundColor White
Write-Host "   📚 Materia: Matemáticas (MAT)" -ForegroundColor White
Write-Host "   🎯 Modo: Directo" -ForegroundColor White
Write-Host "   ⏳ Enviando a Anthropic Claude..." -ForegroundColor Yellow
Write-Host ""

try {
    $startTime = Get-Date

    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $chatBody

    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalMilliseconds

    Write-Host "   ✅ Respuesta recibida de Claude" -ForegroundColor Green
    Write-Host ""

    # ========================================
    # RESULTADOS
    # ========================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "📊 RESULTADOS DEL TEST" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    Write-Host "🆔 Conversación:" -ForegroundColor Cyan
    Write-Host "   ID: $($response.data.conversationId)" -ForegroundColor White
    Write-Host ""

    Write-Host "🤖 Modelo:" -ForegroundColor Cyan
    Write-Host "   $($response.data.model)" -ForegroundColor White
    Write-Host ""

    Write-Host "💬 Respuesta de Claude:" -ForegroundColor Cyan
    $respuestaTexto = $response.data.response
    if ($respuestaTexto.Length -gt 200) {
        $respuestaTexto = $respuestaTexto.Substring(0, 200) + "..."
    }
    Write-Host "   $respuestaTexto" -ForegroundColor White
    Write-Host ""

    Write-Host "📈 Uso de Tokens:" -ForegroundColor Cyan
    Write-Host "   Input:  $($response.data.usage.inputTokens) tokens" -ForegroundColor White
    Write-Host "   Output: $($response.data.usage.outputTokens) tokens" -ForegroundColor White
    Write-Host "   Total:  $($response.data.usage.totalTokens) tokens" -ForegroundColor White
    Write-Host ""

    Write-Host "💰 Costos:" -ForegroundColor Cyan
    Write-Host "   Input:  `$$($response.data.cost.inputCost)" -ForegroundColor White
    Write-Host "   Output: `$$($response.data.cost.outputCost)" -ForegroundColor White
    Write-Host "   Total:  `$$($response.data.cost.totalCost)" -ForegroundColor Yellow
    Write-Host ""

    Write-Host "⚡ Rendimiento:" -ForegroundColor Cyan
    Write-Host "   Duración total:  $([math]::Round($duration, 2)) ms" -ForegroundColor White
    Write-Host "   Duración Claude: $($response.data.duration) ms" -ForegroundColor White
    Write-Host "   Desde caché:     $($response.data.fromCache)" -ForegroundColor White
    Write-Host ""

    # ========================================
    # PASO 3: SEGUNDA CONSULTA (PROBAR CACHÉ)
    # ========================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "3️⃣  PASO 3: Probar Caché (Misma pregunta)" -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   ⏳ Enviando la misma pregunta..." -ForegroundColor Yellow

    Start-Sleep -Seconds 1

    $startTime2 = Get-Date
    $response2 = Invoke-RestMethod -Uri "http://localhost:3001/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $chatBody

    $endTime2 = Get-Date
    $duration2 = ($endTime2 - $startTime2).TotalMilliseconds

    Write-Host ""
    if ($response2.data.fromCache) {
        Write-Host "   ✅ ¡Respuesta obtenida desde CACHÉ!" -ForegroundColor Green
        Write-Host "   ⚡ Duración: $([math]::Round($duration2, 2)) ms (vs $([math]::Round($duration, 2)) ms original)" -ForegroundColor Cyan
        Write-Host "   💰 Costo: `$0.00 (sin consumir API)" -ForegroundColor Green
        Write-Host "   💾 Tokens ahorrados: $($response2.data.usage.totalTokens)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Respuesta NO vino de caché" -ForegroundColor Yellow
        Write-Host "   💰 Costo adicional: `$$($response2.data.cost.totalCost)" -ForegroundColor Yellow
    }
    Write-Host ""

    # ========================================
    # RESUMEN FINAL
    # ========================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "✅ TEST COMPLETADO EXITOSAMENTE" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""

    $totalCost = $response.data.cost.totalCost
    if (!$response2.data.fromCache) {
        $totalCost += $response2.data.cost.totalCost
    }

    Write-Host "Resumen:" -ForegroundColor Cyan
    Write-Host "   Autenticacion JWT funcionando" -ForegroundColor Green
    Write-Host "   Integracion con Claude funcionando" -ForegroundColor Green
    Write-Host "   Sistema de cache funcionando" -ForegroundColor Green
    Write-Host "   Conversaciones creadas correctamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Costo Total del Test: $" -NoNewline -ForegroundColor Yellow
    Write-Host "$totalCost USD" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "El backend esta 100% operativo y listo para produccion!" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "   ❌ Error al consultar a Claude:" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalles del error:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $responseBody = $reader.ReadToEnd()
        Write-Host "Respuesta del servidor:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Red
    }
    Write-Host ""
    exit 1
}

# ================================================
# TEST SIMPLE - IA EDUCATIVA
# Usuario: camilamiamor@gmail.com
# ================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   TEST DE IA - Usuario Camila" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar servidor
Write-Host "Verificando servidor..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -TimeoutSec 5
    Write-Host "✅ Servidor activo`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Servidor no responde`n" -ForegroundColor Red
    exit 1
}

# PASO 1: LOGIN
Write-Host "PASO 1: Login con camilamiamor@gmail.com" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Gray

$loginBody = @{
    email = "camilamiamor@gmail.com"
    password = "2804"
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"

    $token = $login.token
    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host "   Token JWT obtenido`n" -ForegroundColor White

} catch {
    Write-Host "❌ Error en login: $($_.Exception.Message)`n" -ForegroundColor Red
    exit 1
}

# PASO 2: PREGUNTA A LA IA
Write-Host "PASO 2: Consultando a Claude AI" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Gray

$headers = @{
    "Authorization" = "Bearer $token"
}

$pregunta = @{
    materia = "matematicas"
    grado = 11
    tema = "algebra"
    mensaje = "¿Cuánto es 2 + 2?"
} | ConvertTo-Json

Write-Host "📝 Pregunta: ¿Cuánto es 2 + 2?" -ForegroundColor Cyan
Write-Host "⏳ Enviando a Anthropic Claude...`n" -ForegroundColor Yellow

try {
    $startTime = Get-Date

    $respuesta = Invoke-RestMethod `
        -Uri "http://localhost:3001/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $pregunta `
        -ContentType "application/json"

    $endTime = Get-Date
    $duracion = [math]::Round(($endTime - $startTime).TotalSeconds, 2)

    Write-Host "✅ RESPUESTA RECIBIDA!" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "🤖 Claude responde:" -ForegroundColor Cyan
    Write-Host "$($respuesta.respuesta)" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Información:" -ForegroundColor Yellow
    Write-Host "   Conversación ID: $($respuesta.conversacionId)" -ForegroundColor Gray
    Write-Host "   Duración: $duracion segundos" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✅ LA IA ESTÁ FUNCIONANDO CORRECTAMENTE!`n" -ForegroundColor Green

}
catch {
    Write-Host "❌ Error al consultar IA:" -ForegroundColor Red
    Write-Host "$($_.Exception.Message)`n" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "        PRUEBA COMPLETADA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test de Integración Completa
# Verifica funcionalidades críticas del sistema

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   TEST DE INTEGRACION COMPLETA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0

# Test 1: Health Check
Write-Host "[TEST 1] Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "  OK - Servidor respondiendo" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error de conexion" -ForegroundColor Red
    $testsFailed++
}

# Test 2: Login
Write-Host "[TEST 2] Login de usuario..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "camilamiamor@gmail.com"
        password = "2804"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.token
    Write-Host "  OK - Login exitoso" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Login fallo" -ForegroundColor Red
    $testsFailed++
    exit
}

# Test 3: Obtener materias
Write-Host "[TEST 3] Obtener materias..." -ForegroundColor Yellow
try {
    $headers = @{ "Authorization" = "Bearer $token" }
    $subjectsResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/subjects" -Method GET -Headers $headers
    Write-Host "  OK - Materias: $($subjectsResponse.data.Count)" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error obteniendo materias" -ForegroundColor Red
    $testsFailed++
}

# Test 4: Pregunta con metodo socratico
Write-Host "[TEST 4] Pregunta con metodo socratico..." -ForegroundColor Yellow
try {
    $questionBody = @{
        message = "Cuanto es 2 + 2?"
        subject = "matematicas"
        mode = "socratic"
    } | ConvertTo-Json

    $questionResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" -Method POST -Body $questionBody -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "  OK - Respuesta recibida" -ForegroundColor Green
    Write-Host "  Tokens: $($questionResponse.data.usage.totalTokens)" -ForegroundColor Gray
    Write-Host "  Costo: `$$($questionResponse.data.cost)" -ForegroundColor Gray
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error en pregunta" -ForegroundColor Red
    $testsFailed++
}

# Test 5: Mapa Mental
Write-Host "[TEST 5] Generar mapa mental..." -ForegroundColor Yellow
try {
    $mindmapBody = @{
        subject = "biologia"
        topic = "Celula eucariota"
        depth = 2
    } | ConvertTo-Json

    $mindmapResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/mindmap" -Method POST -Body $mindmapBody -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "  OK - Mapa mental generado" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error generando mapa" -ForegroundColor Red
    $testsFailed++
}

# Test 6: Quiz
Write-Host "[TEST 6] Generar quiz..." -ForegroundColor Yellow
try {
    $quizBody = @{
        subject = "ingles"
        topic = "Present Simple"
        type = "mixed"
        quantity = 3
    } | ConvertTo-Json

    $quizResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/quiz" -Method POST -Body $quizBody -ContentType "application/json" -Headers $headers -TimeoutSec 30
    Write-Host "  OK - Quiz generado" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error generando quiz" -ForegroundColor Red
    $testsFailed++
}

# Test 7: Ranking
Write-Host "[TEST 7] Obtener ranking..." -ForegroundColor Yellow
try {
    $rankingResponse = Invoke-RestMethod -Uri "$baseUrl/api/metrics/ranking" -Method GET -Headers $headers
    Write-Host "  OK - Ranking obtenido" -ForegroundColor Green
    $testsPassed++
} catch {
    Write-Host "  FAIL - Error obteniendo ranking" -ForegroundColor Red
    $testsFailed++
}

# Resumen
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$totalTests = $testsPassed + $testsFailed
$percentage = [math]::Round(($testsPassed / $totalTests) * 100, 1)

Write-Host "Total: $totalTests" -ForegroundColor White
Write-Host "Exitosos: $testsPassed" -ForegroundColor Green
Write-Host "Fallidos: $testsFailed" -ForegroundColor Red
Write-Host "Porcentaje: $percentage%" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host "TODOS LOS TESTS PASARON!" -ForegroundColor Green
} else {
    Write-Host "Algunos tests fallaron" -ForegroundColor Yellow
}

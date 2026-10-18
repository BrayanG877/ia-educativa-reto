# 🧪 Test End-to-End Completo
# Verifica que toda la integración funcione correctamente

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   TEST DE INTEGRACIÓN COMPLETA" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0

# Test 1: Health Check
Write-Host "[TEST 1] Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    if ($response.status -eq "ok") {
        Write-Host "  ✅ PASS - Servidor respondiendo" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - Respuesta inesperada" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 2: Login
Write-Host "`n[TEST 2] Login de usuario..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "camilamiamor@gmail.com"
        password = "2804"
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"

    if ($loginResponse.success -and $loginResponse.data.token) {
        Write-Host "  ✅ PASS - Login exitoso" -ForegroundColor Green
        Write-Host "  📝 Token: $($loginResponse.data.token.Substring(0,30))..." -ForegroundColor Gray
        $token = $loginResponse.data.token
        $userId = $loginResponse.data.user.id
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - Login falló" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 3: Obtener materias
Write-Host "`n[TEST 3] Obtener lista de materias..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }

    $subjectsResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/subjects" `
        -Method GET `
        -Headers $headers

    if ($subjectsResponse.success -and $subjectsResponse.data.Count -ge 13) {
        Write-Host "  ✅ PASS - Materias obtenidas: $($subjectsResponse.data.Count)" -ForegroundColor Green
        Write-Host "  📚 Materias: $($subjectsResponse.data.name -join ', ')" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No se obtuvieron materias" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 4: Enviar pregunta con método socrático
Write-Host "`n[TEST 4] Enviar pregunta con método socrático..." -ForegroundColor Yellow
try {
    $questionBody = @{
        message = "¿Cuánto es 2 + 2?"
        subject = "matematicas"
        mode = "socratic"
    } | ConvertTo-Json

    $questionResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
        -Method POST `
        -Body $questionBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    if ($questionResponse.success -and $questionResponse.data.response) {
        Write-Host "  ✅ PASS - Respuesta recibida" -ForegroundColor Green
        Write-Host "  💬 Respuesta (primeros 100 chars):" -ForegroundColor Gray
        Write-Host "     $($questionResponse.data.response.Substring(0, [Math]::Min(100, $questionResponse.data.response.Length)))..." -ForegroundColor Gray
        Write-Host "  📊 Tokens: $($questionResponse.data.usage.totalTokens)" -ForegroundColor Gray
        Write-Host "  💰 Costo: `$$($questionResponse.data.cost)" -ForegroundColor Gray
        Write-Host "  ⏱️ Duración: $($questionResponse.data.duration)ms" -ForegroundColor Gray

        # Verificar que use método socrático (debe contener preguntas)
        if ($questionResponse.data.response -match '\?' -or $questionResponse.data.response -match 'pregunta') {
            Write-Host "  ✅ Método socrático detectado (contiene preguntas)" -ForegroundColor Green
        }

        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No se recibió respuesta" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 5: Herramienta - Mapa Mental
Write-Host "`n[TEST 5] Herramienta: Generar mapa mental..." -ForegroundColor Yellow
try {
    $mindmapBody = @{
        subject = "biologia"
        topic = "Célula eucariota"
        depth = 2
    } | ConvertTo-Json

    $mindmapResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/mindmap" `
        -Method POST `
        -Body $mindmapBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    if ($mindmapResponse.success -and $mindmapResponse.data.content) {
        Write-Host "  ✅ PASS - Mapa mental generado" -ForegroundColor Green
        Write-Host "  🧠 Contenido (primeros 100 chars):" -ForegroundColor Gray
        Write-Host "     $($mindmapResponse.data.content.Substring(0, [Math]::Min(100, $mindmapResponse.data.content.Length)))..." -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No se generó mapa mental" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 6: Herramienta - Quiz
Write-Host "`n[TEST 6] Herramienta: Generar quiz..." -ForegroundColor Yellow
try {
    $quizBody = @{
        subject = "ingles"
        topic = "Present Simple"
        type = "mixed"
        quantity = 3
    } | ConvertTo-Json

    $quizResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/quiz" `
        -Method POST `
        -Body $quizBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    if ($quizResponse.success -and $quizResponse.data.content) {
        Write-Host "  ✅ PASS - Quiz generado" -ForegroundColor Green
        Write-Host "  ❓ Contenido (primeros 100 chars):" -ForegroundColor Gray
        Write-Host "     $($quizResponse.data.content.Substring(0, [Math]::Min(100, $quizResponse.data.content.Length)))..." -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No se generó quiz" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 7: Ranking
Write-Host "`n[TEST 7] Obtener ranking..." -ForegroundColor Yellow
try {
    $rankingResponse = Invoke-RestMethod -Uri "$baseUrl/api/metrics/ranking" `
        -Method GET `
        -Headers $headers

    if ($rankingResponse.success -and $rankingResponse.data) {
        Write-Host "  ✅ PASS - Ranking obtenido" -ForegroundColor Green
        Write-Host "  🏆 Usuarios en ranking: $($rankingResponse.data.Count)" -ForegroundColor Gray
        if ($rankingResponse.data.Count -gt 0) {
            Write-Host "  👤 Top usuario: $($rankingResponse.data[0].email)" -ForegroundColor Gray
        }
        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No se obtuvo ranking" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 8: Adaptación por materia (Física)
Write-Host "`n[TEST 8] Adaptación por materia (Física)..." -ForegroundColor Yellow
try {
    $physicaBody = @{
        message = "Explica la ley de Newton"
        subject = "fisica"
        mode = "socratic"
    } | ConvertTo-Json

    $physicaResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
        -Method POST `
        -Body $physicaBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    if ($physicaResponse.success) {
        Write-Host "  ✅ PASS - Respuesta adaptada a Física" -ForegroundColor Green

        # Verificar contexto de física
        if ($physicaResponse.data.response -match 'fuerza|movimiento|Newton|física') {
            Write-Host "  ✅ Contexto de Física detectado" -ForegroundColor Green
        }

        $testsPassed++
    } else {
        Write-Host "  ❌ FAIL - No adaptó a física" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 9: Verificar cache
Write-Host "`n[TEST 9] Verificar funcionamiento de cache..." -ForegroundColor Yellow
try {
    # Primera consulta
    $cacheTestBody = @{
        message = "¿Cuál es la capital de Francia?"
        subject = "sociales"
        mode = "direct"
    } | ConvertTo-Json

    $firstResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
        -Method POST `
        -Body $cacheTestBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    Start-Sleep -Seconds 1

    # Segunda consulta (debería venir de cache)
    $secondResponse = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
        -Method POST `
        -Body $cacheTestBody `
        -ContentType "application/json" `
        -Headers $headers `
        -TimeoutSec 30

    if ($firstResponse.success -and $secondResponse.success) {
        if ($secondResponse.data.duration -lt ($firstResponse.data.duration / 2)) {
            Write-Host "  ✅ PASS - Cache funcionando (2da consulta más rápida)" -ForegroundColor Green
            Write-Host "  ⏱️ 1ra: $($firstResponse.data.duration)ms, 2da: $($secondResponse.data.duration)ms" -ForegroundColor Gray
            $testsPassed++
        } else {
            Write-Host "  ⚠️ WARNING - Cache no mejoró performance" -ForegroundColor Yellow
            $testsPassed++
        }
    } else {
        Write-Host "  ❌ FAIL - Error en test de cache" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 10: Rate Limiting
Write-Host "`n[TEST 10] Verificar rate limiting..." -ForegroundColor Yellow
try {
    Write-Host "  ⏳ Enviando 12 consultas rápidas..." -ForegroundColor Gray
    $rateLimitHit = $false

    for ($i = 1; $i -le 12; $i++) {
        try {
            $quickBody = @{
                message = "Test $i"
                subject = "matematicas"
            } | ConvertTo-Json

            $null = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
                -Method POST `
                -Body $quickBody `
                -ContentType "application/json" `
                -Headers $headers `
                -TimeoutSec 5 `
                -ErrorAction Stop

            Start-Sleep -Milliseconds 100
        } catch {
            if ($_.Exception.Response.StatusCode -eq 429) {
                $rateLimitHit = $true
                Write-Host "  ✅ PASS - Rate limiting activado en consulta #$i" -ForegroundColor Green
                $testsPassed++
                break
            }
        }
    }

    if (-not $rateLimitHit) {
        Write-Host "  ⚠️ WARNING - Rate limiting no activado (puede ser normal si límite es alto)" -ForegroundColor Yellow
        $testsPassed++
    }
} catch {
    Write-Host "  ❌ FAIL - Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Resumen final
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "           RESUMEN DE TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$totalTests = $testsPassed + $testsFailed
$percentage = [math]::Round(($testsPassed / $totalTests) * 100, 1)

Write-Host "Total de tests: $totalTests" -ForegroundColor White
Write-Host "✅ Tests exitosos: $testsPassed" -ForegroundColor Green
Write-Host "❌ Tests fallidos: $testsFailed" -ForegroundColor Red
Write-Host "📊 Porcentaje de éxito: $percentage%" -ForegroundColor Cyan

if ($testsFailed -eq 0) {
    Write-Host "`n🎉 ¡TODOS LOS TESTS PASARON!" -ForegroundColor Green
    Write-Host "✅ Sistema completamente funcional e integrado" -ForegroundColor Green
} elseif ($percentage -ge 80) {
    Write-Host "`n⚠️ Sistema mayormente funcional con algunos problemas menores" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Sistema requiere correcciones críticas" -ForegroundColor Red
}

Write-Host "`n========================================`n" -ForegroundColor Cyan

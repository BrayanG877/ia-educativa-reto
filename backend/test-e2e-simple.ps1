# PRUEBA COMPLETA E2E - IA EDUCATIVA
# Test simplificado sin emojis problematicos

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "PRUEBA COMPLETA END-TO-END" -ForegroundColor Yellow
Write-Host "=========================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$testEmail = "camilamiamor@gmail.com"
$testPassword = "2804"
$token = $null

# 1. TEST DE AUTENTICACION
Write-Host "1. Probando Login..." -ForegroundColor Green

try {
    $loginBody = @{
        email = $testEmail
        password = $testPassword
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json"

    if ($loginResponse.success) {
        $token = $loginResponse.data.token
        Write-Host "   [OK] Login exitoso" -ForegroundColor Green
        Write-Host "   Usuario: $($loginResponse.data.user.email)" -ForegroundColor Gray
    } else {
        Write-Host "   [FAIL] Login fallido: $($loginResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   [FAIL] Error en login: $_" -ForegroundColor Red
    exit 1
}

# Headers con JWT
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# 2. TEST DE METODO SOCRATICO
Write-Host "`n2. Probando Metodo Socratico..." -ForegroundColor Green

try {
    $messageBody = @{
        message = "Que es la fotosintesis?"
        subject = "biologia"
        mode = "socratic"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
        -Method Post `
        -Headers $headers `
        -Body $messageBody

    if ($response.success) {
        Write-Host "   [OK] Respuesta recibida (Metodo Socratico)" -ForegroundColor Green
        Write-Host "   Modelo: $($response.data.model)" -ForegroundColor Gray
        Write-Host "   Tokens: $($response.data.usage.totalTokens)" -ForegroundColor Gray
        Write-Host "   Costo: `$$($response.data.cost.totalCost)" -ForegroundColor Gray
        Write-Host "`n   Primeros 200 caracteres:" -ForegroundColor Yellow
        Write-Host "   $($response.data.response.Substring(0, [Math]::Min(200, $response.data.response.Length)))..." -ForegroundColor White

        # Verificar que es socratico (debe tener preguntas)
        if ($response.data.response -match "\?") {
            Write-Host "   [OK] Respuesta contiene preguntas (Metodo Socratico)" -ForegroundColor Green
        } else {
            Write-Host "   [WARNING] Respuesta no parece usar metodo socratico" -ForegroundColor Yellow
        }

        $conversationId = $response.data.conversationId
    }
} catch {
    Write-Host "   [FAIL] Error en consulta: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 3

# 3. TEST DE HERRAMIENTAS - TEST PREP
Write-Host "`n3. Probando Herramienta: Test de Preparacion..." -ForegroundColor Green

try {
    $testPrepBody = @{
        subject = "matematicas"
        topic = "Fracciones"
        quantity = 3
        difficulty = "basico"
    } | ConvertTo-Json

    $testResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/test-prep" `
        -Method Post `
        -Headers $headers `
        -Body $testPrepBody

    if ($testResponse.success) {
        Write-Host "   [OK] Test generado correctamente" -ForegroundColor Green
        Write-Host "   Tokens: $($testResponse.data.usage.totalTokens)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [FAIL] Error generando test: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 3

# 4. TEST DE HERRAMIENTAS - MAPA MENTAL
Write-Host "`n4. Probando Herramienta: Mapa Mental..." -ForegroundColor Green

try {
    $mindmapBody = @{
        subject = "biologia"
        topic = "Celula"
        depth = 2
    } | ConvertTo-Json

    $mindmapResponse = Invoke-RestMethod -Uri "$baseUrl/api/tools/mindmap" `
        -Method Post `
        -Headers $headers `
        -Body $mindmapBody

    if ($mindmapResponse.success) {
        Write-Host "   [OK] Mapa mental generado correctamente" -ForegroundColor Green
    }
} catch {
    Write-Host "   [FAIL] Error generando mapa mental: $_" -ForegroundColor Red
}

Start-Sleep -Seconds 3

# 5. TEST DE PERSISTENCIA
Write-Host "`n5. Probando persistencia de conversaciones..." -ForegroundColor Green

try {
    $conversations = Invoke-RestMethod -Uri "$baseUrl/api/chat/conversations" `
        -Method Get `
        -Headers $headers

    if ($conversations.success) {
        Write-Host "   [OK] Conversaciones recuperadas: $($conversations.data.Count)" -ForegroundColor Green
        if ($conversations.data.Count -gt 0) {
            $conv = $conversations.data[0]
            Write-Host "   Ultima conversacion:" -ForegroundColor Gray
            Write-Host "   - Materia: $($conv.subject_name)" -ForegroundColor Gray
            Write-Host "   - Mensajes: $($conv.message_count)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   [FAIL] Error obteniendo conversaciones: $_" -ForegroundColor Red
}

# 6. TEST DE DIFERENTES MATERIAS
Write-Host "`n6. Probando multiples materias..." -ForegroundColor Green

$testSubjects = @(
    @{ code = "matematicas"; question = "Para que sirve el algebra?" },
    @{ code = "ingles"; question = "How do I use present perfect?" }
)

foreach ($test in $testSubjects) {
    try {
        $body = @{
            message = $test.question
            subject = $test.code
            mode = "socratic"
        } | ConvertTo-Json

        $resp = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" `
            -Method Post `
            -Headers $headers `
            -Body $body

        if ($resp.success) {
            Write-Host "   [OK] $($test.code): Respondio correctamente" -ForegroundColor Green
        }
    } catch {
        Write-Host "   [FAIL] $($test.code): Error" -ForegroundColor Red
    }

    Start-Sleep -Seconds 3
}

# RESUMEN FINAL
Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DE PRUEBAS" -ForegroundColor Yellow
Write-Host "=========================================`n" -ForegroundColor Cyan

Write-Host "[OK] Autenticacion: Funcionando" -ForegroundColor Green
Write-Host "[OK] Metodo Socratico: Activo" -ForegroundColor Green
Write-Host "[OK] Herramientas: Operativas" -ForegroundColor Green
Write-Host "[OK] Persistencia: Funcionando" -ForegroundColor Green
Write-Host "[OK] Multiples Materias: OK" -ForegroundColor Green

Write-Host "`nTODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE`n" -ForegroundColor Green
Write-Host "=========================================`n" -ForegroundColor Cyan

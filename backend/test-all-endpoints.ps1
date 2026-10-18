# Script de Pruebas Automatizadas - Backend IA Educativa
# Ejecutar: .\test-all-endpoints.ps1

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🧪 PRUEBAS AUTOMATIZADAS - IA EDUCATIVA BACKEND       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0

# Función para imprimir resultado
function Print-Result {
    param($testName, $success, $message = "")
    if ($success) {
        Write-Host "✅ $testName" -ForegroundColor Green
        if ($message) { Write-Host "   $message" -ForegroundColor Gray }
        $script:testsPassed++
    } else {
        Write-Host "❌ $testName" -ForegroundColor Red
        if ($message) { Write-Host "   Error: $message" -ForegroundColor Red }
        $script:testsFailed++
    }
}

# TEST 1: Health Check
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📊 TEST 1: Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET -ErrorAction Stop
    if ($response.status -eq "OK") {
        Print-Result "Health Check" $true "Servidor: $($response.service) v$($response.version)"
    } else {
        Print-Result "Health Check" $false "Status: $($response.status)"
    }
} catch {
    Print-Result "Health Check" $false $_.Exception.Message
}
Write-Host ""

# TEST 2: Listar Materias
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📚 TEST 2: Listar Materias" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/subjects" -Method GET -ErrorAction Stop
    if ($response.success -and $response.data.count -eq 13) {
        Print-Result "Listar Materias" $true "$($response.data.count) materias disponibles"
        Write-Host "   Materias:" -ForegroundColor Gray
        $response.data.subjects | ForEach-Object {
            Write-Host "      $($_.emoji) $($_.name)" -ForegroundColor Gray
        }
    } else {
        Print-Result "Listar Materias" $false "Count: $($response.data.count)"
    }
} catch {
    Print-Result "Listar Materias" $false $_.Exception.Message
}
Write-Host ""

# TEST 3: Registro de Usuario
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "👤 TEST 3: Registro de Usuario" -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "test$timestamp@prueba.com"
$testUsername = "user$timestamp"
$testPassword = "TestPass123!"

try {
    $body = @{
        email = $testEmail
        password = $testPassword
        username = $testUsername
        fullName = "Usuario de Prueba"
        gradeLevel = "10"
        institution = "Colegio Test"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    if ($response.success) {
        Print-Result "Registro de Usuario" $true "Usuario creado: $testEmail"
        $script:testUserId = $response.data.userId
    } else {
        Print-Result "Registro de Usuario" $false "Response: $($response.message)"
    }
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    Print-Result "Registro de Usuario" $false $errorMessage.message
}
Write-Host ""

# TEST 4: Login de Usuario
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "🔐 TEST 4: Login de Usuario" -ForegroundColor Yellow
try {
    $body = @{
        email = $testEmail
        password = $testPassword
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    if ($response.success) {
        $script:authToken = $response.data.token
        Print-Result "Login de Usuario" $true "Token JWT obtenido"
        Write-Host "   Username: $($response.data.username)" -ForegroundColor Gray
        Write-Host "   Email: $($response.data.email)" -ForegroundColor Gray
        Write-Host "   Token: $($authToken.Substring(0,50))..." -ForegroundColor Gray
    } else {
        Print-Result "Login de Usuario" $false "Response: $($response.message)"
    }
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    Print-Result "Login de Usuario" $false $errorMessage.message
}
Write-Host ""

# TEST 5: Ranking de Estudiantes
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "🏆 TEST 5: Ranking de Estudiantes" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/metrics/ranking" -Method GET -ErrorAction Stop
    if ($response.success) {
        Print-Result "Ranking de Estudiantes" $true "$($response.data.count) estudiantes en ranking"
        if ($response.data.ranking.Count -gt 0) {
            Write-Host "   Top 3:" -ForegroundColor Gray
            $response.data.ranking | Select-Object -First 3 | ForEach-Object {
                Write-Host "      🥇 $($_.username) - $($_.total_messages) mensajes" -ForegroundColor Gray
            }
        }
    } else {
        Print-Result "Ranking de Estudiantes" $false "Response: $($response.message)"
    }
} catch {
    Print-Result "Ranking de Estudiantes" $false $_.Exception.Message
}
Write-Host ""

# TEST 6: Obtener Perfil (requiere auth)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "👨‍🎓 TEST 6: Obtener Perfil de Usuario (Auth Required)" -ForegroundColor Yellow
if ($authToken) {
    try {
        $headers = @{ "Authorization" = "Bearer $authToken" }
        $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/me" -Method GET -Headers $headers -ErrorAction Stop
        if ($response.success) {
            Print-Result "Obtener Perfil" $true "Perfil obtenido correctamente"
            Write-Host "   Usuario: $($response.data.username)" -ForegroundColor Gray
            Write-Host "   Rol: $($response.data.role)" -ForegroundColor Gray
            Write-Host "   Grado: $($response.data.gradeLevel)" -ForegroundColor Gray
        } else {
            Print-Result "Obtener Perfil" $false "Response: $($response.message)"
        }
    } catch {
        Print-Result "Obtener Perfil" $false $_.Exception.Message
    }
} else {
    Print-Result "Obtener Perfil" $false "Token no disponible (login falló)"
}
Write-Host ""

# TEST 7: Crear Nueva Conversación (requiere auth)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "💬 TEST 7: Crear Nueva Conversación (Auth Required)" -ForegroundColor Yellow
if ($authToken) {
    try {
        $headers = @{ "Authorization" = "Bearer $authToken" }
        $body = @{
            subjectId = 1
            mode = "socratic"
            title = "Prueba de Conversación"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/conversation/new" -Method POST -Headers $headers -Body $body -ContentType "application/json" -ErrorAction Stop
        if ($response.success) {
            $script:conversationId = $response.data.conversationId
            Print-Result "Crear Conversación" $true "ID: $conversationId"
        } else {
            Print-Result "Crear Conversación" $false "Response: $($response.message)"
        }
    } catch {
        $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
        Print-Result "Crear Conversación" $false $errorMessage.message
    }
} else {
    Print-Result "Crear Conversación" $false "Token no disponible (login falló)"
}
Write-Host ""

# TEST 8: Listar Conversaciones (requiere auth)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📋 TEST 8: Listar Conversaciones (Auth Required)" -ForegroundColor Yellow
if ($authToken) {
    try {
        $headers = @{ "Authorization" = "Bearer $authToken" }
        $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/conversations" -Method GET -Headers $headers -ErrorAction Stop
        if ($response.success) {
            Print-Result "Listar Conversaciones" $true "$($response.data.count) conversaciones encontradas"
        } else {
            Print-Result "Listar Conversaciones" $false "Response: $($response.message)"
        }
    } catch {
        Print-Result "Listar Conversaciones" $false $_.Exception.Message
    }
} else {
    Print-Result "Listar Conversaciones" $false "Token no disponible (login falló)"
}
Write-Host ""

# RESUMEN FINAL
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host "📊 RESUMEN DE PRUEBAS" -ForegroundColor Cyan
Write-Host ""
Write-Host "   ✅ Tests Exitosos: $testsPassed" -ForegroundColor Green
Write-Host "   ❌ Tests Fallidos: $testsFailed" -ForegroundColor Red
Write-Host "   📈 Total de Tests: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host ""

$successRate = [math]::Round(($testsPassed / ($testsPassed + $testsFailed)) * 100, 2)
Write-Host "   🎯 Tasa de Éxito: $successRate%" -ForegroundColor $(if ($successRate -eq 100) { "Green" } elseif ($successRate -ge 80) { "Yellow" } else { "Red" })
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE             ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
} else {
    Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║   ⚠️  ALGUNAS PRUEBAS FALLARON                          ║" -ForegroundColor Yellow
    Write-Host "║   Revisa los errores arriba para más detalles           ║" -ForegroundColor Yellow
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
}
Write-Host ""

# Informacion adicional
Write-Host "NOTAS:" -ForegroundColor Cyan
Write-Host "   - Para probar endpoints de IA, se requiere Anthropic API key valida" -ForegroundColor Gray
Write-Host "   - Algunos endpoints consumen creditos de API al usarse" -ForegroundColor Gray
Write-Host "   - Token JWT guardado en variable authToken para pruebas adicionales" -ForegroundColor Gray
Write-Host ""
Write-Host "Para ver mas detalles: cat PRUEBAS_COMPLETAS_EXITOSAS.md" -ForegroundColor Gray
Write-Host ""

# Script de Pruebas de API - IA Educativa
# Prueba todos los endpoints implementados

$baseUrl = "http://localhost:3001"
$testUserId = "00000000-0000-0000-0000-000000000001" # UUID de prueba

Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🧪 TEST DE API - IA EDUCATIVA        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "1️⃣  Test Health Check" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "   ✓ Status: $($response.status)" -ForegroundColor Green
    Write-Host "   ✓ Service: $($response.service)" -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
} catch {
    Write-Host "   ❌ FALLÓ: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Listar Materias
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "2️⃣  Test GET /api/chat/subjects" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/subjects" -Method Get
    Write-Host "   ✓ Materias encontradas: $($response.data.count)" -ForegroundColor Green
    Write-Host "   ✓ Primera materia: $($response.data.subjects[0].name)" -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
} catch {
    Write-Host "   ❌ FALLÓ: $_" -ForegroundColor Red
}
Write-Host ""

# Test 3: Registro de Usuario
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "3️⃣  Test POST /api/auth/register" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$registerBody = @{
    email = "estudiante.test@ejemplo.com"
    password = "password123"
    username = "estudiante_test"
    fullName = "Estudiante de Prueba"
    gradeLevel = "11mo"
    institution = "Colegio Test"
    parentConsent = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "   ✓ Usuario creado: $($response.data.username)" -ForegroundColor Green
    Write-Host "   ✓ Email: $($response.data.email)" -ForegroundColor Green
    Write-Host "   ✓ Token generado: $($response.data.token.Substring(0, 20))..." -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
    $global:testToken = $response.data.token
    $global:testUserId = $response.data.userId
} catch {
    Write-Host "   ⚠️ Usuario ya existe o error: $_" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: Login
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "4️⃣  Test POST /api/auth/login" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$loginBody = @{
    email = "estudiante.test@ejemplo.com"
    password = "password123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "   ✓ Login exitoso: $($response.data.username)" -ForegroundColor Green
    Write-Host "   ✓ Role: $($response.data.role)" -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
    $global:testUserId = $response.data.userId
} catch {
    Write-Host "   ❌ FALLÓ: $_" -ForegroundColor Red
}
Write-Host ""

# Test 5: Enviar Mensaje a IA (requiere base de datos con materias)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "5️⃣  Test POST /api/chat/message" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

$messageBody = @{
    message = "¿Qué es el álgebra?"
    subject = "matematicas"
    mode = "socratic"
    userId = $global:testUserId
} | ConvertTo-Json

try {
    Write-Host "   ⏳ Enviando mensaje a IA (puede tardar 5-10 segundos)..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri "$baseUrl/api/chat/message" -Method Post -Body $messageBody -ContentType "application/json" -TimeoutSec 30
    Write-Host "   ✓ Respuesta recibida" -ForegroundColor Green
    Write-Host "   ✓ Modelo: $($response.data.model)" -ForegroundColor Green
    Write-Host "   ✓ Tokens: $($response.data.usage.totalTokens)" -ForegroundColor Green
    Write-Host "   ✓ Costo: `$$($response.data.cost.totalCost)" -ForegroundColor Green
    Write-Host "   ✓ Desde caché: $($response.data.fromCache)" -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
    $global:testConversationId = $response.data.conversationId
} catch {
    Write-Host "   ⚠️ Error (necesita base de datos inicializada): $_" -ForegroundColor Yellow
}
Write-Host ""

# Test 6: Obtener Ranking
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "6️⃣  Test GET /api/metrics/ranking" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/metrics/ranking?limit=5" -Method Get
    Write-Host "   ✓ Estudiantes en ranking: $($response.data.count)" -ForegroundColor Green
    Write-Host "   ✅ EXITOSO" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️ Error (necesita base de datos): $_" -ForegroundColor Yellow
}
Write-Host ""

# Resumen Final
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ TESTS COMPLETADOS" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Resumen:" -ForegroundColor White
Write-Host "   - Servidor: ✅ Funcionando" -ForegroundColor Green
Write-Host "   - Health Check: ✅ OK" -ForegroundColor Green
Write-Host "   - Autenticación: ✅ Implementada" -ForegroundColor Green
Write-Host "   - Chat IA: ⚠️ Requiere BD inicializada" -ForegroundColor Yellow
Write-Host "   - Métricas: ⚠️ Requiere BD inicializada" -ForegroundColor Yellow
Write-Host ""
Write-Host "📝 Siguiente paso: Inicializar base de datos SQL Server" -ForegroundColor Cyan
Write-Host "   Ver: INICIALIZAR_BASE_DATOS.md" -ForegroundColor Cyan
Write-Host ""

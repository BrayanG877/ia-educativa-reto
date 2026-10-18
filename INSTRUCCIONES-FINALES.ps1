# ====================================================
# INSTRUCCIONES FINALES - ELEGIR OPCION
# ====================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  AZURE CLI INSTALADO CORRECTAMENTE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Tienes 2 opciones para completar la configuracion:`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  OPCION 1: AUTOMATICA (RECOMENDADA)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Todo se configura automaticamente en 2 minutos" -ForegroundColor White
Write-Host ""
Write-Host "Pasos:" -ForegroundColor Cyan
Write-Host "  1. CIERRA esta ventana de PowerShell" -ForegroundColor White
Write-Host "  2. ABRE una nueva ventana de PowerShell" -ForegroundColor White
Write-Host "  3. Ejecuta:" -ForegroundColor White
Write-Host ""
Write-Host "     cd C:\Users\USER\Downloads\claurst-main\claurst-main" -ForegroundColor Gray
Write-Host "     .\CONFIGURAR-TODO-AUTOMATICO.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "El script:" -ForegroundColor Gray
Write-Host "  - Te pedira login en Azure (se abre navegador)" -ForegroundColor Gray
Write-Host "  - Configurara las 20 variables de entorno" -ForegroundColor Gray
Write-Host "  - Configurara el firewall de SQL Server" -ForegroundColor Gray
Write-Host "  - Reiniciara el App Service" -ForegroundColor Gray
Write-Host "  - Verificara que todo funcione" -ForegroundColor Gray
Write-Host "  - Abrira tu app en el navegador" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  OPCION 2: MANUAL (PORTAL DE AZURE)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Si prefieres configurar manualmente en el portal web" -ForegroundColor White
Write-Host ""
Write-Host "Abre esta guia paso a paso:" -ForegroundColor Cyan
Write-Host "  CONFIGURAR-MANUAL.md" -ForegroundColor White
Write-Host ""
Write-Host "O desde PowerShell:" -ForegroundColor Gray
Write-Host "  notepad CONFIGURAR-MANUAL.md" -ForegroundColor Gray
Write-Host ""
Write-Host "La guia incluye:" -ForegroundColor Gray
Write-Host "  - Lista de 20 variables para copiar/pegar" -ForegroundColor Gray
Write-Host "  - Como configurar firewall de SQL Server" -ForegroundColor Gray
Write-Host "  - Como verificar que funcione" -ForegroundColor Gray
Write-Host "  - Capturas y explicaciones detalladas" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RECOMENDACION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Usa la OPCION 1 (automatica)" -ForegroundColor Green
Write-Host "Es mas rapida, segura y sin errores" -ForegroundColor White
Write-Host ""
Write-Host "Solo necesitas:" -ForegroundColor White
Write-Host "  1. Reiniciar PowerShell" -ForegroundColor Gray
Write-Host "  2. Ejecutar: .\CONFIGURAR-TODO-AUTOMATICO.ps1" -ForegroundColor Cyan
Write-Host "  3. Hacer login en Azure cuando se abra el navegador" -ForegroundColor Gray
Write-Host "  4. Esperar 2 minutos" -ForegroundColor Gray
Write-Host "  5. Disfrutar tu IA educativa funcionando!" -ForegroundColor Green
Write-Host ""

Read-Host "Presiona Enter para cerrar esta ventana y comenzar"

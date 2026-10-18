/**
 * Ejecutar schema SQL completo - Método directo
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

const schemaPath = path.join(__dirname, 'database', 'schema_sqlserver.sql');

console.log('╔═══════════════════════════════════════════╗');
console.log('║   🚀 EJECUTANDO SCHEMA SQL SERVER      ║');
console.log('╚═══════════════════════════════════════════╝\n');

console.log('📄 Schema: schema_sqlserver.sql');
console.log('🔌 Servidor: miservidorbr.database.windows.net');
console.log('🗄️  Base de datos: ia_educativa\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚡ OPCIÓN 1: Usando Azure Portal');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Pasos:');
console.log('1. Ve a: https://portal.azure.com');
console.log('2. Navega a tu base de datos "ia_educativa"');
console.log('3. Click en "Query editor" (SQL)');
console.log('4. Inicia sesión con:');
console.log('   - Usuario: adminsoloverde');
console.log('   - Contraseña: (tu contraseña)');
console.log('5. Abre el archivo: database/schema_sqlserver.sql');
console.log('6. Copia TODO el contenido');
console.log('7. Pégalo en Query editor');
console.log('8. Click en "Run"');
console.log('9. Espera ~30 segundos');
console.log('10. Deberías ver: "Commands completed successfully"\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚡ OPCIÓN 2: Usando Azure Data Studio');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Pasos:');
console.log('1. Abre Azure Data Studio');
console.log('2. Conecta a: miservidorbr.database.windows.net');
console.log('3. Base de datos: ia_educativa');
console.log('4. Abre archivo: database/schema_sqlserver.sql');
console.log('5. Presiona F5 o click en "Run"');
console.log('6. Espera a que termine\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚡ OPCIÓN 3: Usando sqlcmd (si está instalado)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Comando:');
console.log(`sqlcmd -S miservidorbr.database.windows.net -d ia_educativa -U adminsoloverde -P <password> -i "${schemaPath}"`);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 DESPUÉS DE EJECUTAR EL SCHEMA:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Ejecuta en esta terminal:');
console.log('  node check-database.js\n');
console.log('Deberías ver:');
console.log('  ✅ 8 tablas encontradas');
console.log('  ✅ 13 materias encontradas\n');

console.log('Luego reinicia el servidor:');
console.log('  npm run dev\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('💡 TIP: La opción MÁS RÁPIDA es Azure Portal Query Editor (Opción 1)');
console.log('    Toma solo 2-3 minutos\n');

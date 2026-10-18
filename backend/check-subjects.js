require('dotenv').config();
const sql = require('mssql');

(async () => {
    const pool = await sql.connect({
        server: process.env.DB_HOST,
        port: 1433,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: { encrypt: true, trustServerCertificate: false }
    });

    const result = await pool.request().query('SELECT code, name FROM subjects');
    console.log('Materias disponibles:');
    result.recordset.forEach(r => console.log(`  ${r.code} - ${r.subject_name}`));

    await pool.close();
})();

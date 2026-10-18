# CÓMO ARRANCAR Y PROBAR LA IA EDUCATIVA

Guía corta para dejar el proyecto funcionando de extremo a extremo.

---

## 0. Problema de "puertos ocupados" (EADDRINUSE)

Si al arrancar ves:

```
Error: listen EADDRINUSE: address already in use :::3001
```

significa que **ya hay un servidor corriendo** en ese puerto. Libéralo:

```powershell
# Mata cualquier proceso node que esté escuchando en 3000 o 3001
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

O simplemente: `Get-Process node | Stop-Process -Force`

> El backend ahora termina con un mensaje claro en vez de un stack trace si el
> puerto está ocupado.

---

## 1. Requisitos

- **Node.js 18+** (probado con Node 24)
- **SQL Server** accesible (configurado en `backend/.env`)
- **Redis** local o remoto (opcional: si no está, se continúa sin caché)
- **Un proveedor de IA** (ver sección 3)

## 2. Instalar dependencias

```powershell
cd C:\Users\USER\Downloads\claurst-main\claurst-main\backend
npm install
```

## 3. Configurar la IA (elige UNA opción)

Copia `backend/.env.example` a `backend/.env` si no lo tienes, y edita:

### Opción A — Groq (gratuito, sin tarjeta) ← recomendado
1. Crea una API key gratis en https://console.groq.com/keys
2. En `backend/.env`:
   ```
   AI_PROVIDER=groq
   GROQ_API_KEY=tu_groq_api_key_aqui
   ```

### Opción B — Google Gemini (gratuito, sin tarjeta)
1. Crea una API key gratis en https://aistudio.google.com/apikey
2. En `backend/.env`:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=tu_gemini_api_key_aqui
   ```

### Opción C — Ollama (local, 100% gratis, sin registro)
1. Instala Ollama: https://ollama.com/download
2. Descarga un modelo: `ollama pull llama3.2`
3. Arranca el servicio: `ollama serve`
4. En `backend/.env`:
   ```
   AI_PROVIDER=ollama
   ```

> Si el proveedor elegido no tiene credenciales, **el backend elige
> automáticamente el primer proveedor gratuito configurado** (groq → gemini →
> openrouter → ollama). Puedes ver el estado real en `GET /health` o en
> `GET /api/ai/providers`.

## 4. Arrancar el backend

```powershell
cd C:\Users\USER\Downloads\claurst-main\claurst-main\backend
npm start
```

Debe mostrar:
```
✅ SQL Server conectado
✅ Redis conectado
✅ Servidor iniciado correctamente
🔗 URL: http://localhost:3001
```

## 5. Arrancar el frontend (en OTRA terminal)

```powershell
cd C:\Users\USER\Downloads\claurst-main\claurst-main\backend
npm run serve-web
```

El frontend queda en **http://localhost:3000/login.html**

## 6. Usar la aplicación

1. Abre http://localhost:3000/login.html
2. Regístrate ("Regístrate") o usa el usuario de prueba:
   - Email: `camilamiamor@gmail.com`
   - Contraseña: `camila2804`
3. Selecciona una materia (chip o botón "+"), escribe una pregunta y pulsa **Enter**.
4. La IA responde con **método socrático** (guía con preguntas, no da la
   respuesta directa).
5. Usa los botones de la barra superior: **Nueva**, **Historial**, **Progreso**, **Salir**.

## 7. Ejecutar las pruebas

Con el backend arriba:

```powershell
cd backend
node test-e2e-conversacion.js   # conversación de 3 turnos
node test-e2e-completo.js       # batería completa (36 comprobaciones)
```

Prueba sin credenciales de IA (servidor LLM local que habla el protocolo real):

```powershell
# Terminal 1
node test-llm-server.js

# Terminal 2 (backend apuntando al LLM de prueba)
$env:AI_PROVIDER="groq"; $env:GROQ_API_KEY="test"; $env:GROQ_API_BASE="http://localhost:4010/v1"
npm start

# Terminal 3
node test-e2e-completo.js
```

---

## Diagnóstico rápido

| Síntoma | Causa probable | Solución |
|---|---|---|
| `EADDRINUSE :::3001` | Ya hay un servidor corriendo | Mata el proceso node (sección 0) |
| Chat responde 503 "no está configurado" | Falta la API key del proveedor | Sección 3 |
| Chat responde 503 "Ollama no está en ejecución" | Ollama no arrancado | `ollama serve` o cambia de proveedor |
| `[WARN] Redis ... password was supplied` | Redis local sin contraseña | Deja `REDIS_PASSWORD=` vacío en `.env` |
| Error de CORS en el navegador | Frontend abierto como `file://` | Sírvelo con `npm run serve-web` |

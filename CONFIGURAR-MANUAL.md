# 🔧 CONFIGURACIÓN MANUAL EN AZURE PORTAL

Ya que reiniciaste el App Service, solo faltan estos 2 pasos:

---

## ✅ PASO 1: CONFIGURAR VARIABLES DE ENTORNO (5 minutos)

### 1. Abre Azure Portal
Ve a: https://portal.azure.com

### 2. Busca tu App Service
- En la barra de búsqueda superior, escribe: **mini-banco77**
- Click en tu App Service

### 3. Ve a Variables de Entorno
- En el menú izquierdo, busca: **Configuración** (Settings)
- Click en: **Variables de entorno** (Environment variables)
- También puede aparecer como: **Configuration** → **Application settings**

### 4. Agregar Variables una por una

Para cada variable abajo:
- Click en **"+ Agregar"** (o "+ Add" o "+ New application setting")
- Copia el **NOMBRE** (Name)
- Copia el **VALOR** (Value)
- Click **"Aceptar"** (OK)
- Repite para las 20 variables

---

### 📋 VARIABLES A COPIAR (20 en total):

#### **Variable 1:**
```
Nombre: NODE_ENV
Valor: production
```

#### **Variable 2:**
```
Nombre: PORT
Valor: 8080
```

#### **Variable 3:**
```
Nombre: WEBSITE_NODE_DEFAULT_VERSION
Valor: 22-lts
```

#### **Variable 4:**
```
Nombre: DB_HOST
Valor: miservidorbr.database.windows.net
```

#### **Variable 5:**
```
Nombre: DB_PORT
Valor: 1433
```

#### **Variable 6:**
```
Nombre: DB_NAME
Valor: ia_educativa
```

#### **Variable 7:**
```
Nombre: DB_USER
Valor: adminsoloverde
```

#### **Variable 8:**
```
Nombre: DB_PASSWORD
Valor: TU_PASSWORD_BD_AQUI
```

#### **Variable 9:**
```
Nombre: REDIS_HOST
Valor: localhost
```

#### **Variable 10:**
```
Nombre: REDIS_PORT
Valor: 6379
```

#### **Variable 11:**
```
Nombre: REDIS_PASSWORD
Valor:
```
*(Dejar en blanco - vacío)*

#### **Variable 12:**
```
Nombre: JWT_SECRET
Valor: educativa_ia_colombia_2026_PRODUCTION_KEY_CHANGE_THIS
```

#### **Variable 13:**
```
Nombre: JWT_EXPIRES_IN
Valor: 24h
```

#### **Variable 14:**
```
Nombre: ANTHROPIC_API_KEY
Valor: sk-ant-api03-TU_CLAVE_ANTHROPIC_AQUI
```

#### **Variable 15:**
```
Nombre: RATE_LIMIT_WINDOW_MS
Valor: 900000
```

#### **Variable 16:**
```
Nombre: RATE_LIMIT_MAX_REQUESTS
Valor: 100
```

#### **Variable 17:**
```
Nombre: MAX_TOKENS_PER_REQUEST
Valor: 1000
```

#### **Variable 18:**
```
Nombre: MAX_CONVERSATION_HISTORY
Valor: 5
```

#### **Variable 19:**
```
Nombre: CACHE_TTL_SECONDS
Valor: 3600
```

#### **Variable 20:**
```
Nombre: FRONTEND_URL
Valor: https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net
```

---

### 5. GUARDAR TODO

**MUY IMPORTANTE:** Después de agregar las 20 variables:
- Busca el botón **"Aplicar"** o **"Guardar"** o **"Save"** en la parte INFERIOR de la página
- Click en ese botón
- Espera a que aparezca: "Successfully updated" o "Configuración actualizada"

---

## ✅ PASO 2: CONFIGURAR FIREWALL DE SQL SERVER (2 minutos)

### 1. Busca tu SQL Server
- En la barra de búsqueda de Azure Portal, escribe: **miservidorbr**
- Click en tu SQL Server (tiene ícono de base de datos)

### 2. Ve a Configuración de Red
- En el menú izquierdo, busca: **Seguridad** (Security)
- Click en: **Redes** (Networking) o **Firewalls y redes virtuales**

### 3. Permitir Servicios de Azure
Busca la sección: **Excepciones** (Exceptions) o **Allow Azure services**

Activa la casilla:
- ✅ **"Permitir que los servicios y recursos de Azure accedan a este servidor"**
- ✅ **"Allow Azure services and resources to access this server"**

### 4. Guardar
- Click en **"Guardar"** (Save)
- Espera confirmación: "Successfully updated firewall rules"

---

## ✅ PASO 3: REINICIAR APP SERVICE (30 segundos)

### 1. Vuelve a tu App Service
- Busca: **mini-banco77**

### 2. Reiniciar
- En **"Información general"** (Overview)
- Click en **"Reiniciar"** (Restart)
- Confirma

### 3. Esperar
- Espera **2 minutos** para que la app se inicialice

---

## ✅ PASO 4: VERIFICAR QUE TODO FUNCIONA (1 minuto)

### Ejecuta el script de verificación:
```powershell
.\test-produccion.ps1
```

Deberías ver:
```
[Test 1] Verificando sitio principal...
   [OK] Sitio accesible (HTTP 200)

[Test 2] Verificando backend...
   [OK] Backend funcionando
      Estado: OK
      Base de datos: connected

[Test 3] Verificando pagina de login...
   [OK] Login accesible
```

---

## 🎉 PROBAR TU APLICACIÓN

### 1. Abre en el navegador:
```
https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/login.html
```

### 2. Login con:
```
Email: camilamiamor@gmail.com
Password: 2804
```

### 3. Prueba la IA:
- Selecciona una materia (ej: "Biología")
- Escribe: "¿Qué es la fotosíntesis?"
- Presiona **Enter** o click en la flecha
- La IA responderá usando el **método socrático** ✅

---

## ❓ SI ALGO FALLA

### Ver logs en Azure Portal:
1. Ve a: mini-banco77
2. Menú izquierdo: **Monitoring** → **Log stream**
3. Revisa errores en tiempo real

### O desde PowerShell:
```powershell
# Instalar Azure CLI si no lo tienes
winget install Microsoft.AzureCLI

# Reinicia PowerShell y luego:
az login
az webapp log tail --name mini-banco77 --resource-group mini-banco77_group
```

---

## 📊 CHECKLIST COMPLETO

- [ ] Agregar 20 variables de entorno en Azure Portal
- [ ] Click en "Aplicar" o "Guardar" para guardar variables
- [ ] Activar "Permitir servicios de Azure" en SQL Server
- [ ] Guardar configuración de firewall
- [ ] Reiniciar App Service mini-banco77
- [ ] Esperar 2 minutos
- [ ] Ejecutar `.\test-produccion.ps1`
- [ ] Todos los tests pasan (OK)
- [ ] Abrir URL de producción en navegador
- [ ] Login exitoso
- [ ] IA responde correctamente

---

## 💡 TIPS

### Si el backend no responde después de 2 minutos:
1. Verifica que TODAS las 20 variables estén agregadas
2. Verifica que hiciste click en "Aplicar" al final
3. Reinicia el App Service nuevamente
4. Espera 3-4 minutos (primera inicialización puede tardar)

### Si da error de conexión a SQL:
1. Verifica que activaste "Permitir servicios de Azure" en el firewall
2. Verifica que guardaste la configuración
3. Prueba conectividad desde Azure Cloud Shell:
```bash
sqlcmd -S miservidorbr.database.windows.net -U adminsoloverde -P TU_PASSWORD_BD_AQUI -d ia_educativa -Q "SELECT 1"
```

---

**¿Necesitas ayuda con algún paso específico?** Puedo explicarte con más detalle. 🚀

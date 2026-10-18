# ========================================
# DESPLIEGUE MANUAL - METODO ALTERNATIVO SIN AZURE CLI
# ========================================

## 🎯 PROBLEMA IDENTIFICADO

Tu código NO está en Azure. Solo tienes la página placeholder.

**Diagnóstico:**
- Variables de entorno: ✅ Configuradas
- App Service: ✅ Activo
- Código desplegado: ❌ NO EXISTE

**Resultado:** HTTP 404 en todos los endpoints (login, health, api)

---

## 🚀 METODO 1: DESPLIEGUE CON AZURE CLI (Recomendado - 3 min)

### Pasos:

1. **Abre una NUEVA PowerShell** (para que Azure CLI funcione)

2. **Navega al proyecto:**
```powershell
cd C:\Users\USER\Downloads\claurst-main\claurst-main
```

3. **Ejecuta el script de despliegue:**
```powershell
.\despliegue-rapido.ps1
```

4. **Sigue las instrucciones:**
   - Hará login en Azure (se abre navegador)
   - Subirá el código automáticamente
   - Reiniciará el servicio
   - Verificará que funcione

---

## 🖱️ METODO 2: DESPLIEGUE MANUAL POR AZURE PORTAL (10 min)

Si Azure CLI no funciona, usa este método:

### A. Crear ZIP Manualmente

1. **Abre File Explorer:**
```
C:\Users\USER\Downloads\claurst-main\claurst-main
```

2. **Selecciona estos archivos/carpetas** (Ctrl+Click):
   - ✅ Carpeta `backend`
   - ✅ Carpeta `web`
   - ✅ Archivo `package.json`
   - ✅ Archivo `startup.sh`
   - ✅ Archivo `.deployment`
   - ✅ Archivo `web.config`

3. **Clic derecho → Enviar a → Carpeta comprimida (ZIP)**
   - Nombra el archivo: `deploy.zip`

### B. Subir a Azure

1. **Abre Azure Portal:**
   - https://portal.azure.com

2. **Busca tu App Service:**
   - Escribe: `mini-banco77`
   - Click en "mini-banco77"

3. **Ve a Deployment Center:**
   - En el menú izquierdo: **Deployment** → **Deployment Center**

4. **Método de despliegue:**
   - Click en la pestaña: **FTPS credentials** o **Local Git**
   - O busca: **"Upload ZIP"** o **"Kudu"**

5. **Abrir Kudu (más fácil):**
   - En la URL de tu navegador, cambia:
   ```
   DE:  https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net
   A:   https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/api/zipdeploy
   ```
   - O en Azure Portal:
     - mini-banco77 → **Development Tools** → **Advanced Tools** → **Go**
     - Esto abre Kudu

6. **En Kudu:**
   - Click en: **Tools** → **Zip Push Deploy**
   - O ve directamente a: https://mini-banco77.scm.azurewebsites.net/ZipDeployUI
   - **Arrastra tu `deploy.zip`** a la ventana
   - Espera a que suba (1-2 minutos)
   - Verás: "Deployment successful"

7. **Reiniciar App Service:**
   - Vuelve a Azure Portal → mini-banco77
   - Click en **"Reiniciar"** (Restart)

8. **Espera 2 minutos** y prueba:
   - https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/login.html

---

## 📁 METODO 3: CON VS CODE (5 min)

Si tienes VS Code:

1. **Instala extensión de Azure:**
   - Abre VS Code
   - Extensions (Ctrl+Shift+X)
   - Busca: "Azure App Service"
   - Instala

2. **Login en Azure:**
   - Click en ícono de Azure en la barra lateral
   - Sign in to Azure

3. **Desplegar:**
   - Clic derecho en carpeta del proyecto
   - "Deploy to Web App"
   - Selecciona: mini-banco77
   - Confirma

---

## 🐙 METODO 4: CON GIT (Si tienes Git instalado)

1. **Abre PowerShell en el proyecto:**
```powershell
cd C:\Users\USER\Downloads\claurst-main\claurst-main
```

2. **Inicializar Git (si no está):**
```powershell
git init
git add .
git commit -m "Deploy to Azure"
```

3. **Configurar remote de Azure:**
```powershell
# Obtener URL de Git desde Azure Portal:
# mini-banco77 -> Deployment Center -> Local Git URL
# Será algo como: https://mini-banco77.scm.azurewebsites.net:443/mini-banco77.git

git remote add azure [URL-DE-GIT]
git push azure master
```

---

## ✅ VERIFICAR QUE FUNCIONÓ

Después de desplegar por cualquier método:

1. **Espera 2-3 minutos**

2. **Ejecuta en PowerShell:**
```powershell
.\test-produccion.ps1
```

3. **Deberías ver:**
```
[Test 1] Verificando sitio principal...
   [OK] Sitio accesible (HTTP 200)

[Test 2] Verificando backend...
   [OK] Backend funcionando ✅
      Estado: OK
      Base de datos: connected

[Test 3] Verificando pagina de login...
   [OK] Login accesible ✅
```

4. **Abre en navegador:**
```
https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/login.html
```

---

## 🚨 SI ALGO FALLA DESPUÉS DEL DESPLIEGUE

### Ver logs:
```powershell
# Si tienes Azure CLI:
az webapp log tail --name mini-banco77 --resource-group mini-banco77_group

# O en Azure Portal:
mini-banco77 -> Monitoring -> Log stream
```

### Errores comunes:

**"Cannot connect to SQL Server"**
- Firewall SQL no configurado
- Solución: miservidorbr → Redes → Activar "Permitir servicios de Azure"

**"Module not found"**
- package.json no se procesó
- Solución: Verificar que package.json esté en la raíz del ZIP

**"Port 8080 already in use"**
- Reiniciar el App Service

---

## 💡 RECOMENDACIÓN

**MÉTODO 1** (despliegue-rapido.ps1) es el más fácil y rápido.

Si Azure CLI no funciona en tu terminal actual:
1. Cierra PowerShell
2. Abre NUEVA PowerShell
3. cd al proyecto
4. .\despliegue-rapido.ps1

---

## 📊 RESUMEN

**Estado actual:**
- ❌ Código NO está en Azure (por eso HTTP 404)
- ✅ Variables de entorno configuradas
- ✅ App Service activo

**Acción requerida:**
- 🚀 Desplegar código (cualquier método de arriba)
- ⏱️ Esperar 2-3 minutos
- ✅ Verificar con test-produccion.ps1
- 🎉 ¡Usar tu app!

---

**¿Cuál método prefieres usar?**

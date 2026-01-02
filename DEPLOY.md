# 🚀 Deploy serguz.dev en Vercel

## Pasos para Desplegar:

### 1. Crear Repositorio en GitHub

```bash
git init
git add .
git commit -m "Initial commit - serguz.dev"
```

Luego crea un repositorio en GitHub y sube el código:
```bash
git remote add origin https://github.com/TU_USUARIO/serguz.dev.git
git branch -M main
git push -u origin main
```

### 2. Desplegar en Vercel

1. Ve a [https://vercel.com](https://vercel.com)
2. Inicia sesión con GitHub
3. Haz clic en **"Add New Project"**
4. Importa tu repositorio `serguz.dev`
5. Vercel detectará automáticamente la configuración

### 3. Configurar Variables de Entorno

En la página de configuración del proyecto en Vercel, agrega estas variables:

```
GOOGLE_CLIENT_ID=tu_client_id_aqui
GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
GOOGLE_REDIRECT_URI=https://TU_DOMINIO.vercel.app/api/auth/callback
GOOGLE_REFRESH_TOKEN=tu_refresh_token_aqui
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password_aqui
TIMEZONE=America/Mexico_City
```

⚠️ **IMPORTANTE**: 
- Usa las credenciales de tu archivo `.env` local
- Después de desplegar, actualiza `GOOGLE_REDIRECT_URI` con tu dominio real de Vercel

### 4. Actualizar Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edita tu OAuth client ID
3. Agrega a "URIs de redirección autorizadas":
   ```
   https://TU_DOMINIO.vercel.app/api/auth/callback
   ```

### 5. Regenerar Refresh Token (Solo si es necesario)

Si cambias el redirect URI, necesitarás un nuevo refresh token:
1. Despliega el proyecto
2. Ve a `https://TU_DOMINIO.vercel.app/api/auth/google`
3. Sigue el flujo de autenticación
4. Actualiza la variable `GOOGLE_REFRESH_TOKEN` en Vercel

### 6. ¡Listo!

Tu sitio estará disponible en: `https://TU_PROYECTO.vercel.app`

## 🎨 Dominio Personalizado

En Vercel puedes agregar tu dominio personalizado:
1. Ve a Settings → Domains
2. Agrega tu dominio (ej: `serguz.dev`)
3. Configura los DNS según Vercel te indique

## 📝 Archivos Importantes

- `/api/*.js` - Serverless functions (backend)
- `/public/*` - Archivos estáticos (frontend)
- `vercel.json` - Configuración de Vercel
- `.env` - Variables locales (NO subir a GitHub)

## 🔒 Seguridad

El archivo `.gitignore` ya está configurado para NO subir:
- `.env` (credenciales locales)
- `node_modules`
- Archivos temporales

Las credenciales van como variables de entorno en Vercel.

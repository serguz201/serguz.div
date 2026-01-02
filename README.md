# 📅 Sistema de Agendamiento - serguz.dev

Sistema completo de reservas con integración a Google Calendar y Google Meet para tu agencia de desarrollo web.

## ✨ Características

- 📱 **Responsive Design** - Optimizado para móviles, tablets y desktop
- 📅 **Calendario Interactivo** - Similar a Cal.com/Calendly
- 🎥 **Google Meet Automático** - Genera enlaces de videollamada
- 📧 **Notificaciones Email** - Confirmaciones automáticas
- 🔒 **Google Calendar API** - Sincronización bidireccional
- ⚡ **Backend Node.js** - API REST simple y eficiente

## 🚀 Instalación

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Google Calendar API

#### A. Crear Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la **Google Calendar API**:
   - Menu → APIs & Services → Library
   - Busca "Google Calendar API"
   - Click en "Enable"

#### B. Crear Credenciales OAuth 2.0

1. Ve a APIs & Services → Credentials
2. Click "Create Credentials" → "OAuth client ID"
3. Tipo de aplicación: **Web application**
4. Nombre: `serguz.dev Booking`
5. URIs de redirección autorizadas:
   ```
   http://localhost:3000/api/auth/callback
   ```
6. Guarda el **Client ID** y **Client Secret**

#### C. Obtener Refresh Token

1. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con tus credenciales:
   ```env
   GOOGLE_CLIENT_ID=tu_client_id_aqui
   GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
   ```

3. Inicia el servidor:
   ```bash
   npm start
   ```

4. Visita en tu navegador:
   ```
   http://localhost:3000/api/auth/google
   ```

5. Copia el URL generado y pégalo en el navegador
6. Autoriza la aplicación con tu cuenta de Google
7. Copia el **Refresh Token** que aparece
8. Agrégalo al archivo `.env`:
   ```env
   GOOGLE_REFRESH_TOKEN=tu_refresh_token_aqui
   ```

### 3. Configurar Email (Gmail)

#### Obtener App Password

1. Ve a tu [Cuenta de Google](https://myaccount.google.com/)
2. Seguridad → Verificación en dos pasos (actívala si no está activa)
3. Busca "Contraseñas de aplicaciones"
4. Genera una nueva contraseña para "Mail"
5. Copia la contraseña de 16 caracteres

#### Configurar en .env

```env
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # App password
```

### 4. Archivo .env Completo

```env
PORT=3000

# Google Calendar API
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
GOOGLE_REFRESH_TOKEN=1//0abc123

# Email
EMAIL_USER=contacto@serguz.dev
EMAIL_PASSWORD=abcd efgh ijkl mnop

# Timezone
TIMEZONE=America/Mexico_City
```

## 🎯 Uso

### Iniciar Servidor

```bash
# Modo producción
npm start

# Modo desarrollo (auto-reload)
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

### Endpoints API

#### 1. Obtener disponibilidad
```http
GET /api/availability?date=2026-01-15
```

**Respuesta:**
```json
{
  "availableSlots": ["10:00", "11:00", "14:00", "15:00"]
}
```

#### 2. Crear reserva
```http
POST /api/bookings
Content-Type: application/json

{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "date": "2026-01-15",
  "time": "10:00",
  "type": "Consultoría Angular",
  "message": "Necesito ayuda con arquitectura"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Cita creada exitosamente",
  "eventId": "abc123xyz",
  "meetLink": "https://meet.google.com/abc-defg-hij"
}
```

#### 3. Health Check
```http
GET /api/health
```

## 📁 Estructura del Proyecto

```
serguz.dev/
├── index.html          # Landing page responsive
├── server.js           # Backend API
├── package.json        # Dependencias
├── .env               # Variables de entorno (crear desde .env.example)
├── .env.example       # Plantilla de variables
└── README.md          # Esta documentación
```

## 🎨 Personalización

### Horarios Disponibles

Edita en `server.js` línea ~70:

```javascript
const workingHours = [
  '09:00', '10:00', '11:00', '12:00', 
  '14:00', '15:00', '16:00', '17:00'
];
```

### Duración de Sesión

Edita en `server.js` línea ~98:

```javascript
endDateTime.setMinutes(endDateTime.getMinutes() + 60); // 60 minutos
```

### Zona Horaria

En `.env`:
```env
TIMEZONE=America/New_York  # Cambia según tu ubicación
```

Y en `server.js` línea ~106:
```javascript
timeZone: 'America/New_York',
```

### Colores y Diseño

El HTML usa Tailwind CSS. Edita los colores en `index.html` línea ~13:

```javascript
colors: {
  "primary": "#ffffff",
  "accent": "#333333",
  "background-dark": "#050505",
}
```

## 🔧 Troubleshooting

### Error: "Invalid Credentials"
- Verifica que Client ID y Secret sean correctos
- Regenera el Refresh Token

### Error: "Calendar API has not been used"
- Asegúrate de habilitar Google Calendar API en Cloud Console
- Espera 5-10 minutos para que se propague

### No llegan emails
- Verifica que el App Password sea correcto
- Revisa la carpeta de spam
- Confirma que la verificación en 2 pasos esté activa

### Refresh Token no funciona
- Asegúrate de autorizar con la cuenta correcta
- Verifica que el Redirect URI coincida exactamente
- Regenera las credenciales OAuth si es necesario

## 🌐 Producción

### 1. Actualizar Variables

```env
GOOGLE_REDIRECT_URI=https://serguz.dev/api/auth/callback
EMAIL_USER=contacto@serguz.dev
```

### 2. Regenerar Refresh Token

Repite el proceso de autenticación con el nuevo Redirect URI.

### 3. Deploy

#### Opción A: VPS (DigitalOcean, AWS, etc)

```bash
# Instalar PM2
npm install -g pm2

# Iniciar servidor
pm2 start server.js --name serguz-booking

# Auto-inicio
pm2 startup
pm2 save
```

#### Opción B: Heroku

```bash
# Login
heroku login

# Crear app
heroku create serguz-booking

# Set variables
heroku config:set GOOGLE_CLIENT_ID=tu_id
heroku config:set GOOGLE_CLIENT_SECRET=tu_secret
# ... etc

# Deploy
git push heroku main
```

#### Opción C: Vercel (Serverless)

Convierte las rutas a funciones serverless en `/api`.

## 📊 Siguientes Pasos

1. ✅ **Implementado**: Sistema de calendario
2. ✅ **Implementado**: Integración Google Calendar
3. ✅ **Implementado**: Notificaciones email
4. 🔜 **Pendiente**: Pagos con Stripe (sesiones pagas)
5. 🔜 **Pendiente**: Panel admin para gestionar citas
6. 🔜 **Pendiente**: Recordatorios automáticos
7. 🔜 **Pendiente**: Integración con CRM

## 🤝 Soporte

Para dudas o problemas:
- Email: contacto@serguz.dev
- WhatsApp: [Tu número]

## 📄 Licencia

MIT License - serguz.dev 2026

---

**¡Hecho con ❤️ por serguz.dev!**

const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Google Calendar Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set credentials if you have a refresh token
if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
}

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Email setup (usando Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // App password de Gmail
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Route: Get available time slots
app.get('/api/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Obtener eventos del calendario
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const bookedSlots = response.data.items.map(event => ({
      start: event.start.dateTime,
      end: event.end.dateTime
    }));

    // Horarios de trabajo (10:00 - 18:00)
    const workingHours = [
      '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'
    ];

    // Filtrar horarios ocupados
    const availableSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':');
      const slotTime = new Date(date);
      slotTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      return !bookedSlots.some(booked => {
        const bookedStart = new Date(booked.start);
        const bookedEnd = new Date(booked.end);
        return slotTime >= bookedStart && slotTime < bookedEnd;
      });
    });

    res.json({ availableSlots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
});

// Route: Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { name, email, date, time, type, message } = req.body;

    // Validación
    if (!name || !email || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Crear fecha de inicio y fin
    const [hours, minutes] = time.split(':');
    const startDateTime = new Date(date);
    startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + 30); // Sesión de 30 minutos

    // Crear evento en Google Calendar
    const event = {
      summary: `Consulta: ${name} - ${type || 'General'}`,
      description: `Cliente: ${name}\nEmail: ${email}\nTipo: ${type || 'No especificado'}\nMensaje: ${message || 'N/A'}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Mexico_City', // Ajustar según tu zona horaria
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
      attendees: [
        { email: email }
      ],
      conferenceData: {
        createRequest: {
          requestId: `serguz-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 día antes
          { method: 'popup', minutes: 30 }, // 30 minutos antes
        ],
      },
    };

    const calendarResponse = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all'
    });

    const meetLink = calendarResponse.data.conferenceData?.entryPoints?.[0]?.uri;

    // Enviar email de confirmación al cliente
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '✅ Confirmación de cita - serguz.dev',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 20px;">
          <div style="text-align: center; padding: 20px; border-bottom: 1px solid #333;">
            <h1 style="margin: 0; font-size: 24px;">serguz.dev</h1>
          </div>
          
          <div style="padding: 30px 20px;">
            <h2 style="color: #fff; margin-bottom: 20px;">¡Cita Confirmada!</h2>
            
            <p style="color: #ccc; margin-bottom: 20px;">
              Hola <strong>${name}</strong>,
            </p>
            
            <p style="color: #ccc; margin-bottom: 30px;">
              Tu sesión de consultoría ha sido confirmada. Aquí están los detalles:
            </p>
            
            <div style="background: #111; border: 1px solid #333; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
              <p style="margin: 10px 0; color: #ccc;">
                <strong style="color: #fff;">📅 Fecha:</strong> ${startDateTime.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p style="margin: 10px 0; color: #ccc;">
                <strong style="color: #fff;">🕐 Hora:</strong> ${time}
              </p>
              <p style="margin: 10px 0; color: #ccc;">
                <strong style="color: #fff;">⏱ Duración:</strong> 30 minutos
              </p>
              <p style="margin: 10px 0; color: #ccc;">
                <strong style="color: #fff;">📝 Tipo:</strong> ${type || 'Consultoría General'}
              </p>
              ${meetLink ? `
                <p style="margin: 10px 0; color: #ccc;">
                  <strong style="color: #fff;">🎥 Link de reunión:</strong><br/>
                  <a href="${meetLink}" style="color: #4285f4; text-decoration: none;">${meetLink}</a>
                </p>
              ` : ''}
            </div>
            
            <p style="color: #ccc; margin-bottom: 20px;">
              <strong>Qué esperar:</strong>
            </p>
            <ul style="color: #ccc; padding-left: 20px;">
              <li style="margin-bottom: 10px;">Análisis técnico de tu proyecto</li>
              <li style="margin-bottom: 10px;">Recomendaciones de arquitectura</li>
              <li style="margin-bottom: 10px;">Estimación de tiempos y costos</li>
            </ul>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; text-align: center;">
              <p style="color: #666; font-size: 12px;">
                Si necesitas reagendar o cancelar, responde a este email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    // Enviar notificación al dueño
    const ownerNotification = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Tu email
      subject: `🔔 Nueva cita agendada - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Nueva cita agendada</h2>
          <p><strong>Cliente:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Fecha:</strong> ${startDateTime.toLocaleDateString('es-ES')}</p>
          <p><strong>Hora:</strong> ${time}</p>
          <p><strong>Tipo:</strong> ${type || 'No especificado'}</p>
          <p><strong>Mensaje:</strong> ${message || 'N/A'}</p>
          ${meetLink ? `<p><strong>Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
        </div>
      `
    };

    await transporter.sendMail(ownerNotification);

    res.json({ 
      success: true, 
      message: 'Cita creada exitosamente',
      eventId: calendarResponse.data.id,
      meetLink: meetLink
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Error al crear la cita' });
  }
});

// Route: Get Google OAuth URL
app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  });
  res.json({ authUrl: url });
});

// Route: OAuth Callback
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    console.log('Refresh Token:', tokens.refresh_token);
    console.log('Access Token:', tokens.access_token);
    
    res.send(`
      <h1>Autenticación exitosa!</h1>
      <p>Copia este refresh token a tu archivo .env:</p>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 4px;">${tokens.refresh_token}</pre>
    `);
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Error en la autenticación');
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📅 Calendar API ready`);
});

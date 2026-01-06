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
app.use(express.static('.'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

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

    // Parse date as YYYY-MM-DD (from client in Lima timezone)
    const [year, month, day] = date.split('-').map(Number);
    console.log(`[SERVER] Checking date: ${date} (${year}-${month}-${day})`);
    
    // Lima is UTC-5
    // So: 2026-01-05 00:00 Lima = 2026-01-05 05:00 UTC
    // And: 2026-01-05 23:59 Lima = 2026-01-06 04:59 UTC
    const startOfDayUTC = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
    const endOfDayUTC = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0, 0));
    
    console.log(`[SERVER] UTC range: ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

    // Obtener eventos del calendario
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDayUTC.toISOString(),
      timeMax: endOfDayUTC.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'America/Lima'
    });

    console.log(`[SERVER] Found ${response.data.items.length} events`);
    response.data.items.forEach(event => {
      console.log(`[SERVER] Event: ${event.summary} - ${event.start.dateTime} to ${event.end.dateTime}`);
    });

    const bookedSlots = response.data.items
      .filter(event => event.start.dateTime)
      .map(event => ({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime)
      }));

    // Horarios de trabajo en Lima: 09:00-13:00 y 16:00-23:00 (11 slots de 1 hora)
    const workingHours = [
      '09:00', '10:00', '11:00', '12:00',
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
    ];

    console.log(`[SERVER] Horarios disponibles: ${workingHours.join(', ')}`);

    // Filtrar horarios ocupados - Crear horarios en UTC igual que api/availability.js
    const availableSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':').map(Number);
      
      // Create UTC times (adding 5 hours offset from Lima time)
      const startHourUTC = hours + 5;
      const slotStartUTC = new Date(Date.UTC(year, month - 1, day, startHourUTC, minutes, 0, 0));
      const slotEndUTC = new Date(Date.UTC(year, month - 1, day, startHourUTC + 1, minutes, 0, 0));

      console.log(`[SERVER] Checking ${time}: ${slotStartUTC.toISOString()} to ${slotEndUTC.toISOString()}`);

      return !bookedSlots.some(booked => {
        const isOverlap = slotStartUTC < booked.end && slotEndUTC > booked.start;
        if (isOverlap) {
          console.log(`[SERVER]   BOOKED: overlaps with ${booked.start} to ${booked.end}`);
        }
        return isOverlap;
      });
    });

    console.log(`[SERVER] Slots disponibles después de filtrar: ${availableSlots.join(', ')}`);
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

    console.log('[BOOKING] ===== INICIO DE BOOKING =====');
    console.log('[BOOKING] Datos recibidos:', { date, time, name, email });

    // Validación
    if (!name || !email || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // SOLUCIÓN: Usar la fecha y hora TAL CUAL vienen del cliente
    // El formato es: date = "2026-01-07", time = "10:00"
    // Creamos datetime string sin conversión a UTC
    const [year, month, day] = date.split('-');
    const startDateTimeStr = `${date}T${time}:00`;
    
    // Calcular hora de fin (+30 minutos)
    const [hours, minutes] = time.split(':');
    const endMinutes = parseInt(minutes) + 30;
    let endHour = parseInt(hours);
    let endMin = endMinutes;
    if (endMinutes >= 60) {
      endHour += 1;
      endMin = endMinutes - 60;
    }
    const endDateTimeStr = `${date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;
    
    console.log('[BOOKING] startDateTime:', startDateTimeStr);
    console.log('[BOOKING] endDateTime:', endDateTimeStr);

    // Crear evento en Google Calendar
    const event = {
      summary: `Consulta: ${name} - ${type || 'General'}`,
      description: `Cliente: ${name}\nEmail: ${email}\nTipo: ${type || 'No especificado'}\nMensaje: ${message || 'N/A'}`,
      start: {
        dateTime: startDateTimeStr,
        timeZone: 'America/Lima',
      },
      end: {
        dateTime: endDateTimeStr,
        timeZone: 'America/Lima',
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

    // Formatear fecha para el email usando los valores originales (sin conversión UTC)
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    
    // Calcular día de la semana usando UTC para evitar conversiones
    const tempDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    const dayOfWeek = dayNames[tempDate.getUTCDay()];
    const monthName = monthNames[parseInt(month) - 1];
    const formattedDate = `${dayOfWeek}, ${parseInt(day)} de ${monthName} de ${year}`;
    
    console.log('[BOOKING] Fecha formateada para email:', formattedDate);

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
                <strong style="color: #fff;">📅 Fecha:</strong> ${formattedDate}
              </p>
              <p style="margin: 10px 0; color: #ccc;">
                <strong style="color: #fff;">🕐 Hora:</strong> ${time} (Hora Lima - Perú)
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
    const shortFormattedDate = `${parseInt(day)}/${parseInt(month)}/${year}`;
    const ownerNotification = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Tu email
      subject: `🔔 Nueva cita agendada - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Nueva cita agendada</h2>
          <p><strong>Cliente:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Fecha:</strong> ${shortFormattedDate}</p>
          <p><strong>Hora:</strong> ${time} (Hora Lima)</p>
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

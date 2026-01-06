const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Google Calendar Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
}

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, date, time, type, message } = req.body;

    if (!name || !email || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [hours, minutes] = time.split(':');
    
    // Crear fecha en zona horaria de Lima (UTC-5)
    // El date viene como YYYY-MM-DD desde el cliente (siempre en Lima)
    const [year, month, day] = date.split('-');
    
    // Crear string ISO con offset de Lima explícito (-05:00)
    // Esto asegura que Google Calendar interprete correctamente la hora en zona horaria Lima
    const startDateTimeStr = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-05:00`;
    const endHours = (parseInt(hours) + 1).toString().padStart(2, '0');
    const endDateTimeStr = `${year}-${month}-${day}T${endHours}:${String(minutes).padStart(2, '0')}:00-05:00`;

    const event = {
      summary: `Consulta: ${name} - ${type || 'General'}`,
      description: `Cliente: ${name}\nEmail: ${email}\nTeléfono: ${req.body.phone || 'No proporcionado'}\nTipo: ${type || 'No especificado'}\nMensaje: ${message || 'N/A'}`,
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
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
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

    // Email al cliente
    // Crear objeto Date para mostrar la fecha en el email correctamente
    const startDate = new Date(`${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
    
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
                <strong style="color: #fff;">📅 Fecha:</strong> ${startDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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

    // Email al dueño
    const ownerNotification = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `🔔 Nueva cita agendada - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Nueva cita agendada</h2>
          <p><strong>Cliente:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Fecha:</strong> ${startDate.toLocaleDateString('es-ES')}</p>
          <p><strong>Hora:</strong> ${time} (Hora Lima - Perú)</p>
          <p><strong>Tipo:</strong> ${type || 'No especificado'}</p>
          <p><strong>Mensaje:</strong> ${message || 'N/A'}</p>
          ${meetLink ? `<p><strong>Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
        </div>
      `
    };

    await transporter.sendMail(ownerNotification);

    // Email de recordatorio al dueño
    const reminderEmail = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `📝 Recordatorio: Cita con ${name} - ${startDate.toLocaleDateString('es-ES')} ${time}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107;">
          <h2 style="color: #856404; margin-bottom: 15px;">📅 Recordatorio de Cita</h2>
          <div style="background: white; padding: 15px; border-radius: 4px; color: #333;">
            <p><strong>Cliente:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Teléfono:</strong> ${req.body.phone || 'No proporcionado'}</p>
            <p><strong>Fecha:</strong> ${startDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Hora:</strong> ${time} (Hora Lima - Perú)</p>
            <p><strong>Tipo:</strong> ${type || 'No especificado'}</p>
            ${meetLink ? `<p><strong>🎥 Meet:</strong> <a href="${meetLink}">${meetLink}</a></p>` : ''}
          </div>
          <p style="color: #666; font-size: 12px; margin-top: 15px;">Este es un recordatorio automático de tu sistema de citas.</p>
        </div>
      `
    };

    await transporter.sendMail(reminderEmail);
    
    return res.json({
      success: true, 
      message: 'Cita creada exitosamente',
      eventId: calendarResponse.data.id,
      meetLink: meetLink
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Error al crear la cita' });
  }
};

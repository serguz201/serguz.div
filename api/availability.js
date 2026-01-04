const { google } = require('googleapis');
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

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    // Parse date as YYYY-MM-DD
    const [year, month, day] = date.split('-').map(Number);
    
    // Create date range for Lima timezone (UTC-5)
    // Start: 2026-01-04 00:00:00 Lima time = 2026-01-04 05:00:00 UTC
    // End: 2026-01-04 23:59:59 Lima time = 2026-01-05 04:59:59 UTC
    const startOfDayLima = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0)); // 00:00 Lima = 05:00 UTC
    const endOfDayLima = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0, 0)); // 00:00 next day Lima = 05:00 UTC next day

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDayLima.toISOString(),
      timeMax: endOfDayLima.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'America/Lima'
    });

    const bookedEventSlots = response.data.items
      .filter(event => event.start.dateTime) // Only include events with specific times
      .map(event => ({
        start: event.start.dateTime,
        end: event.end.dateTime
      }));

    // Working hours: 9am-1pm (09:00-13:00) and 4pm-11pm (16:00-23:00) in Lima timezone
    const workingHours = [
      '09:00', '10:00', '11:00', '12:00', // 9am-1pm
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00' // 4pm-11pm
    ];

    // Create slot times using Lima timezone
    const availableSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':');
      
      // Create time in Lima timezone
      const limaTime = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes), 0, 0);
      // Convert to ISO string considering Lima is UTC-5
      const slotStart = new Date(limaTime.getTime() + (5 * 60 * 60 * 1000)); // Add 5 hours for UTC
      
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotEnd.getHours() + 1);

      // Check if any booked event overlaps with this 1-hour slot
      return !bookedEventSlots.some(booked => {
        const bookedStart = new Date(booked.start);
        const bookedEnd = new Date(booked.end);
        return slotStart < bookedEnd && slotEnd > bookedStart;
      });
    });

    const bookedSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':');
      
      const limaTime = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes), 0, 0);
      const slotStart = new Date(limaTime.getTime() + (5 * 60 * 60 * 1000));
      
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotEnd.getHours() + 1);

      return bookedEventSlots.some(booked => {
        const bookedStart = new Date(booked.start);
        const bookedEnd = new Date(booked.end);
        return slotStart < bookedEnd && slotEnd > bookedStart;
      });
    });

    res.status(200).json({ availableSlots, bookedSlots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
};

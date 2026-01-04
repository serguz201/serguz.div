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

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const bookedEventSlots = response.data.items.map(event => ({
      start: event.start.dateTime,
      end: event.end.dateTime
    }));

    // Working hours: 9am-1pm (09:00-13:00) and 4pm-11pm (16:00-23:00)
    const workingHours = [
      '09:00', '10:00', '11:00', '12:00', // 9am-1pm
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00' // 4pm-11pm
    ];

    const availableSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':');
      const slotStart = new Date(date);
      slotStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Session duration is 1 hour
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotEnd.getHours() + 1);

      // Check if any booked event overlaps with this 1-hour slot
      return !bookedEventSlots.some(booked => {
        const bookedStart = new Date(booked.start);
        const bookedEnd = new Date(booked.end);
        // Overlap occurs if: slot starts before event ends AND slot ends after event starts
        return slotStart < bookedEnd && slotEnd > bookedStart;
      });
    });

    const bookedSlots = workingHours.filter(time => {
      const [hours, minutes] = time.split(':');
      const slotStart = new Date(date);
      slotStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
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

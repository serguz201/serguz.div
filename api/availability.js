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

    // Parse date as YYYY-MM-DD (this is in Lima timezone from client)
    const [year, month, day] = date.split('-').map(Number);
    
    // Create start and end of day in UTC considering Lima is UTC-5
    // When it's 2026-01-05 00:00:00 in Lima, it's 2026-01-05 05:00:00 UTC
    const startOfDayUTC = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
    const endOfDayUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDayUTC.toISOString(),
      timeMax: endOfDayUTC.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'America/Lima'
    });

    const bookedEventSlots = response.data.items
      .filter(event => event.start.dateTime) // Only events with specific times
      .map(event => ({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime)
      }));

    // Working hours in Lima timezone: 9am-1pm and 4pm-11pm
    const workingHours = [
      '09:00', '10:00', '11:00', '12:00', // 9am-1pm
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00' // 4pm-11pm
    ];

    // Check availability
    const availableSlots = [];
    const bookedSlots = [];

    workingHours.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      
      // Create slot start time in Lima timezone
      // Convert: 2026-01-05 09:00:00 Lima = 2026-01-05 14:00:00 UTC
      const slotStartLima = new Date(year, month - 1, day, hours, minutes, 0, 0);
      const slotStartUTC = new Date(slotStartLima.getTime() + (5 * 60 * 60 * 1000));
      
      const slotEndUTC = new Date(slotStartUTC.getTime() + (60 * 60 * 1000)); // 1 hour duration

      // Check if slot overlaps with any booked event
      const isBooked = bookedEventSlots.some(event => {
        return slotStartUTC < event.end && slotEndUTC > event.start;
      });

      if (isBooked) {
        bookedSlots.push(time);
      } else {
        availableSlots.push(time);
      }
    });

    res.status(200).json({ availableSlots, bookedSlots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
};
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
};

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

    // Parse date as YYYY-MM-DD (from client in Lima timezone)
    const [year, month, day] = date.split('-').map(Number);
    console.log(`[AVAILABILITY] Checking date: ${date} (${year}-${month}-${day})`);
    console.log(`[AVAILABILITY] WORKING HOURS: 09:00-12:00, 16:00-22:00 (11 total slots)`);
    
    // Lima is UTC-5
    // So: 2026-01-07 00:00 Lima = 2026-01-07 05:00 UTC
    // And: 2026-01-07 23:59 Lima = 2026-01-08 04:59 UTC
    const startOfDayUTC = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
    const endOfDayUTC = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0, 0));
    
    console.log(`[AVAILABILITY] UTC range: ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDayUTC.toISOString(),
      timeMax: endOfDayUTC.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'America/Lima'
    });

    console.log(`[AVAILABILITY] Found ${response.data.items.length} events`);
    
    // Convert all events to UTC dates
    const bookedEventSlots = response.data.items
      .filter(event => event.start.dateTime)
      .map(event => {
        console.log(`[AVAILABILITY] Event: ${event.summary} from ${event.start.dateTime} to ${event.end.dateTime}`);
        return {
          start: new Date(event.start.dateTime),
          end: new Date(event.end.dateTime)
        };
      });

    // Working hours in Lima: 9am-1pm and 4pm-11pm
    const workingHours = [
      '09:00', '10:00', '11:00', '12:00',
      '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
    ];

    const availableSlots = [];
    const bookedSlots = [];

    console.log(`[AVAILABILITY] Processing ${workingHours.length} working hour slots...`);

    workingHours.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      
      // IMPORTANT: Create UTC times directly
      // A 09:00 Lima time = 14:00 UTC (09 + 5)
      // A 22:00 Lima time = 03:00 UTC next day (22 + 5 = 27 = 3 next day)
      
      // Create start in UTC (adding 5 hours offset)
      const startHourUTC = hours + 5;
      const slotStartUTC = new Date(Date.UTC(year, month - 1, day, startHourUTC, minutes, 0, 0));
      
      // Create end in UTC (1 hour later, let Date.UTC handle day overflow)
      const endHourUTC = hours + 6;
      const slotEndUTC = new Date(Date.UTC(year, month - 1, day, endHourUTC, minutes, 0, 0));

      console.log(`[AVAILABILITY] Checking ${time} Lima = ${slotStartUTC.toISOString()} to ${slotEndUTC.toISOString()}`);

      // Check overlap with booked events
      const isBooked = bookedEventSlots.some(event => {
        return slotStartUTC < event.end && slotEndUTC > event.start;
      });

      if (isBooked) {
        console.log(`[AVAILABILITY] ${time} BOOKED`);
        bookedSlots.push(time);
      } else {
        console.log(`[AVAILABILITY] ${time} AVAILABLE`);
        availableSlots.push(time);
      }
    });

    console.log(`[AVAILABILITY] FINAL RESULT - Available: ${availableSlots.length}, Booked: ${bookedSlots.length}`);
    console.log(`[AVAILABILITY] Available slots: [${availableSlots.join(', ')}]`);
    console.log(`[AVAILABILITY] Booked slots: [${bookedSlots.join(', ')}]`);

    res.status(200).json({ availableSlots, bookedSlots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Error fetching availability' });
  }
};

import https from 'https';

export const startKeepAlive = (): void => {
  const SERVER_URL = process.env.SERVER_URL || ''
  
  // Render spins down after 15 mins of inactivity. We ping every 14 mins.
  const FOURTEEN_MINUTES = 14 * 60 * 1000;

  setInterval(() => {
    https.get(SERVER_URL, (res) => {
      console.log(`[Keep-Alive] Self-ping successful. Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('[Keep-Alive] Self-ping failed:', err.message);
    });
  }, FOURTEEN_MINUTES);

  console.log('🚀 [Keep-Alive] Self-ping timer initialized (14m interval).');
};
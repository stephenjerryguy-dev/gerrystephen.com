export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    clientId: process.env.SAPPY_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '',
  });
}

export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    clientId: process.env.SAPPY_X_CLIENT_ID || process.env.X_CLIENT_ID || '',
  });
}

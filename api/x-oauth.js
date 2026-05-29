import { rateLimit } from './_rate-limit.js';

const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const ME_URL = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,name';

export default async function handler(req, res) {
  if (rateLimit(req, res, { name: 'x-oauth', limit: 18, windowMs: 60_000 })) return;

  try {
    const clientId = process.env.SAPPY_X_CLIENT_ID || process.env.X_CLIENT_ID;
    const clientSecret = process.env.SAPPY_X_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
    const { code, verifier, redirectUri } = req.body || {};

    if (!clientId || !code || !verifier || !redirectUri) {
      res.status(400).json({ error: 'missing_x_oauth_config' });
      return;
    }

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (clientSecret) {
      headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const tokenResponse = await fetch(TOKEN_URL, { method: 'POST', headers, body });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      res.status(400).json({ error: 'x_token_exchange_failed' });
      return;
    }

    const userResponse = await fetch(ME_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    const user = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !user.data?.username) {
      res.status(400).json({ error: 'x_profile_fetch_failed' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ user: user.data });
  } catch (error) {
    res.status(500).json({ error: 'x_oauth_unavailable' });
  }
}

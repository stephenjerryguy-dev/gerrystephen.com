import { rateLimit } from './_rate-limit.js';

const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';
const DISCORD_API = 'https://discord.com/api/v10';

function roleColor(value) {
  const color = Number(value);
  if (!Number.isFinite(color) || color <= 0) return '#5865F2';
  return `#${color.toString(16).padStart(6, '0')}`;
}

async function getDiscordUser(accessToken) {
  const response = await fetch(USER_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!response.ok) return null;
  return response.json();
}

async function getMemberRoles(userId) {
  const guildId = process.env.SAPPY_DISCORD_GUILD_ID || process.env.DISCORD_GUILD_ID;
  const botToken = process.env.SAPPY_DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken || !userId) return [];

  const [memberResponse, rolesResponse] = await Promise.all([
    fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers: { authorization: `Bot ${botToken}`, accept: 'application/json' },
    }),
    fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: { authorization: `Bot ${botToken}`, accept: 'application/json' },
    }),
  ]);
  if (!memberResponse.ok || !rolesResponse.ok) return [];
  const member = await memberResponse.json();
  const roles = await rolesResponse.json();
  const owned = new Set(Array.isArray(member.roles) ? member.roles : []);
  return (Array.isArray(roles) ? roles : [])
    .filter((role) => owned.has(role.id) && role.name !== '@everyone')
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((role) => ({ id: role.id, name: role.name, color: roleColor(role.color), position: role.position || 0 }))
    .slice(0, 32);
}

export default async function handler(req, res) {
  if (rateLimit(req, res, { name: 'discord-oauth', limit: 18, windowMs: 60_000 })) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const clientId = process.env.SAPPY_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.SAPPY_DISCORD_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'missing_discord_oauth_config' });
      return;
    }

    const { code, redirectUri } = req.body || {};
    if (!code || !redirectUri) {
      res.status(400).json({ error: 'missing_code' });
      return;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      res.status(400).json({ error: token.error || 'discord_token_failed' });
      return;
    }

    const user = await getDiscordUser(token.access_token);
    if (!user?.id) {
      res.status(400).json({ error: 'discord_user_failed' });
      return;
    }

    const roles = await getMemberRoles(user.id);
    res.status(200).json({
      user: {
        id: user.id,
        username: user.global_name || user.username,
        handle: user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null,
      },
      roles,
    });
  } catch (error) {
    res.status(500).json({ error: 'discord_oauth_unavailable' });
  }
}

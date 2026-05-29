import { rateLimit } from "./_rate-limit.js";

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function fallbackSvg({ concept, style, aspectRatio }, index) {
  const [w, h] = aspectRatio === "16:9" ? [1280, 720]
    : aspectRatio === "9:16" ? [900, 1600]
      : aspectRatio === "4:3" ? [1200, 900]
        : [1024, 1024];
  const title = escapeHtml((concept || "Stay sappy").slice(0, 74));
  const label = escapeHtml((style || "viral").toUpperCase());
  const hue = (index * 41 + title.length * 7) % 360;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Sappy AI preview">
      <defs>
        <linearGradient id="bg${index}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue}, 86%, 78%)"/>
          <stop offset=".55" stop-color="#dff4ff"/>
          <stop offset="1" stop-color="hsl(${(hue + 68) % 360}, 80%, 86%)"/>
        </linearGradient>
        <filter id="shadow${index}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#102a3d" flood-opacity=".28"/>
        </filter>
      </defs>
      <rect width="${w}" height="${h}" rx="${Math.round(Math.min(w, h) * .045)}" fill="url(#bg${index})"/>
      <circle cx="${w * .78}" cy="${h * .18}" r="${Math.min(w, h) * .18}" fill="#fff" opacity=".42"/>
      <circle cx="${w * .2}" cy="${h * .82}" r="${Math.min(w, h) * .25}" fill="#1e93d6" opacity=".14"/>
      <g filter="url(#shadow${index})" transform="translate(${w * .5} ${h * .49})">
        <ellipse cx="0" cy="${h * .2}" rx="${w * .17}" ry="${h * .035}" fill="#14354c" opacity=".18"/>
        <rect x="${-w * .16}" y="${-h * .2}" width="${w * .32}" height="${h * .36}" rx="${w * .13}" fill="#f8fbff"/>
        <circle cx="${-w * .055}" cy="${-h * .07}" r="${Math.min(w, h) * .014}" fill="#15202a"/>
        <circle cx="${w * .055}" cy="${-h * .07}" r="${Math.min(w, h) * .014}" fill="#15202a"/>
        <path d="M ${-w * .035} ${h * .015} Q 0 ${h * .04} ${w * .035} ${h * .015}" fill="none" stroke="#15202a" stroke-width="${Math.max(5, w * .006)}" stroke-linecap="round"/>
        <path d="M ${-w * .16} ${h * .02} Q ${-w * .26} ${h * .06} ${-w * .18} ${h * .16}" fill="#f8fbff"/>
        <path d="M ${w * .16} ${h * .02} Q ${w * .26} ${h * .06} ${w * .18} ${h * .16}" fill="#f8fbff"/>
      </g>
      <text x="${w * .06}" y="${h * .11}" font-family="Arial, sans-serif" font-size="${Math.max(22, w * .028)}" font-weight="900" fill="#15689b" letter-spacing="2">${label} PREVIEW</text>
      <text x="${w * .06}" y="${h * .9}" font-family="Arial, sans-serif" font-size="${Math.max(42, w * .062)}" font-weight="900" fill="#15202a">${title}</text>
      <text x="${w * .06}" y="${h * .95}" font-family="Arial, sans-serif" font-size="${Math.max(18, w * .018)}" font-weight="700" fill="#446274">Add XAI_API_KEY for rendered Grok image output</text>
    </svg>`;
}

function fallbackResponse(body) {
  const count = Math.max(1, Math.min(4, Number(body.n) || 2));
  return {
    provider: "fallback",
    plan: "Preview mode: the studio built production prompts and placeholder art. Add XAI_API_KEY on Vercel for real Grok/xAI image output.",
    images: Array.from({ length: count }, (_, i) => ({
      model: `prompt preview ${i + 1}`,
      svg: fallbackSvg(body, i),
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (rateLimit(req, res, { name: "sappy-generate-meme", limit: 8, windowMs: 60_000 })) return;

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const prompt = String(body.prompt || body.concept || "").trim();
  if (!prompt) return res.status(400).json({ error: "missing_prompt" });

  const key = process.env.XAI_API_KEY;
  if (!key) return res.status(200).json(fallbackResponse(body));

  try {
    const count = Math.max(1, Math.min(4, Number(body.n) || 2));
    const upstream = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality",
        prompt,
        n: count,
        aspect_ratio: body.aspectRatio || "1:1",
        response_format: "url",
      }),
    });
    if (!upstream.ok) throw new Error(`xai_${upstream.status}`);
    const json = await upstream.json();
    const images = (json.data || []).map((item, i) => ({
      model: json.model || process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality",
      url: item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""),
      revisedPrompt: item.revised_prompt,
      index: i,
    })).filter((item) => item.url);
    if (!images.length) throw new Error("empty_generation");
    return res.status(200).json({
      provider: "xai",
      plan: "Generated with the configured Grok/xAI image lane.",
      images,
    });
  } catch (error) {
    const fallback = fallbackResponse(body);
    fallback.plan = "The xAI image lane did not return an image, so the studio showed prompt previews instead. Check the provider key/model and try again.";
    return res.status(200).json(fallback);
  }
};

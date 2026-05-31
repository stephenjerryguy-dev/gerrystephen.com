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
      <text x="${w * .06}" y="${h * .95}" font-family="Arial, sans-serif" font-size="${Math.max(18, w * .018)}" font-weight="700" fill="#446274">Claude concept preview · seal-aware prompt direction</text>
    </svg>`;
}

function sealBrief(seal) {
  if (!seal) return '';
  const traits = Array.isArray(seal.traits)
    ? seal.traits.slice(0, 12).map((trait) => `${trait.trait_type || 'Trait'}: ${trait.value}`).join('; ')
    : '';
  return [
    `Seal reference: ${seal.name || `Sappy Seal #${seal.id || ''}`}.`,
    seal.id ? `Token ID: ${seal.id}.` : '',
    seal.image ? `Reference image URL: ${seal.image}.` : '',
    seal.outfitSummary ? `Visible outfit/trait summary: ${seal.outfitSummary}.` : traits ? `Traits: ${traits}.` : '',
  ].filter(Boolean).join(' ');
}

function fallbackResponse(body, claudePlan) {
  const count = Math.max(1, Math.min(4, Number(body.n) || 2));
  const concepts = Array.isArray(claudePlan?.concepts) ? claudePlan.concepts : [];
  return {
    provider: claudePlan ? "claude" : "fallback",
    plan: claudePlan?.plan || "Preview mode: add ANTHROPIC_API_KEY on Vercel for Claude-powered meme direction.",
    captions: claudePlan?.captions || [],
    images: Array.from({ length: count }, (_, i) => ({
      model: claudePlan ? `Claude concept ${i + 1}` : `prompt preview ${i + 1}`,
      revisedPrompt: concepts[i]?.prompt || body.prompt,
      caption: concepts[i]?.caption,
      referenceUrl: body.seal?.image,
      sealName: body.seal?.name,
      svg: fallbackSvg({ ...body, concept: concepts[i]?.caption || body.concept || body.prompt }, i),
    })),
  };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

async function buildClaudePlan(body, prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const count = Math.max(1, Math.min(4, Number(body.n) || 2));
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 1200,
      temperature: 0.8,
      system: "You are Gerry's AI Studio for the Sappy Seals ecosystem. Create polished, consumer-ready image-generation briefs for X memes. Preserve the provided Sappy Seal's exact outfit, visible traits, and identity. Keep it Sappy-native, never mention Okay Bears, and avoid generic AI slop.",
      messages: [{
        role: "user",
        content: `Return only valid JSON with keys plan, captions, concepts. concepts must have ${count} items. Each item needs caption and prompt. The prompt must explicitly preserve the seal traits and describe a finished illustrated scene, not a collage. ${sealBrief(body.seal)} User request: ${prompt}`,
      }],
    }),
  });
  if (!upstream.ok) throw new Error(`anthropic_${upstream.status}`);
  const json = await upstream.json();
  const text = (json.content || []).map((part) => part.text || "").join("\n").trim();
  const parsed = safeJson(text);
  if (!parsed) throw new Error("anthropic_bad_json");
  return {
    plan: parsed.plan || "Claude shaped the concept, caption direction, and premium prompt pack.",
    captions: Array.isArray(parsed.captions) ? parsed.captions : [],
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts.slice(0, count) : [],
    model: json.model || process.env.ANTHROPIC_MODEL || "claude",
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

  let claudePlan = null;
  try {
    claudePlan = await buildClaudePlan(body, prompt);
  } catch (error) {
    claudePlan = null;
  }

  return res.status(200).json(fallbackResponse(body, claudePlan));
};

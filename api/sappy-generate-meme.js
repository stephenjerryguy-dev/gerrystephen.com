import { rateLimit } from "./_rate-limit.js";

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
  const references = Array.isArray(body.references) ? body.references : [];
  return {
    provider: claudePlan ? "claude" : "fallback",
    plan: claudePlan?.plan || "Studio preview mode: add ANTHROPIC_API_KEY on Vercel for Claude scene direction. No fake image render is shown until a real image model is connected.",
    captions: claudePlan?.captions || [],
    images: Array.from({ length: count }, (_, i) => ({
      model: claudePlan ? `Claude scene pack ${i + 1}` : `scene pack ${i + 1}`,
      revisedPrompt: concepts[i]?.prompt || body.prompt,
      caption: concepts[i]?.caption || body.concept,
      scene: concepts[i]?.scene || body.concept,
      shot: concepts[i]?.shot || "Hero character scene",
      adaptationNotes: concepts[i]?.adaptationNotes || "Preserve the loaded NFT traits and adapt only the environment, pose, props, and story.",
      negativePrompt: concepts[i]?.negativePrompt || "No random seal, no changed trait set, no unrelated mascot, no distorted face, no illegible text.",
      referenceUrl: body.seal?.image,
      sealName: body.seal?.name,
      sceneReferenceUrl: references[i % Math.max(1, references.length)]?.url || references[0]?.url || "",
      sceneReferenceLabel: references[i % Math.max(1, references.length)]?.label || references[0]?.label || "Scene reference",
      kind: "scene-brief",
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
      max_tokens: 1500,
      temperature: 0.8,
      system: "You are Gerry's AI Studio for the Sappy Seals ecosystem. Create production-grade image-generation direction for Sappy Seal NFT scene adaptation. The loaded NFT is the character identity lock. Preserve the exact visible outfit, headwear, accessories, expression, body color, and recognizable silhouette. Transform the pose, lighting, props, and environment to match the user's scenario. Keep it Sappy-native, never mention Okay Bears, never invent another collection, and avoid generic AI slop.",
      messages: [{
        role: "user",
        content: `Return only valid JSON with keys plan, captions, concepts. concepts must have ${count} items. Each item needs caption, scene, shot, adaptationNotes, negativePrompt and prompt. The prompt must explicitly preserve the seal traits and describe a finished illustrated scene, not a collage and not a new character. Make the output ready for an image model that accepts NFT reference images. ${sealBrief(body.seal)} User request: ${prompt}`,
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

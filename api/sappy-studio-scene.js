const allowedScenes = new Set(["space", "beach", "sunset", "stage", "city", "meadow"]);

function fallback(prompt) {
  const text = String(prompt || "").toLowerCase();
  const scene = /space|moon|star|alien|ordinal/.test(text) ? "space"
    : /city|rooftop|night|twitter| x |post|timeline/.test(text) ? "city"
    : /stage|spotlight|concert|announce|reveal/.test(text) ? "stage"
    : /sunset|gold|orange|alpha|pump/.test(text) ? "sunset"
    : /meadow|omnia|quest|game|pet|world/.test(text) ? "meadow"
    : "beach";
  return {
    scene,
    caption: scene === "city" ? "POSTING THROUGH IT" : scene === "meadow" ? "ENTER OMNIA" : "STAY SAPPY",
    capColor: ["space", "city", "stage", "sunset"].includes(scene) ? "#ffffff" : "#15202a",
    rationale: "Local fallback generated a scene when hosted AI was unavailable.",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const prompt = String(req.body?.prompt || "").slice(0, 500);
  if (!prompt) return res.status(400).json({ error: "missing_prompt" });
  if (!process.env.OPENAI_API_KEY) return res.status(200).json(fallback(prompt));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.SAPPY_STUDIO_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "You turn Sappy Seals meme scene ideas into one of six preset scene keys and a short punchy caption. Return strict JSON only.",
          },
          {
            role: "user",
            content: `Scene presets: space, beach, sunset, stage, city, meadow. User idea: ${prompt}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "sappy_scene",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                scene: { type: "string", enum: ["space", "beach", "sunset", "stage", "city", "meadow"] },
                caption: { type: "string", maxLength: 32 },
                capColor: { type: "string", enum: ["#ffffff", "#15202a"] },
                rationale: { type: "string", maxLength: 120 },
              },
              required: ["scene", "caption", "capColor", "rationale"],
            },
          },
        },
      }),
    });

    if (!response.ok) throw new Error(`openai_${response.status}`);
    const json = await response.json();
    const text = json.output_text || json.output?.flatMap((item) => item.content || []).find((part) => part.text)?.text;
    const parsed = JSON.parse(text);
    if (!allowedScenes.has(parsed.scene)) throw new Error("bad_scene");
    return res.status(200).json(parsed);
  } catch (_) {
    return res.status(200).json(fallback(prompt));
  }
}

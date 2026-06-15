// Vercel Cron -> triggers the JerryQuant Live Agent reliably.
//
// Vercel's scheduler hits this route on schedule (see "crons" in vercel.json),
// it verifies the call is really from Vercel (CRON_SECRET), then POSTs a
// workflow_dispatch to GitHub so the live agent runs (propose -> you approve on
// mobile -> execute). Far more reliable than GitHub's own cron.
//
// Required Vercel environment variables (Project Settings -> Environment Variables):
//   GH_DISPATCH_TOKEN  = a GitHub fine-grained PAT (repo gerrystephen.com,
//                        Actions: Read and write)
//   CRON_SECRET        = any long random string (Vercel sends it as a Bearer
//                        token on cron calls; we reject anything else)
//
// Manual test once deployed:  /api/jerryquant-cron?phase=scan  with header
//   Authorization: Bearer <CRON_SECRET>

const REPO = 'stephenjerryguy-dev/gerrystephen.com';
const WORKFLOW = 'jerryquant-live-agent.yml';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GH_DISPATCH_TOKEN not set' });
  }
  const phase = (req.query && req.query.phase) === 'plan' ? 'plan' : 'scan';

  try {
    const r = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { phase } }),
      },
    );
    if (r.status === 204) {
      return res.status(200).json({ ok: true, dispatched: phase });
    }
    const text = await r.text();
    return res.status(502).json({ ok: false, github_status: r.status, github_body: text.slice(0, 300) });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e).slice(0, 200) });
  }
}

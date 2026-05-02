# Deploy gerrystephen.com

Three ways. Vercel is fastest for a custom domain.

## Option A — Vercel (recommended, ~3 min)

From this folder on your machine:

```sh
npx vercel@latest login        # one-time, opens browser
npx vercel@latest deploy --prod
```

You'll get a URL like `gerrystephen-xxx.vercel.app` immediately. Then attach the domain:

1. Go to the project in the Vercel dashboard → **Settings → Domains**.
2. Add `gerrystephen.com` and `www.gerrystephen.com`.
3. Vercel shows the DNS records to set. At your registrar (Namecheap / GoDaddy / Cloudflare):
   - Apex `gerrystephen.com` → `A` record `76.76.21.21`
   - `www` → `CNAME` `cname.vercel-dns.com.`
4. Wait 1–10 min for DNS to propagate. Vercel auto-issues the TLS cert.

## Option B — Netlify (drag and drop)

1. Open <https://app.netlify.com/drop>.
2. Drag this entire folder into the drop zone.
3. You'll get an instant URL.
4. **Site settings → Domain management → Add custom domain** → `gerrystephen.com`.
5. Netlify shows DNS records to set at your registrar.

## Option C — Cloudflare Pages

If your domain is already on Cloudflare DNS, this is the easiest for the domain step (no DNS change needed):

```sh
npx wrangler pages deploy .
```

Then in the Cloudflare dashboard → **Pages → Custom domains → Set up domain** → `gerrystephen.com`.

## Notes

- The site is fully static. No build step required.
- `index.html` is a copy of `Igloo.html` so the root URL serves the site. Both URLs work.
- Caching: HTML revalidates every 5 min, assets are immutable for 1 year (see `vercel.json`).
- When you have the actual Inkfinity Canvas piece images, drop them in `assets/` and tell me — I'll wire them in.

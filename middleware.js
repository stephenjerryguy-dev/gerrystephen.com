import { next, rewrite } from "@vercel/functions";

const SAPPY_HOST = "sappy.gerrystephen.com";

const PAGE_REWRITES = new Map([
  ["/", "/sappy.html"],
  ["/studio", "/sappy/studio.html"],
  ["/studio/", "/sappy/studio.html"],
  ["/sealfolio", "/sappy/sealfolio.html"],
  ["/sealfolio/", "/sappy/sealfolio.html"],
  ["/community", "/sappy/community.html"],
  ["/community/", "/sappy/community.html"],
  ["/ecosystem", "/sappy/ecosystem.html"],
  ["/ecosystem/", "/sappy/ecosystem.html"],
  ["/memes", "/sappy/memes.html"],
  ["/memes/", "/sappy/memes.html"],
  ["/x-callback", "/sappy/x-callback.html"],
  ["/discord-callback", "/sappy/discord-callback.html"],
]);

const OLD_SAPPY_PAGES = new Map([
  ["/sappy", "/"],
  ["/sappy/", "/"],
  ["/sappy/index.html", "/"],
  ["/sappy/studio", "/studio"],
  ["/sappy/studio/", "/studio"],
  ["/sappy/studio.html", "/studio"],
  ["/sappy/sealfolio", "/sealfolio"],
  ["/sappy/sealfolio/", "/sealfolio"],
  ["/sappy/sealfolio.html", "/sealfolio"],
  ["/sappy/community", "/community"],
  ["/sappy/community/", "/community"],
  ["/sappy/community.html", "/community"],
  ["/sappy/ecosystem", "/ecosystem"],
  ["/sappy/ecosystem/", "/ecosystem"],
  ["/sappy/ecosystem.html", "/ecosystem"],
  ["/sappy/memes", "/memes"],
  ["/sappy/memes/", "/memes"],
  ["/sappy/memes.html", "/memes"],
]);

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname !== SAPPY_HOST) return next();

  const cleanPath = OLD_SAPPY_PAGES.get(url.pathname);
  if (cleanPath) {
    url.pathname = cleanPath;
    return Response.redirect(url, 308);
  }

  const destination = PAGE_REWRITES.get(url.pathname);
  if (destination) {
    url.pathname = destination;
    return rewrite(url);
  }

  return next();
}

export const config = {
  matcher: ["/((?!api/).*)"],
};

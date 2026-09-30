# The Shelf

A static app-store-style landing page listing all of Suva's small apps, with cards
grouped by category, a share button, and a "save to home screen" flow. Same
deploy shape as the other projects on this account: static `public/` directory
served by a thin Cloudflare Worker via the assets binding.

Live at: https://apps.suvadipchakraborty.workers.dev/

## Structure

```
public/
  index.html          all page content + JSON-LD (full markup lives here for SEO)
  css/styles.css
  js/app.js            filter chips, share, save-to-home-screen, SW registration
  sw.js                network-first service worker (see note below)
  manifest.webmanifest
  robots.txt
  sitemap.xml
  favicon.ico
  assets/
    og-image.png       1200x630 link-preview image (PNG — social platforms don't
                        rasterize SVG for link previews)
    icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
src/worker.js           hands every request to the ASSETS binding
wrangler.toml
gen_assets.py            regenerates the PNGs above (Pillow) — not deployed,
                          keep it around for when you add/rename apps
```

## Deploy

1. Push this folder to a GitHub repo.
2. In the Cloudflare dashboard: Workers & Pages → Create → connect the repo.
3. Build settings: none needed (static assets + `[assets]` binding in
   `wrangler.toml` handle it). Root directory = repo root.
4. First deploy will publish to `apps.<your-workers-dev-subdomain>.workers.dev`.
   If your subdomain is `suvadipchakraborty`, that's
   `apps.suvadipchakraborty.workers.dev` — matches the URL baked into the
   meta tags, manifest, and sitemap already in this repo.

If you ever move it to a different subdomain or a custom domain, update the
absolute URLs in `public/index.html` (`og:url`, `og:image`, canonical,
JSON-LD) and `public/sitemap.xml` — they're hardcoded on purpose so the link
preview and structured data work correctly no matter what fetches them.

## Adding a new app to the shelf

1. Open `public/index.html`.
2. Copy one `<a class="card" data-cat="...">...</a>` block inside `#grid`,
   paste it before the "More on the way" card, and edit the link, icon,
   title, description and `data-cat` (`rankings`, `culture`, `discover`,
   `utility`, or `games` — or a new category, see below).
3. Add a matching entry to the `ItemList` in the JSON-LD `<script>` block
   near the top of the file, so search engines pick it up too.
4. Bump the footer count ("23 apps and counting" at the moment).
5. If it's a genuinely new category: add a `.chip` button in the filters
   row, a CSS rule `.card[data-cat="x"] { --accent: ... }` in `styles.css`,
   and pick an accent from the palette already defined at the top of
   `styles.css` (or add a new one).
6. Optional: bump the cache name in `public/sw.js` (`shelf-shell-v3` →
   `v4`) so any already-installed visitors' offline cache doesn't serve a
   stale shell. This is a network-first worker, so it's a minor nicety,
   not something that will hide your update.

No build step — commit and push, Cloudflare deploys it.

## Notes

- **Service worker is network-first** on purpose. An earlier project on
  this account (Cultural Compass) shipped a cache-first shell and it meant
  bug fixes silently never reached returning visitors until they cleared
  site data. This one always tries the network first and only falls back
  to cache when offline.
- **Save to home screen**: on Chrome/Android, the button uses the native
  `beforeinstallprompt` flow. iOS Safari doesn't allow triggering that
  programmatically, so there it opens a small instruction sheet instead
  ("tap Share → Add to Home Screen").
- **Share button** uses the Web Share API where available, and falls back
  to copying the link to the clipboard with a toast confirmation.
- Content is all in the static HTML (not injected by JS) so it's crawlable
  without needing JS execution — filtering is a progressive enhancement on
  top of that.

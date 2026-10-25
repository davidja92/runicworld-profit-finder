# RunicWorld GE Profit Finder v5.1 — live API connection fix

The site is static and free to host on GitHub Pages. The screenshot's "Failed to fetch" usually indicates CORS or network restrictions. This build adds **optional** Cloudflare Workers API relay for two public RunicWorld endpoints. Using the relay depends on RunicWorld allowing access; do not use it to bypass server-owner restrictions.

## A. Test the existing site first

1. On the published website, click **Use snapshot**. If that works, hosting and local JSON loading work.
2. Press **F12 → Console / Network**, click **Refresh live GE**, inspect the failing request. CORS error: proceed below with authorized proxy or ask RunicWorld to enable CORS. HTTP 403/429: upstream server restrictions, which a proxy may not solve; seek API owner permission.
3. Verify that `https://runicworld.com/api/site/ge/market` returns JSON in a regular browser tab. A working browser tab **does not** prove CORS is allowed.

## B. Deploy a free Cloudflare Worker

1. Create/sign in to a free Cloudflare account at https://dash.cloudflare.com/ . Select **Workers & Pages → Create → Worker** (label wording may vary).
2. Deploy a sample Worker. Open **Edit code** and replace all code with `cloudflare-worker.js` from this ZIP.
3. Choose **Deploy**. Copy its URL such as `https://runicworld-api.YOURNAME.workers.dev`.
4. Visit `YOUR_WORKER_URL/ge/market` in a browser. It should return JSON. Visit `YOUR_WORKER_URL/hiscores`. If it returns HTTP 502, check the upstream API and RunicWorld access policy; the Worker is **not** a guaranteed fix.
5. In `config.js`, change `proxyBase: ""` to `proxyBase: "https://runicworld-api.YOURNAME.workers.dev"` (your actual URL, no trailing slash).
6. Upload/replace **all** site files on GitHub Pages (`index.html`, `app.js`, `config.js`, `styles.css`, `data.json`, `market_snapshot.json`). The Worker JS can remain in the repository, but is not loaded by the browser.
7. Wait for GitHub Pages deployment to finish and hard-refresh (**Ctrl+Shift+R**). Test both **Refresh live GE** and **Fetch skills**.

You can also use `config.js` with a custom same-origin API proxy, if the server administrator provides one. Avoid public anonymous open proxies. No API keys are required or embedded.

## C. Still failing?

- `Network/CORS failure`: confirm `config.js` is loaded and contains the correct Worker URL, with `/ge/market` and `/hiscores` routes available. Read DevTools Console and Network panel.
- `HTTP 502`: the Worker could not reach an acceptable JSON upstream response. Check the original API, upstream access policy, or contact the RunicWorld administrator.
- `HTTP 403/429`: upstream blocks or rate limits; don't attempt to circumvent. Ask API owner for a supported endpoint or CORS permission.
- **Snapshot works but live doesn't**: the GP/hour calculator still works with snapshot prices until live API access is fixed.

## Cost and limits

GitHub Pages can host this static site for free on a public repo. Cloudflare Workers Free currently includes up to 100,000 requests/day and 10ms CPU time per request. It can be throttled or capped; no unlimited-use guarantee. The Worker caches the market for 60 seconds and hiscores for 180 seconds in a given cache location. Usage is governed by the upstream API's permission and limits.

Security: only fixed RunicWorld endpoints are supported, GET only, no arbitrary URLs, no keys. For broader deployment, change `ALLOWED_ORIGIN` from `*` to your exact website origin (e.g., `https://YOURNAME.github.io`) and enforce allowed browser origins in your Worker as needed.

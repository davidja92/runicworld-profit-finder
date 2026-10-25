# RunicWorld GE Profit Finder — browser edition v5

A static, free-to-host web app based on the standalone Python v4.1 calculator. No WoW addons, in-game client, Python hosting, node server, or visitor accounts needed.

## Quick start: GitHub Pages (free)

1. Register or sign in at https://github.com/ .
2. Go to https://github.com/new and create a **public** repository named `runicworld-profit-finder`. You may check **Add a README** if GitHub requires a first commit.
3. In the repository choose **Add file → Upload files**.
4. Open this ZIP on your computer and extract it. Upload these files to the repository **root** (not inside a parent folder):
   - `index.html`
   - `styles.css`
   - `app.js`
   - `data.json`
   - `market_snapshot.json`
   - `README.md` (optional)
5. Click **Commit changes**.
6. In the repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then click **Save**.
7. When GitHub reports a successful Pages deployment, open `https://YOUR_GITHUB_USERNAME.github.io/runicworld-profit-finder/`.
8. Test **Use snapshot**, **Fetch skills**, **Refresh live GE**, and **Export CSV**.
9. Share the public website URL. Visitors do not need GitHub accounts.

## Important: API browser access / CORS

This browser application directly fetches:
- https://runicworld.com/api/site/ge/market
- https://runicworld.com/api/site/hiscores

Browsers require that RunicWorld's API server permit requests from your GitHub Pages website. If the console shows a Cross-Origin Resource Sharing (CORS) error, this **cannot** be fixed purely in HTML or GitHub Pages. Ask the API owner to allow `Access-Control-Allow-Origin: *` on these public, unauthenticated GET endpoints, or configure a managed proxy with responsible caching, limits, and explicit permission to use the API. Do not expose private API keys in the browser.

If live API is blocked, the included market snapshot still loads, and you can manually import a downloaded GE or hiscores JSON file using **Import market/hiscores JSON**.

## Local testing on Windows

Do not double-click index.html to test the app: browsers often block JSON fetches from file:// URLs.

From the extracted folder, open PowerShell and run:

```
py -m http.server 8000
```

Then open http://localhost:8000/ in your browser. Stop the server with Ctrl+C. If `py` is not installed, deploy to GitHub Pages to test instead.

## Application usage

- Enter a RunicWorld username and click **Fetch skills**. The hiscores API returns players with numbered XP fields. Skill mapping follows the API's `skills` list or the v4.1 fallback. The standard RuneScape XP curve converts XP to levels 1–99. Missing skill IDs are treated as zero XP / level 1.
- Click **Refresh live GE** for market prices. The bundled `market_snapshot.json` is a fallback; it is not live.
- **Profit ranking** uses current skill requirements, quantities per hour and the existing Python v4.1 price rules. Incomplete prices show `INCOMPLETE`.
- **Edit methods** to adjust hours, inputs, outputs, skill requirements, notes, optional level-based rate profiles. Data is saved in the user's own browser (`localStorage`). No account synchronization.
- **Export CSV** downloads the current ranking.

## Rate profiles

The original Python app's rate scaling is ported. Leave a profile `null` for manual hourly assumptions. An optional documented rate profile example:

```json
{
  "skill":"Mining",
  "source":"https://oldschool.runescape.wiki/",
  "rates":[
    {"level":15,"actions_per_hour":300,"setup":"Example only; replace with a verified historical configuration"}
  ]
}
```

Do not treat the example rate as researched evidence. Only add production rates verified for 2007-era mechanics or clearly identified RunicWorld exceptions. The shipped defaults remain **illustrative, not verified per-hour measurements**. Lava Dragons are retained as a RunicWorld-specific addition.

## Cost and operational limits

GitHub Pages is available for **public repos** on GitHub Free, subject to GitHub Pages fair-use/resource limits and GitHub's applicable policies. A free site is not a promise of unlimited visitors. Live API traffic depends on RunicWorld's limits and CORS configuration; a free hosting plan does not make the API unlimited.

To update: replace files in the repository root and commit changes. GitHub Pages redeploys them automatically. If users need updated default methods, note that their older locally edited methods persist in browser storage until they press **Restore defaults**.

## Files

- `index.html` — interface
- `styles.css` — responsive dark theme
- `app.js` — browser calculations, API fetches and state
- `data.json` — extracted method/skill defaults from Python v4.1
- `market_snapshot.json` — offline price snapshot from Python v4.1

Source conversion note: This browser edition ports the method calculation, price fallback, and hiscores skill mapping from Python v4.1; it is not intended to claim modern OSRS rate data has been verified.

# Enable shared RunicWorld trade collection (site maintainer)

1. Upload **all** ZIP contents to the root of `davidja92/runicworld-profit-finder`, preserving folder paths, especially `.github/workflows/collect-trades.yml` and `scripts/collect_trades.py`.
2. In GitHub: Settings → Actions → General, enable workflow actions and set **Workflow permissions → Read and write permissions** (required to commit JSON).
3. Open Actions → **Collect RunicWorld trade volumes** → Run workflow.
4. Verify a successful run created `trade_history.json` and `trade_volume_summary.json` in root.
5. Verify https://davidja92.github.io/runicworld-profit-finder/trade_volume_summary.json is accessible; Pages may take a short time to publish.
6. Website users will see the shared volume data automatically. No Cloudflare changes required.

Runs every 15 minutes, subject to GitHub scheduling delays. GitHub Actions is free on standard runners in public repositories, subject to fair-use limits and API restrictions.

**Integrity warning:** 1h/7d counts are observed *minimums* from the API's capped trade list, not comprehensive execution totals. Polling cannot recover unseen trades. Keep `trade_history.json` under 7 days.

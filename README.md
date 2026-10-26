# RunicWorld GE Profit Finder

**Free, browser-based money-making calculator for RunicWorld players.** No download, registration, or game addon is needed.

**Open the website:** https://davidja92.github.io/runicworld-profit-finder/

The tool compares money-making methods with current RunicWorld Grand Exchange (GE) prices, your character's skill levels, and available NPC shop reference prices. It is an unofficial community project, not affiliated with RuneScape or RunicWorld.

## Quick start

1. **Open the website** using the link above. It attempts to load live GE prices automatically. You can also select **Refresh live GE**.
2. **Enter your RunicWorld player username** in **Player username** and click **Fetch skills**. The calculator looks up your character's XP on the RunicWorld hiscores and converts it into skill levels.
3. Open **Profit ranking** and leave **Only methods I qualify for** checked to see activities allowed by your imported levels.
4. Review **Net GP/hr**, **Gross**, **Costs**, and **Missing prices**. Methods with missing inputs or outputs are marked **INCOMPLETE** rather than assigned a guessed profit.
5. Filter by category or search for an activity such as cooking, runecrafting, mining, or dragons.

## Main tabs

### Profit ranking

- **Highest complete eligible GP/hr** summarizes the best fully priced method that meets your skill requirements.
- **Eligible methods** counts methods your levels permit.
- **Only methods I qualify for** hides activities requiring higher skills.
- **Sell price** changes the GE quote used to value outputs; this can affect rankings.
- **Export CSV** downloads the current method calculations for further analysis.

**Profit figures are estimates**, not guaranteed earnings. Some action rates are editable assumptions; travel, competition, stock changes, failed actions, and actual sale conditions can reduce profits.

### My skills

Use **Fetch skills** to import levels automatically. Alternatively, open **My skills** and edit an individual level. Changes immediately recalculate available methods. **Reset to level 1** clears the entered levels, so use it only if you intend to start over.

### GE market

Search available RunicWorld items and inspect displayed buyer, seller, last-trade, guide, volume, and ingredient-cost information. **Refresh live GE** requests the latest data available through the RunicWorld API. **Use snapshot** loads the bundled fallback dataset; it can be older and smaller than the live market.

### Edit methods

Select an existing money-making method or click **Add method**. Enter its name, category, required skill levels, ingredients, outputs, and hourly production assumptions through the on-screen form. Use **+ Add skill requirement**, **+ Add ingredient**, and **+ Add output** as needed, then click **Save method**.

Changes to custom methods are saved **in your browser**, not published automatically to all players. **Restore defaults** removes your customizations and restores the shipped methods.

### Missing prices & shops

- **Price coverage audit** lists item prices that the calculator still cannot resolve.
- **Add a verified shop price** records what an NPC shop charges you to **buy** an ingredient.
- **Fallback when selling items to NPC shops** records what an NPC pays **you** to sell an output when a usable GE selling price is missing.

These are different prices. Only enter actual observed or reliably sourced RunicWorld prices. Shop overrides are stored locally in your browser.

## How prices are chosen

- **Selling an output:** RunicWorld GE price is preferred; if unavailable, the calculator can use a configured NPC buy-back price or an estimated general-store value when documented item base data exists.
- **Buying ingredients:** Supported NPC shop references can take priority; otherwise, RunicWorld GE input prices apply.
- **Wiki-derived reference data:** The site may include historical OSRS item values and shop-price estimates. These are **not verified RunicWorld shop quotations** and can differ because of server changes, quest access, stock, or shop rules.
- **Missing price:** The method remains incomplete; the calculator does not assume an item is free.

The included content focuses on 2007-era members methods plus confirmed RunicWorld additions such as Lava Dragons. A method's presence in the list is not a guarantee that every ingredient, NPC shop, or production rate works identically on the server.

## Automatic market refresh

Use the **Automatic live GE refresh** dropdown near the top of the website. Choose **Off**, **1**, **5**, **10**, **15**, **30**, or **60 minutes**. The default is **every 5 minutes**. Your preference is saved in your browser.

Refreshing operates only while the page is open; background tabs may be throttled. The site can discover new GE items returned by the API and retain previously seen items locally. Old retained quotes may become stale.

## Troubleshooting

- **Live GE fails:** Click **Use snapshot** for fallback prices; retry **Refresh live GE** later. Browser network restrictions or an unavailable API can block live updates.
- **Player not found:** Check the spelling of your RunicWorld name and try again; you can still enter skill levels manually.
- **Method says INCOMPLETE:** Open **Missing prices & shops** to see unresolved item values. Live market refresh can resolve some missing items automatically.
- **Old data or layout:** Refresh the page (on Windows, **Ctrl + Shift + R**). Browser-saved method edits and price overrides are device-specific.
- **Unexpected GP/hour:** Review the method's assumptions and the quote source. Shop buy-back and purchase prices are not the same, and stock levels can affect real earnings.

## Suggestions and issues

Request corrections or additional RunicWorld-specific methods through the project's [GitHub Issues](https://github.com/davidja92/runicworld-profit-finder/issues).

The website is free to use; it does not read the game client or require any in-game addons.

## How action rates are calculated

For standard glassblowing, ordinary fish cooking, and conventional unstrung bow fletching, the calculator uses cited OSRS Wiki reference speeds. The ranking shows the rate and source. These speeds are benchmarks, not guaranteed personal performance. Cooking estimates do not currently account for fish burns, and modern OSRS-only equipment or locations are not assumed available on RunicWorld. Other methods remain clearly labeled estimated until level-specific rates are sourced.

## How reliable are production rates?

In **Profit ranking**, read the rate notes for each activity. Wiki reference speeds are guide benchmarks for their specified setup, not guaranteed RunicWorld maxima. Provisional modeled speeds and unverified estimates are explicitly distinguished in the project rate audit. Cooking rates currently exclude burn probability, and gathering successes depend on levels, gear, and location. You can adjust **Actions/hour** in Edit methods for your own play style; no JSON editing is necessary.


## How sell-price estimates work (v6.8)

Under **Profit ranking**, choose **Sell price**. The default *Estimated average (bid / last)* takes the arithmetic midpoint between the highest live GE buy offer and last traded price when both exist. This is an indicative quote, **not a volume-weighted execution price**. When the last trade is unavailable it falls back to best buy. Other options include highest buy offer, last trade, and guide price. Actual proceeds for large quantities may be lower. The GE API used here lacks price-level order-book depths, so the site cannot calculate executable VWAP for an hourly batch.

## How to read price and liquidity estimates

On **Profit ranking**, click **Price details** beneath any method to inspect its hourly items, quantities, prices and source. The **Buyer liquidity** column compares the aggregate active buy quantity reported by RunicWorld with hourly output. It does **not** show the buy quantity at each price level or guarantee that you can fill all orders at the displayed quote. Low-depth methods show a warning. Unknown depth is not zero. Prices using the best-bid/last-trade midpoint are estimates, not actual execution VWAP. Shop buy-back and shop ingredient costs may vary as stock changes.

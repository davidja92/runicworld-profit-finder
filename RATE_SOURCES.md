# Production rate evidence: v6.7

The app distinguishes `wiki_reference` (direct training guide throughput), `wiki_range_midpoint` (middle of stated range), `modeled_not_verified` (provisional baseline, not a sourced maximum), `unverified_level_sensitive` (retains existing manual assumptions) and `manual_estimate`. Importantly, an OSRS Wiki skill overview is **not** proof of a specific numeric rate.

## Direct benchmarks
- Crafting glassblowing: 1,750/hr, jewellery 1,400/hr (gem+bar) or 1,600/hr (plain), gem cutting 2,780/hr (without modern chisel): https://oldschool.runescape.wiki/w/Pay-to-play_Crafting_training
- Herblore secondary-ingredient potion making: roughly 2,500/hr: https://oldschool.runescape.wiki/w/Herblore_training
- Cooking ordinary items 1,300–1,400/hr practical with banking; midpoint 1,350, *burn rates unmodeled*: https://oldschool.runescape.wiki/w/Pay-to-play_Cooking_training
- Standard unstrung bow fletching: ~1,800/hr: https://oldschool.runescape.wiki/w/Fletching_training

## Not sourced maxima
Smelting, anvil smithing, leather crafting, herb cleaning, orb charging, molten glass creation, spinning and arrow shafts have provisional reference speeds, labeled modeled_not_verified in both UI and CSV. Gathering, thieving, farming, Runecrafting, combat and Hunter require species/node/route/tool/success curves and retain estimates. **Do not promote any of these provisional rates as verified.**

Use METHOD_RATE_AUDIT.csv to prioritize replacing each provisional rate with measured and sourced setup-specific data.

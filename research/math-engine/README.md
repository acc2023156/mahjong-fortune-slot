# Mahjong Ways 1-like probability research module

This is a standalone, deterministic Monte Carlo model for a 5×4, 1,024-ways,
cascade slot. It is a **research seed**, not a claim about PG Soft's private PAR
sheet, reel strips, weights, RNG, or certified production implementation.

Existing versions are immutable and must never be overwritten. Follow
`VERSIONING.md` when adding, simulating, or promoting a new version.

## Included

- Per-reel JSON symbol pools and a versioned paytable.
- Left-to-right ways evaluation with WILD substitution.
- Winning Gold tile → persistent WILD, gravity, empty-cell refill, unlimited
  cascades with diagnostic safety limits.
- Base multipliers `1/2/3/5`, free-spin multipliers `2/4/6/10`.
- Free-spin trigger/retrigger and a 25,000x configurable win cap.
- Seeded runs, RTP split, hit rates, feature frequency, standard deviation,
  max observed win, Bonus RTP Concentration, and win-distribution tails.
- Rule tests for ways, WILD, Gold, multipliers, awards, and determinism.

## Run

From `mahjong-fortune-slot`:

```powershell
npm run math:test
npm run math:sim -- --spins=100000 --seed=123456789
npm run math:sim -- --spins=1000000 --seed=20261001 --json
```

Use another parameter version without changing the engine:

```powershell
node research/math-engine/scripts/simulate.mjs --config=research/math-engine/config/mw1-like-v002.json --spins=1000000
```

## Interpretation

The official public KPI values in `targets` are calibration targets only. V001
uses the supplied starter weights/paytable, so its first report is expected to
miss some targets. Tune a copied JSON version, retain the seed and spin count,
then compare deltas. Do not tune code paths to individual outcomes.

`baseRtp` is base-game cascade return per purchased spin. `freeSpinRtp` is all
feature return per purchased spin. `rtp` is capped total return per purchased
spin. Feature hit rate counts purchased spins that award at least one free spin.
Scatter is checked on the initial board of each spin; it does not pay and is not
removed by a cascade.

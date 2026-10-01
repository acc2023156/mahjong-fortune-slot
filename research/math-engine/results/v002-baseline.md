# MW1-like V002 baseline

- Status: promoted calibration candidate; keep immutable after release
- Date: 2026-10-01
- Spins: 1,000,000
- Seed: 20261002
- Config: `config/mw1-like-v002.json`
- Paytable: PG PDF values normalized to a base bet of 20
- Free spins: 12 for three scatters, +2 for each additional scatter
- Scatter availability: all five reels

## KPI comparison

| KPI | V002 | Target | Delta |
| --- | ---: | ---: | ---: |
| Total RTP | 97.2146% | 96.9200% | +0.2946 pp |
| Base RTP | 68.7953% | 68.8900% | -0.0947 pp |
| Free Spins RTP | 28.4193% | 28.0300% | +0.3893 pp |
| Overall hit rate | 28.4939% | 28.5400% | -0.0461 pp |
| Base hit rate | 28.1196% | 28.0500% | +0.0696 pp |
| Feature hit rate | 0.4738% | 0.4900% | -0.0162 pp |

- Average spins per feature: 211.06 (target derived from PDF: about 204.08)
- Bonus RTP concentration: 29.2336%
- Average free spins per feature: 12.93
- Maximum observed round: 894.90x
- Round-win standard deviation: 7.4819

## Win distribution

| Win band | Probability | One in |
| --- | ---: | ---: |
| 0x | 71.5061% | 1.40 |
| 0–1x | 14.0203% | 7.13 |
| 1–2x | 5.7395% | 17.42 |
| 2–5x | 5.2375% | 19.09 |
| 5–10x | 1.8068% | 55.35 |
| 10–20x | 0.9147% | 109.33 |
| 20–35x | 0.3745% | 267.02 |
| 35–50x | 0.1368% | 730.99 |
| 50–100x | 0.1638% | 610.50 |
| 100–500x | 0.0987% | 1,013.17 |
| 500x+ | 0.0013% | 76,923.08 |

The headline RTP and hit-rate targets are within 0.4 percentage points in this deterministic run. Tail frequencies remain an explicit future calibration axis and are not claimed to reproduce PG's unpublished reel model exactly.

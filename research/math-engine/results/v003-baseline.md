# MW1-like V003 baseline

- Status: promoted calibration candidate; keep immutable after release
- Date: 2026-10-01
- Spins: 1,000,000
- Seed: 20261003
- Config: `config/mw1-like-v003.json`
- Parent math: V002 (preserved unchanged)
- New rule: at most one Scatter/胡 per reel on initial boards and cascade refills
- Frontend rule: spinning symbols remain blurred; official reel results enter from one cell before their final position and are revealed only while settling

## KPI comparison

| KPI | V003 | Target | Delta |
| --- | ---: | ---: | ---: |
| Total RTP | 97.0113% | 96.9200% | +0.0913 pp |
| Base RTP | 68.6757% | 68.8900% | -0.2143 pp |
| Free Spins RTP | 28.3356% | 28.0300% | +0.3056 pp |
| Overall hit rate | 28.1328% | 28.5400% | -0.4072 pp |
| Base hit rate | 27.7437% | 28.0500% | -0.3063 pp |
| Feature hit rate | 0.4935% | 0.4900% | +0.0035 pp |

- Average spins per feature: 202.63 (target derived from PDF: about 204.08)
- Bonus RTP concentration: 29.2085%
- Average free spins per feature: 12.83
- Maximum observed round: 1,022.90x
- Round-win standard deviation: 7.3266

## Win distribution

| Win band | Probability | One in |
| --- | ---: | ---: |
| 0x | 71.8672% | 1.39 |
| 0–1x | 13.8352% | 7.23 |
| 1–2x | 5.6220% | 17.79 |
| 2–5x | 5.1354% | 19.47 |
| 5–10x | 1.8313% | 54.61 |
| 10–20x | 0.9182% | 108.91 |
| 20–35x | 0.3786% | 264.13 |
| 35–50x | 0.1473% | 678.89 |
| 50–100x | 0.1700% | 588.24 |
| 100–500x | 0.0936% | 1,068.38 |
| 500x+ | 0.0012% | 83,333.33 |

The total RTP is within 0.1 percentage points and feature frequency is within 0.004 percentage points of target in this deterministic run. Hit rate and tail distribution remain explicit future calibration axes.

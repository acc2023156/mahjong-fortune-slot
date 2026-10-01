# V001 Monte Carlo baseline

- Config: `config/mw1-like-v001.json`
- Spins: 1,000,000 purchased spins
- Seed: `20261001`
- Run date: 2026-10-01

| KPI | V001 | Public target |
|---|---:|---:|
| Total RTP | 330.4550% | 96.9200% |
| Base RTP | 320.5058% | 68.8900% |
| Free Spins RTP | 9.9492% | 28.0300% |
| Overall Hit Rate | 60.5129% | 28.5400% |
| Base Hit Rate | 60.4301% | 28.0500% |
| Feature Hit Rate | 0.1464% (1 / 683.06) | 0.4900% (about 1 / 204.08) |
| Bonus RTP concentration | 3.0108% | 28.9218% |
| Max observed win | 413.54x | 2,893x in the referenced 1B simulation |

| Round win | Count | Probability | One in |
|---|---:|---:|---:|
| 0x | 394,871 | 39.4871% | 2.53 |
| 0–1x | 253,836 | 25.3836% | 3.94 |
| 1–2x | 84,017 | 8.4017% | 11.90 |
| 2–5x | 107,404 | 10.7404% | 9.31 |
| 5–10x | 69,350 | 6.9350% | 14.42 |
| 10–20x | 50,442 | 5.0442% | 19.82 |
| 20–35x | 24,267 | 2.4267% | 41.21 |
| 35–50x | 8,495 | 0.8495% | 117.72 |
| 50–100x | 6,300 | 0.6300% | 158.73 |
| 100–500x | 1,018 | 0.1018% | 982.32 |
| 500x+ | 0 | 0.0000% | n/a |

V001 is intentionally retained as the supplied starter model. It is much too
hot in the base game, triggers the feature too rarely, and has excessive
20–50x mass. V002 calibration should first reduce base ways frequency/pay
exposure and independently raise the scatter trigger frequency. This report is
a reproducible engineering baseline, not evidence of the original game's
private parameters.

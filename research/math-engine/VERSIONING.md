# Math versioning policy

Math versions are immutable once used by the front end or recorded in a Monte
Carlo report. Never edit or overwrite an existing `vNNN` parameter file,
front-end version module, or result report.

For every change:

1. Copy the latest research config to the next sequential filename.
2. Set a new unique `game` / version ID inside that copy.
3. Add a matching `src/game/math/versions/vNNN.ts` front-end snapshot.
4. Run tests and a fixed-seed simulation; save a new report under `results/`.
5. Promote the version only by changing the import in `src/game/math/active.ts`.

V001 remains preserved even though its calibration is intentionally far from
the public target KPIs.

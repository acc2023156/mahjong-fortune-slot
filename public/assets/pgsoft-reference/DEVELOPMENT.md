# Development usage

Use `pgsoftAsset()` from `src/game/pgsoftAssets.ts` with the `newName` value in `asset-name-map.csv`.

Example:

```ts
import { pgsoftAsset } from '../../../game/pgsoftAssets';

const url = pgsoftAsset('images/texture/free-spins/zh/free-spins.png');
```

Files under `images/atlas-subresources/` have no semantic logical path in the source manifest. They retain the source UUID/hash and should be visually verified before being assigned a gameplay role.

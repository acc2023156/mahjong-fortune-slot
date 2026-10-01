const PGSOFT_ASSET_BASE = '/assets/pgsoft-reference';

/**
 * Builds a public URL for an asset listed in
 * public/assets/pgsoft-reference/asset-name-map.csv.
 *
 * Example:
 *   pgsoftAsset('images/texture/free-spins/zh/free-spins.png')
 */
export function pgsoftAsset(relativePath: string): string {
  const normalized = relativePath
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map(encodeURIComponent)
    .join('/');

  return `${PGSOFT_ASSET_BASE}/${normalized}`;
}

export const pgsoftAssetCatalog = {
  csv: `${PGSOFT_ASSET_BASE}/asset-name-map.csv`,
  audit: `${PGSOFT_ASSET_BASE}/asset-name-map.md`,
} as const;


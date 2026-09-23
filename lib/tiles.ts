export type TileManifest = {
  width: number;
  height: number;
  tileSize: number;
  maxLevel: number;
  minLevel: number;
  tileUrl: string;
  format: string;
};

export type VisibleTile = {
  key: string;
  level: number;
  col: number;
  row: number;
  // Position and size in world (full-resolution image) pixels
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
};

export function tileSrc(manifest: TileManifest, level: number, col: number, row: number) {
  return manifest.tileUrl
    .replace("{level}", String(level))
    .replace("{col}", String(col))
    .replace("{row}", String(row));
}

/** Pick the tile pyramid level that best matches the current screen scale. */
export function levelForScale(scale: number, maxLevel: number) {
  // scale = CSS pixels per world pixel.
  // At scale 1, one source pixel ≈ one screen pixel → use the top pyramid level.
  if (scale >= 0.55) {
    return maxLevel;
  }

  const ideal = maxLevel + Math.log2(Math.max(scale, 1e-6));
  // Bias toward sharper tiles so labels stay readable while zooming in.
  return Math.max(0, Math.min(maxLevel, Math.ceil(ideal + 0.45)));
}

export function tilesOverlap(a: VisibleTile, b: VisibleTile) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/** Build the tile list for one pyramid level inside the current viewport. */
export function getVisibleTilesAtLevel(
  manifest: TileManifest,
  level: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
): VisibleTile[] {
  const clampedLevel = Math.max(0, Math.min(manifest.maxLevel, level));
  const levelScale = Math.pow(2, clampedLevel - manifest.maxLevel);
  const levelWidth = Math.max(1, Math.round(manifest.width * levelScale));
  const levelHeight = Math.max(1, Math.round(manifest.height * levelScale));
  const cols = Math.ceil(levelWidth / manifest.tileSize);
  const rows = Math.ceil(levelHeight / manifest.tileSize);

  const worldLeft = -offsetX / scale;
  const worldTop = -offsetY / scale;
  const worldRight = (viewportWidth - offsetX) / scale;
  const worldBottom = (viewportHeight - offsetY) / scale;

  const left = worldLeft * levelScale;
  const top = worldTop * levelScale;
  const right = worldRight * levelScale;
  const bottom = worldBottom * levelScale;

  const colStart = Math.max(0, Math.floor(left / manifest.tileSize) - 1);
  const rowStart = Math.max(0, Math.floor(top / manifest.tileSize) - 1);
  const colEnd = Math.min(cols - 1, Math.floor(right / manifest.tileSize) + 1);
  const rowEnd = Math.min(rows - 1, Math.floor(bottom / manifest.tileSize) + 1);

  const tiles: VisibleTile[] = [];
  const worldPerLevel = 1 / levelScale;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const tileW = Math.min(manifest.tileSize, levelWidth - col * manifest.tileSize);
      const tileH = Math.min(manifest.tileSize, levelHeight - row * manifest.tileSize);

      tiles.push({
        key: `${clampedLevel}:${col}:${row}`,
        level: clampedLevel,
        col,
        row,
        x: col * manifest.tileSize * worldPerLevel,
        y: row * manifest.tileSize * worldPerLevel,
        width: tileW * worldPerLevel,
        height: tileH * worldPerLevel,
        src: tileSrc(manifest, clampedLevel, col, row),
      });
    }
  }

  return tiles;
}

/**
 * Which tiles are inside the viewport (plus a 1-tile margin for smoother panning).
 */
export function getVisibleTiles(
  manifest: TileManifest,
  scale: number,
  offsetX: number,
  offsetY: number,
  viewportWidth: number,
  viewportHeight: number,
): VisibleTile[] {
  const level = levelForScale(scale, manifest.maxLevel);
  return getVisibleTilesAtLevel(
    manifest,
    level,
    scale,
    offsetX,
    offsetY,
    viewportWidth,
    viewportHeight,
  );
}


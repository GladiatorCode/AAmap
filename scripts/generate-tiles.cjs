/**
 * Builds a Deep Zoom tile pyramid from Images/AAMap.png.
 * Run: node scripts/generate-tiles.cjs
 * Optional: node scripts/generate-tiles.cjs --levels=2,3,4
 *
 * Output:
 *   public/tiles/manifest.json
 *   public/tiles/{level}/{col}_{row}.jpg
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SOURCE = path.join(__dirname, "..", "Images", "AAMap.png");
const OUT_DIR = path.join(__dirname, "..", "public", "tiles");
const TILE_SIZE = 512;
const SHARP_OPTIONS = { limitInputPixels: false, sequentialRead: true };

function maxLevelFor(width, height, tileSize) {
  const maxDim = Math.max(width, height);
  return Math.ceil(Math.log2(maxDim / tileSize));
}

/** Higher JPEG quality where you spend most of your time looking. */
function qualityForLevel(level, maxLevel) {
  if (level <= 1) {
    return 96; // zoomed-out / overview — keep this sharp too
  }
  if (level === 2) {
    return 97;
  }
  if (level === maxLevel) {
    return 100; // closest zoom — maximum JPEG quality
  }
  return 97;
}

function jpegOptions(quality) {
  return {
    quality,
    mozjpeg: true,
    // Keep full color detail (helps map labels and fine lines).
    chromaSubsampling: "4:4:4",
  };
}

function parseLevelFilter(argv) {
  const arg = argv.find((part) => part.startsWith("--levels="));
  if (!arg) {
    return null;
  }
  return new Set(
    arg
      .slice("--levels=".length)
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value)),
  );
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function writeTilesFromImage(levelImage, levelWidth, levelHeight, levelDir, quality) {
  const cols = Math.ceil(levelWidth / TILE_SIZE);
  const rows = Math.ceil(levelHeight / TILE_SIZE);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const left = col * TILE_SIZE;
      const top = row * TILE_SIZE;
      const tw = Math.min(TILE_SIZE, levelWidth - left);
      const th = Math.min(TILE_SIZE, levelHeight - top);
      const outPath = path.join(levelDir, `${col}_${row}.jpg`);

      // Encode to JPEG only once (no double-compression).
      await levelImage
        .clone()
        .extract({ left, top, width: tw, height: th })
        .jpeg(jpegOptions(quality))
        .toFile(outPath);
    }
    process.stdout.write(`  row ${row + 1}/${rows}\r`);
  }

  console.log(`  done ${cols * rows} tiles @ q${quality}          `);
}

async function writeFullResTiles(width, height, levelDir, quality) {
  // Process one horizontal strip at a time so we never hold the full 16k image in memory.
  const cols = Math.ceil(width / TILE_SIZE);
  const rows = Math.ceil(height / TILE_SIZE);

  for (let row = 0; row < rows; row++) {
    const top = row * TILE_SIZE;
    const th = Math.min(TILE_SIZE, height - top);

    // Lossless strip, then JPEG each tile once.
    const stripBuffer = await sharp(SOURCE, SHARP_OPTIONS)
      .extract({ left: 0, top, width, height: th })
      .png()
      .toBuffer();

    const strip = sharp(stripBuffer);

    for (let col = 0; col < cols; col++) {
      const left = col * TILE_SIZE;
      const tw = Math.min(TILE_SIZE, width - left);
      const outPath = path.join(levelDir, `${col}_${row}.jpg`);

      await strip
        .clone()
        .extract({ left, top: 0, width: tw, height: th })
        .jpeg(jpegOptions(quality))
        .toFile(outPath);
    }

    process.stdout.write(`  row ${row + 1}/${rows}\r`);
  }

  console.log(`  done ${cols * rows} tiles @ q${quality}          `);
}

async function main() {
  const levelFilter = parseLevelFilter(process.argv.slice(2));

  console.log("Reading source map…");
  const meta = await sharp(SOURCE, SHARP_OPTIONS).metadata();
  const width = meta.width;
  const height = meta.height;

  if (!width || !height) {
    throw new Error("Could not read image size from AAMap.png");
  }

  const maxLevel = maxLevelFor(width, height, TILE_SIZE);
  console.log(`Source: ${width}×${height}`);
  console.log(`Tile size: ${TILE_SIZE}px · levels 0..${maxLevel}`);
  if (levelFilter) {
    console.log(`Only regenerating levels: ${[...levelFilter].join(", ")}`);
  }

  await ensureDir(OUT_DIR);

  for (let level = 0; level <= maxLevel; level++) {
    if (levelFilter && !levelFilter.has(level)) {
      continue;
    }

    const scale = Math.pow(2, level - maxLevel);
    const levelWidth = Math.max(1, Math.round(width * scale));
    const levelHeight = Math.max(1, Math.round(height * scale));
    const cols = Math.ceil(levelWidth / TILE_SIZE);
    const rows = Math.ceil(levelHeight / TILE_SIZE);
    const levelDir = path.join(OUT_DIR, String(level));
    const quality = qualityForLevel(level, maxLevel);

    // Force rebuild when a level filter is set; otherwise skip finished levels.
    if (!levelFilter) {
      const expected = cols * rows;
      let existing = 0;
      try {
        existing = (await fs.promises.readdir(levelDir)).filter((f) =>
          f.endsWith(".jpg"),
        ).length;
      } catch {
        existing = 0;
      }

      if (existing === expected) {
        console.log(`\nLevel ${level}: already complete (${expected} tiles), skipping`);
        continue;
      }
    }

    await fs.promises.rm(levelDir, { recursive: true, force: true });
    await ensureDir(levelDir);

    console.log(
      `\nLevel ${level}: ${levelWidth}×${levelHeight} → ${cols}×${rows} tiles`,
    );

    if (level === maxLevel) {
      await writeFullResTiles(width, height, levelDir, quality);
    } else {
      // Keep a lossless in-memory image, then JPEG each tile once.
      const levelBuffer = await sharp(SOURCE, SHARP_OPTIONS)
        .resize(levelWidth, levelHeight, {
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        })
        .png()
        .toBuffer();

      await writeTilesFromImage(
        sharp(levelBuffer),
        levelWidth,
        levelHeight,
        levelDir,
        quality,
      );
    }
  }

  const manifest = {
    width,
    height,
    tileSize: TILE_SIZE,
    maxLevel,
    minLevel: 0,
    tileUrl: "/tiles/{level}/{col}_{row}.jpg",
    format: "jpg",
  };

  await fs.promises.writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log("\nWrote public/tiles/manifest.json");
  console.log("Tile generation complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

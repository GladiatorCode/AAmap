import type { Pin } from "@/types/pin";

export type LabelOffset = {
  x: number;
  y: number;
};

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const LABEL_HEIGHT = 20;
const LABEL_PADDING = 3;
const DEFAULT_BELOW: LabelOffset = { x: 0, y: 12 };

/** Candidate label positions, nearest-to-pin first (below, then tight rings). */
function buildCandidateSlots(): LabelOffset[] {
  const slots: LabelOffset[] = [DEFAULT_BELOW];
  const rings = [14, 20, 28, 38, 50];
  const anglesPerRing = [6, 8, 10, 12, 12];

  for (let r = 0; r < rings.length; r++) {
    const radius = rings[r];
    const count = anglesPerRing[r];
    for (let i = 0; i < count; i++) {
      // Screen Y grows downward; PI/2 points below the pin.
      const angle = Math.PI / 2 + (i / count) * Math.PI * 2;
      slots.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }

  return slots;
}

const CANDIDATE_SLOTS = buildCandidateSlots();

function estimateLabelWidth(name: string) {
  return Math.min(112, Math.max(28, name.length * 6.6 + 16));
}

function labelRect(
  pinX: number,
  pinY: number,
  offset: LabelOffset,
  name: string,
): Rect {
  const width = estimateLabelWidth(name);
  const cx = pinX + offset.x;
  const cy = pinY + offset.y;
  return {
    left: cx - width / 2 - LABEL_PADDING,
    right: cx + width / 2 + LABEL_PADDING,
    top: cy - LABEL_HEIGHT / 2 - LABEL_PADDING,
    bottom: cy + LABEL_HEIGHT / 2 + LABEL_PADDING,
  };
}

function rectsOverlap(a: Rect, b: Rect) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

/**
 * Place each label as close as possible to its pin.
 * Only moves a label farther out when a nearer spot would overlap another name.
 */
export function getPinLabelOffsets(
  pins: Pin[],
  worldWidth: number,
  worldHeight: number,
  scale: number,
): Map<string, LabelOffset> {
  const offsets = new Map<string, LabelOffset>();
  if (pins.length === 0) {
    return offsets;
  }

  const points = pins.map((pin) => ({
    pin,
    x: (pin.xPercent / 100) * worldWidth * scale,
    y: (pin.yPercent / 100) * worldHeight * scale,
  }));

  // Stable order so layout doesn't jump around between frames.
  points.sort((a, b) => a.y - b.y || a.x - b.x || a.pin.id.localeCompare(b.pin.id));

  const placed: Rect[] = [];

  for (const point of points) {
    let chosen: LabelOffset = CANDIDATE_SLOTS[CANDIDATE_SLOTS.length - 1];

    for (const slot of CANDIDATE_SLOTS) {
      const rect = labelRect(point.x, point.y, slot, point.pin.name);
      if (!placed.some((other) => rectsOverlap(rect, other))) {
        chosen = slot;
        placed.push(rect);
        offsets.set(point.pin.id, chosen);
        break;
      }
    }

    if (!offsets.has(point.pin.id)) {
      placed.push(labelRect(point.x, point.y, chosen, point.pin.name));
      offsets.set(point.pin.id, chosen);
    }
  }

  return offsets;
}

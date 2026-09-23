import type { Pin } from "@/types/pin";
import type { LabelOffset } from "@/lib/pinLayout";

type PinMarkerProps = {
  pin: Pin;
  isSelected: boolean;
  zoomRatio: number;
  worldWidth: number;
  worldHeight: number;
  labelOffset: LabelOffset;
  onSelect: (id: string) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Drawn in screen space (not inside the scaled map layer), so the name stays sharp.
 * The red dot is centered on the stored map coordinate.
 * Labels may be fanned out when several pins sit close together.
 */
export function PinMarker({
  pin,
  isSelected,
  zoomRatio,
  worldWidth,
  worldHeight,
  labelOffset,
  onSelect,
}: PinMarkerProps) {
  const worldX = (pin.xPercent / 100) * worldWidth;
  const worldY = (pin.yPercent / 100) * worldHeight;
  const dotSizePx = clamp(2 + (zoomRatio - 1) * 1.2, 2, 14);
  const spread = Math.hypot(labelOffset.x, labelOffset.y) > 14;

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(calc(${worldX} * var(--map-scale) * 1px), calc(${worldY} * var(--map-scale) * 1px), 0)`,
      }}
    >
      {/* Red dot stays on the true map position */}
      <button
        type="button"
        className="pointer-events-auto absolute"
        style={{
          left: 0,
          top: 0,
          transform: "translate(-50%, -50%)",
        }}
        aria-label={`Pin: ${pin.name}`}
        onPointerDown={(event) => {
          // Don't let pin clicks start a map pan or steal focus.
          event.stopPropagation();
          event.preventDefault();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(pin.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(pin.id);
        }}
      >
        <span
          className={`block rounded-full border-2 border-white shadow-md ${
            isSelected ? "bg-rose-700" : "bg-rose-500"
          }`}
          style={{ width: dotSizePx, height: dotSizePx }}
        />
      </button>

      {/* Leader line when the label is fanned away from the dot */}
      {spread ? (
        <svg
          className="pointer-events-none absolute overflow-visible"
          width="1"
          height="1"
          style={{ left: 0, top: 0 }}
        >
          <line
            x1={0}
            y1={0}
            x2={labelOffset.x}
            y2={labelOffset.y}
            stroke="rgba(28, 25, 23, 0.45)"
            strokeWidth="1"
          />
        </svg>
      ) : null}

      {/* Name label — may be offset so neighbors don't cover each other */}
      <button
        type="button"
        className="pointer-events-auto absolute max-w-28 truncate rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-stone-900 shadow"
        style={{
          left: labelOffset.x,
          top: labelOffset.y,
          transform: "translate(-50%, -50%)",
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(pin.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelect(pin.id);
        }}
      >
        {pin.name}
      </button>
    </div>
  );
}

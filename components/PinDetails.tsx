import type { Pin } from "@/types/pin";

type PinDetailsProps = {
  pin: Pin;
  worldWidth: number;
  worldHeight: number;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onClose: () => void;
};

// Popup in screen space under the pin (stays sharp at every zoom).
export function PinDetails({
  pin,
  worldWidth,
  worldHeight,
  canEdit,
  onDelete,
  onClose,
}: PinDetailsProps) {
  const worldX = (pin.xPercent / 100) * worldWidth;
  const worldY = (pin.yPercent / 100) * worldHeight;

  return (
    <div
      className="pointer-events-auto absolute z-20 w-52 rounded-xl bg-white p-3 text-left shadow-lg"
      style={{
        left: 0,
        top: 0,
        transform: `translate3d(calc(${worldX} * var(--map-scale) * 1px), calc(${worldY} * var(--map-scale) * 1px), 0) translate(-50%, 14px)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <p className="text-sm font-semibold text-stone-950">{pin.name}</p>
      <div className="mt-3 flex gap-2">
        {canEdit ? (
          <button
            type="button"
            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
            onClick={() => onDelete(pin.id)}
          >
            Delete pin
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

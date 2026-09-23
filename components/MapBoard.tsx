"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AddPinForm } from "@/components/AddPinForm";
import { ModeratorLoginForm } from "@/components/ModeratorLoginForm";
import { PinDetails } from "@/components/PinDetails";
import { PinMarker } from "@/components/PinMarker";
import {
  getVisibleTilesAtLevel,
  levelForScale,
  type TileManifest,
  type VisibleTile,
} from "@/lib/tiles";
import { getPinLabelOffsets } from "@/lib/pinLayout";
import type { Pin } from "@/types/pin";

type DraftLocation = {
  xPercent: number;
  yPercent: number;
};

const ZOOM_STEP = 1.25;
// The art is centered with a large empty border. Zoom in so the map nearly fills the view.
const DEFAULT_ZOOM_OVER_FIT = 2.2;
// How far you can zoom in from that default view (higher = closer / more readable text).
const MAX_ZOOM_OVER_DEFAULT = 22;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function MapBoard() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState<DraftLocation | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [showModeratorLogin, setShowModeratorLogin] = useState(false);
  const [pinActionError, setPinActionError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<TileManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [tiles, setTiles] = useState<VisibleTile[]>([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const mapLayerRef = useRef<HTMLDivElement>(null);
  const pinLayerRef = useRef<HTMLDivElement>(null);
  // scale = CSS pixels per world (source image) pixel
  const transformRef = useRef({ scale: 1, x: 0, y: 0, minScale: 1, maxScale: 1 });
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const manifestRef = useRef<TileManifest | null>(null);
  const tileUpdateRaf = useRef<number | null>(null);
  const scaleSyncRaf = useRef<number | null>(null);
  const lastTileRefreshAt = useRef(0);
  const loadedTileSrcsRef = useRef(new Set<string>());
  const tilesRef = useRef<VisibleTile[]>([]);
  const prefetchCacheRef = useRef(new Map<string, HTMLImageElement>());
  // Keep recently used tiles so zooming back in can reuse sharp images instantly.
  const tileMemoryRef = useRef(new Map<string, VisibleTile>());
  const [, bumpTilePaint] = useState(0);
  const panSurfaceRef = useRef<HTMLDivElement>(null);
  const panPointerIdRef = useRef<number | null>(null);

  function applyTransform() {
    const layer = mapLayerRef.current;
    const pinLayer = pinLayerRef.current;
    const { scale: worldScale, x, y } = transformRef.current;

    // IMPORTANT: only translate these layers — never CSS-scale the tile images.
    // Scaling a downsized tile bitmap is what made zoomed-in text unreadable.
    if (layer) {
      layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      layer.style.setProperty("--map-scale", String(worldScale));
    }
    if (pinLayer) {
      pinLayer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      pinLayer.style.setProperty("--map-scale", String(worldScale));
    }
  }

  function prefetchTiles(nextTiles: VisibleTile[]) {
    for (const tile of nextTiles) {
      tileMemoryRef.current.set(tile.key, tile);

      if (
        loadedTileSrcsRef.current.has(tile.src) ||
        prefetchCacheRef.current.has(tile.src)
      ) {
        continue;
      }

      const image = new window.Image();
      image.decoding = "async";
      image.src = tile.src;
      image.onload = () => {
        loadedTileSrcsRef.current.add(tile.src);
        // Never re-render while the user is mid-pan — that was breaking drag.
        if (!panRef.current) {
          bumpTilePaint((value) => value + 1);
        }
      };
      prefetchCacheRef.current.set(tile.src, image);
    }
  }

  function refreshTiles() {
    const viewport = viewportRef.current;
    const current = manifestRef.current;
    if (!viewport || !current) {
      return;
    }

    const { scale: currentScale, x, y } = transformRef.current;
    // Always target the correct pyramid level for this zoom — highest when zoomed in.
    const idealLevel = levelForScale(currentScale, current.maxLevel);

    const detail = getVisibleTilesAtLevel(
      current,
      idealLevel,
      currentScale,
      x,
      y,
      viewport.clientWidth,
      viewport.clientHeight,
    );

    // Soft underlay only while approaching the top level — never cover max-res with softer tiles.
    const underlay =
      idealLevel > 0 && idealLevel < current.maxLevel
        ? getVisibleTilesAtLevel(
            current,
            idealLevel - 1,
            currentScale,
            x,
            y,
            viewport.clientWidth,
            viewport.clientHeight,
          )
        : [];

    prefetchTiles(detail);

    const byKey = new Map<string, VisibleTile>();
    for (const tile of underlay) {
      byKey.set(tile.key, tile);
    }
    for (const tile of detail) {
      byKey.set(tile.key, tile);
    }

    // If we already loaded these sharp tiles earlier, keep them in the list immediately.
    for (const tile of detail) {
      const remembered = tileMemoryRef.current.get(tile.key);
      if (remembered) {
        byKey.set(remembered.key, remembered);
      }
    }

    const merged = [...byKey.values()].sort((a, b) => a.level - b.level);
    tilesRef.current = merged;
    setTiles(merged);
  }

  function handleTileLoad(src: string) {
    if (loadedTileSrcsRef.current.has(src)) {
      return;
    }
    loadedTileSrcsRef.current.add(src);
    if (!panRef.current) {
      bumpTilePaint((value) => value + 1);
    }
  }

  function scheduleTileRefresh(force = false) {
    // Never update the tile React tree while dragging.
    if (panRef.current) {
      return;
    }

    const now = performance.now();
    if (!force && now - lastTileRefreshAt.current < 120) {
      return;
    }

    if (tileUpdateRaf.current !== null) {
      return;
    }

    tileUpdateRaf.current = window.requestAnimationFrame(() => {
      tileUpdateRaf.current = null;
      if (panRef.current) {
        return;
      }
      lastTileRefreshAt.current = performance.now();
      refreshTiles();
    });
  }

  function scheduleScaleSync() {
    if (scaleSyncRaf.current !== null) {
      return;
    }

    scaleSyncRaf.current = window.requestAnimationFrame(() => {
      scaleSyncRaf.current = null;
      setScale(transformRef.current.scale);
    });
  }

  function fitMapToViewport(width: number, height: number) {
    const viewport = viewportRef.current;
    if (!viewport || width === 0 || height === 0) {
      return;
    }

    const fit = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
    // Start zoomed so the painted map fills the frame (crops most of the empty border).
    const startScale = fit * DEFAULT_ZOOM_OVER_FIT;
    const maxScale = startScale * MAX_ZOOM_OVER_DEFAULT;

    transformRef.current = {
      scale: startScale,
      minScale: startScale,
      maxScale,
      x: (viewport.clientWidth - width * startScale) / 2,
      y: (viewport.clientHeight - height * startScale) / 2,
    };
    applyTransform();
    setMinScale(startScale);
    setScale(startScale);
    refreshTiles();
  }

  function percentFromPoint(clientX: number, clientY: number): DraftLocation | null {
    const viewport = viewportRef.current;
    const current = manifestRef.current;
    if (!viewport || !current) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();
    const { scale: currentScale, x, y } = transformRef.current;
    const worldX = (clientX - rect.left - x) / currentScale;
    const worldY = (clientY - rect.top - y) / currentScale;

    return {
      xPercent: clamp((worldX / current.width) * 100, 0, 100),
      yPercent: clamp((worldY / current.height) * 100, 0, 100),
    };
  }

  function zoomAt(nextScale: number, clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const camera = transformRef.current;
    const clampedScale = clamp(nextScale, camera.minScale, camera.maxScale);
    const rect = viewport.getBoundingClientRect();
    const cursorX = clientX - rect.left;
    const cursorY = clientY - rect.top;

    const worldX = (cursorX - camera.x) / camera.scale;
    const worldY = (cursorY - camera.y) / camera.scale;

    camera.scale = clampedScale;
    camera.x = cursorX - worldX * clampedScale;
    camera.y = cursorY - worldY * clampedScale;
    applyTransform();
    scheduleScaleSync();
    scheduleTileRefresh(true);
  }

  function zoomByButton(direction: "in" | "out") {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const currentScale = transformRef.current.scale;
    const nextScale = direction === "in" ? currentScale * ZOOM_STEP : currentScale / ZOOM_STEP;
    zoomAt(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function endPan() {
    if (!panRef.current) {
      return;
    }

    const pointerId = panPointerIdRef.current;
    panRef.current = null;
    panPointerIdRef.current = null;

    if (
      pointerId !== null &&
      panSurfaceRef.current?.hasPointerCapture(pointerId)
    ) {
      panSurfaceRef.current.releasePointerCapture(pointerId);
    }

    panSurfaceRef.current?.classList.remove("cursor-grabbing");
    panSurfaceRef.current?.classList.add("cursor-grab");
    refreshTiles();
  }

  /**
   * Pointer capture keeps all move events on the pan surface.
   * That stops Chrome from starting a native "ghost image" drag of tiles.
   */
  function handlePanPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    // Block text/image selection + native HTML5 drag.
    event.preventDefault();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = transformRef.current.x;
    const originY = transformRef.current.y;

    panRef.current = {
      pointerId: event.pointerId,
      startX,
      startY,
      originX,
      originY,
    };
    panPointerIdRef.current = event.pointerId;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers throw if capture is already held — pan still works via handlers.
    }

    panSurfaceRef.current?.classList.add("cursor-grabbing");
    panSurfaceRef.current?.classList.remove("cursor-grab");

    if (selectedPinId !== null) {
      queueMicrotask(() => setSelectedPinId(null));
    }
  }

  function handlePanPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    transformRef.current.x = pan.originX + (event.clientX - pan.startX);
    transformRef.current.y = pan.originY + (event.clientY - pan.startY);
    applyTransform();
  }

  function handlePanPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) {
      return;
    }
    endPan();
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    // Viewers can look — only moderators may place pins.
    if (!isModerator) {
      return;
    }

    const location = percentFromPoint(event.clientX, event.clientY);
    if (!location) {
      return;
    }

    setSelectedPinId(null);
    setDraftName("");
    setPinActionError(null);
    setDraftLocation(location);
  }

  async function placePin() {
    const name = draftName.trim();
    if (!name || !draftLocation) {
      return;
    }

    setPinActionError(null);

    try {
      const response = await fetch("/api/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          xPercent: draftLocation.xPercent,
          yPercent: draftLocation.yPercent,
        }),
      });
      const data = (await response.json()) as {
        pin?: Pin;
        pins?: Pin[];
        error?: string;
      };

      if (!response.ok) {
        setPinActionError(data.error ?? "Could not save pin.");
        if (response.status === 401) {
          setIsModerator(false);
        }
        return;
      }

      if (data.pins) {
        setPins(data.pins);
      }
      setDraftLocation(null);
      setDraftName("");
      if (data.pin) {
        setSelectedPinId(data.pin.id);
      }
    } catch {
      setPinActionError("Could not reach the server.");
    }
  }

  async function deletePin(id: string) {
    setPinActionError(null);

    try {
      const response = await fetch(`/api/pins/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { pins?: Pin[]; error?: string };

      if (!response.ok) {
        setPinActionError(data.error ?? "Could not delete pin.");
        if (response.status === 401) {
          setIsModerator(false);
        }
        return;
      }

      if (data.pins) {
        setPins(data.pins);
      }
      setSelectedPinId(null);
    } catch {
      setPinActionError("Could not reach the server.");
    }
  }

  async function logoutModerator() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsModerator(false);
    setDraftLocation(null);
    setShowModeratorLogin(false);
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/tiles/manifest.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Tile manifest missing. Run: npm run tiles");
        }
        return response.json() as Promise<TileManifest>;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        manifestRef.current = data;
        setManifest(data);
        requestAnimationFrame(() => fitMapToViewport(data.width, data.height));
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLoadError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load shared pins + whether this browser already has a moderator cookie.
  useEffect(() => {
    let cancelled = false;

    async function loadSharedState() {
      try {
        const [meResponse, pinsResponse] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/pins"),
        ]);

        if (cancelled) {
          return;
        }

        if (meResponse.ok) {
          const me = (await meResponse.json()) as { isModerator?: boolean };
          setIsModerator(Boolean(me.isModerator));
        }

        if (pinsResponse.ok) {
          const data = (await pinsResponse.json()) as { pins?: Pin[] };
          if (Array.isArray(data.pins)) {
            setPins(data.pins);
          }
        }
      } catch {
        // Map still works offline for viewing tiles; pins just stay empty.
      }
    }

    void loadSharedState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomAt(transformRef.current.scale * factor, event.clientX, event.clientY);
    }

    // Kill native image drag anywhere inside the map viewport.
    function blockDragStart(event: DragEvent) {
      event.preventDefault();
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    viewport.addEventListener("dragstart", blockDragStart, true);
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("dragstart", blockDragStart, true);
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      const current = manifestRef.current;
      if (current) {
        fitMapToViewport(current.width, current.height);
      }
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      endPan();
    };
  }, []);

  const selectedPin = pins.find((pin) => pin.id === selectedPinId) ?? null;
  const labelOffsets =
    manifest != null
      ? getPinLabelOffsets(pins, manifest.width, manifest.height, scale)
      : new Map();

  return (
    <section className="relative h-full w-full">
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        style={{ touchAction: "none", backgroundColor: "#C7B873" }}
        onContextMenu={handleContextMenu}
      >
        {loadError ? (
          <p className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm font-medium text-stone-900">
            {loadError}
          </p>
        ) : null}

        {!manifest && !loadError ? (
          <p className="absolute inset-0 z-20 flex items-center justify-center text-sm font-medium text-stone-900">
            Loading map tiles…
          </p>
        ) : null}

        <div
          ref={mapLayerRef}
          className="pointer-events-none absolute left-0 top-0 z-0"
          style={{ ["--map-scale" as string]: String(scale) }}
          onDragStart={(event) => event.preventDefault()}
        >
          {manifest
            ? tiles.map((tile) => {
                const isReady = loadedTileSrcsRef.current.has(tile.src);
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={tile.key}
                    src={tile.src}
                    alt=""
                    draggable={false}
                    decoding="async"
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      left: `calc(${tile.x} * var(--map-scale) * 1px)`,
                      top: `calc(${tile.y} * var(--map-scale) * 1px)`,
                      width: `calc(${tile.width} * var(--map-scale) * 1px)`,
                      height: `calc(${tile.height} * var(--map-scale) * 1px)`,
                      zIndex: tile.level,
                      opacity: isReady ? 1 : 0,
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onLoad={() => handleTileLoad(tile.src)}
                    ref={(image) => {
                      if (
                        image?.complete &&
                        image.naturalWidth > 0 &&
                        !loadedTileSrcsRef.current.has(tile.src)
                      ) {
                        handleTileLoad(tile.src);
                      }
                    }}
                  />
                );
              })
            : null}
        </div>

        {/* Full-screen drag layer under pins/controls — owns left-click panning. */}
        <div
          ref={panSurfaceRef}
          className="absolute inset-0 z-[5] cursor-grab"
          style={{ touchAction: "none", userSelect: "none" }}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={handlePanPointerUp}
          onPointerCancel={handlePanPointerUp}
          onLostPointerCapture={() => {
            if (panRef.current) {
              endPan();
            }
          }}
          onDragStart={(event) => event.preventDefault()}
        />

        {/* Pins stay sharp: this layer pans without CSS-scaling the text. */}
        <div
          ref={pinLayerRef}
          className="pointer-events-none absolute left-0 top-0 z-10"
          style={{ ["--map-scale" as string]: String(scale) }}
        >
          {manifest
            ? pins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  zoomRatio={minScale > 0 ? scale / minScale : 1}
                  worldWidth={manifest.width}
                  worldHeight={manifest.height}
                  labelOffset={labelOffsets.get(pin.id) ?? { x: 0, y: 12 }}
                  isSelected={pin.id === selectedPinId}
                  onSelect={setSelectedPinId}
                />
              ))
            : null}

          {selectedPin && manifest ? (
            <PinDetails
              pin={selectedPin}
              worldWidth={manifest.width}
              worldHeight={manifest.height}
              canEdit={isModerator}
              onDelete={(id) => {
                void deletePin(id);
              }}
              onClose={() => setSelectedPinId(null)}
            />
          ) : null}
        </div>

        {/* Lightweight chrome over the full-screen map */}
        <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-sm rounded-2xl bg-white/85 px-4 py-3 shadow-sm backdrop-blur-sm sm:left-5 sm:top-5">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-stone-800 uppercase">
            Prototype
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
            GladyMap
          </h1>
          <p className="mt-1 text-xs font-medium text-stone-800 sm:text-sm">
            {isModerator
              ? "Drag to pan · scroll to zoom · right-click to pin"
              : "Drag to pan · scroll to zoom · view-only (login to edit)"}
          </p>
          <p className="mt-2 text-xs font-semibold text-stone-900">
            {pins.length === 0
              ? "No pins yet"
              : `${pins.length} pin${pins.length === 1 ? "" : "s"}`}
            {isModerator ? " · Moderator" : ""}
          </p>
          {pinActionError ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">{pinActionError}</p>
          ) : null}
          <div className="pointer-events-auto mt-3">
            {isModerator ? (
              <button
                type="button"
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
                onClick={() => {
                  void logoutModerator();
                }}
              >
                Log out moderator
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
                onClick={() => setShowModeratorLogin(true)}
              >
                Login as a moderator
              </button>
            )}
          </div>
        </div>

        <div
          className="absolute right-4 top-4 z-30 flex flex-col overflow-hidden rounded-xl bg-white/95 shadow sm:right-5 sm:top-5"
          onMouseDown={(event) => {
            // Keep zoom controls from starting/stealing a pan.
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            className="px-3 py-2 text-lg font-semibold text-stone-900 hover:bg-stone-100"
            aria-label="Zoom in"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => zoomByButton("in")}
          >
            +
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="border-t border-stone-200 px-3 py-2 text-lg font-semibold text-stone-900 hover:bg-stone-100"
            aria-label="Zoom out"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => zoomByButton("out")}
          >
            −
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="border-t border-stone-200 px-3 py-2 text-[11px] font-semibold text-stone-800 hover:bg-stone-100"
            aria-label="Reset view"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (manifest) {
                fitMapToViewport(manifest.width, manifest.height);
              }
            }}
          >
            Fit
          </button>
        </div>
      </div>

      {draftLocation ? (
        <AddPinForm
          name={draftName}
          onNameChange={setDraftName}
          onSubmit={() => {
            void placePin();
          }}
          onCancel={() => {
            setDraftLocation(null);
            setDraftName("");
          }}
        />
      ) : null}

      {showModeratorLogin ? (
        <ModeratorLoginForm
          onSuccess={() => {
            setIsModerator(true);
            setShowModeratorLogin(false);
            setPinActionError(null);
          }}
          onCancel={() => setShowModeratorLogin(false)}
        />
      ) : null}
    </section>
  );
}

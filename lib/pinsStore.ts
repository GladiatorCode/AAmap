import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Pin } from "@/types/pin";

/**
 * Pins live in a JSON file on the server so every visitor sees the same markers.
 * (Fine for a local / single-server prototype — not for multi-region serverless.)
 */
const DATA_DIR = path.join(process.cwd(), "data");
const PINS_FILE = path.join(DATA_DIR, "pins.json");

async function ensureStore(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(PINS_FILE, "utf8");
  } catch {
    await writeFile(PINS_FILE, "[]\n", "utf8");
  }
}

export async function readPins(): Promise<Pin[]> {
  await ensureStore();
  const raw = await readFile(PINS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Pin[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writePins(pins: Pin[]): Promise<void> {
  await ensureStore();
  await writeFile(PINS_FILE, `${JSON.stringify(pins, null, 2)}\n`, "utf8");
}

export async function addPin(pin: Pin): Promise<Pin[]> {
  const pins = await readPins();
  pins.push(pin);
  await writePins(pins);
  return pins;
}

export async function removePin(id: string): Promise<Pin[] | null> {
  const pins = await readPins();
  const next = pins.filter((pin) => pin.id !== id);
  if (next.length === pins.length) {
    return null;
  }
  await writePins(next);
  return next;
}

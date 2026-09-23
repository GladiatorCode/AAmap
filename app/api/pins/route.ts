import { isModeratorRequest } from "@/lib/moderatorAuth";
import { addPin, readPins } from "@/lib/pinsStore";
import type { Pin } from "@/types/pin";

/** GET /api/pins — anyone can read the shared pin list. */
export async function GET() {
  const pins = await readPins();
  return Response.json({ pins });
}

/**
 * POST /api/pins — moderators only.
 * Body: { name, xPercent, yPercent }
 */
export async function POST(request: Request) {
  if (!(await isModeratorRequest())) {
    return Response.json({ error: "Moderator login required." }, { status: 401 });
  }

  let body: { name?: unknown; xPercent?: unknown; yPercent?: unknown };
  try {
    body = (await request.json()) as {
      name?: unknown;
      xPercent?: unknown;
      yPercent?: unknown;
    };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const xPercent = typeof body.xPercent === "number" ? body.xPercent : NaN;
  const yPercent = typeof body.yPercent === "number" ? body.yPercent : NaN;

  if (!name || name.length > 80) {
    return Response.json({ error: "Pin name must be 1–80 characters." }, { status: 400 });
  }
  if (
    !Number.isFinite(xPercent) ||
    !Number.isFinite(yPercent) ||
    xPercent < 0 ||
    xPercent > 100 ||
    yPercent < 0 ||
    yPercent > 100
  ) {
    return Response.json({ error: "Pin coordinates must be 0–100%." }, { status: 400 });
  }

  const pin: Pin = {
    id: crypto.randomUUID(),
    name,
    xPercent,
    yPercent,
  };

  const pins = await addPin(pin);
  return Response.json({ pin, pins }, { status: 201 });
}

import { cookies } from "next/headers";
import {
  createSessionToken,
  isValidModeratorCode,
  sessionCookieOptions,
} from "@/lib/moderatorAuth";

/**
 * POST /api/auth/login
 * Body: { code: string }
 * Checks the code on the server (never ships MODERATOR_CODE to the browser).
 */
export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return Response.json({ error: "Enter the moderator code." }, { status: 400 });
  }

  try {
    if (!isValidModeratorCode(code)) {
      return Response.json({ error: "Incorrect code." }, { status: 401 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server misconfigured.";
    return Response.json({ error: message }, { status: 500 });
  }

  const token = createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieOptions(token));

  return Response.json({ ok: true, isModerator: true });
}

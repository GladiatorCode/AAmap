import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/** Cookie name for the signed moderator session. */
export const MOD_COOKIE = "gladymap_mod";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getModeratorCode(): string {
  const code = process.env.MODERATOR_CODE;
  if (!code) {
    throw new Error("MODERATOR_CODE is missing. Copy .env.example to .env.local.");
  }
  return code;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is missing. Copy .env.example to .env.local.");
  }
  return secret;
}

/** Compare codes without leaking length/timing clues when lengths match. */
export function codesMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isValidModeratorCode(input: string): boolean {
  return codesMatch(input, getModeratorCode());
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/** Build a signed cookie value: "mod:<expiryMs>.<hmac>" */
export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `mod:${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) {
    return false;
  }

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);

  try {
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }
  } catch {
    return false;
  }

  const parts = payload.split(":");
  if (parts[0] !== "mod" || !parts[1]) {
    return false;
  }

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  return true;
}

/** True when the current request has a valid moderator cookie. */
export async function isModeratorRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(MOD_COOKIE)?.value);
}

export function sessionCookieOptions(token: string) {
  return {
    name: MOD_COOKIE,
    value: token,
    httpOnly: true,
    // Secure only in production so local http://localhost still works.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

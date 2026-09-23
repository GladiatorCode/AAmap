import { cookies } from "next/headers";
import { MOD_COOKIE } from "@/lib/moderatorAuth";

/** POST /api/auth/logout — clears the moderator session cookie. */
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(MOD_COOKIE);
  return Response.json({ ok: true, isModerator: false });
}

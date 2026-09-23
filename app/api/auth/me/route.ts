import { isModeratorRequest } from "@/lib/moderatorAuth";

/** GET /api/auth/me — tells the UI if this browser is logged in as moderator. */
export async function GET() {
  const isModerator = await isModeratorRequest();
  return Response.json({ isModerator });
}

import { isModeratorRequest } from "@/lib/moderatorAuth";
import { removePin } from "@/lib/pinsStore";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** DELETE /api/pins/:id — moderators only. */
export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await isModeratorRequest())) {
    return Response.json({ error: "Moderator login required." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: "Missing pin id." }, { status: 400 });
  }

  const pins = await removePin(id);
  if (!pins) {
    return Response.json({ error: "Pin not found." }, { status: 404 });
  }

  return Response.json({ pins });
}

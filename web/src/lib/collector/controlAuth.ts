import { authorizeOperations } from "../admin/authorize";
import { isCronAuthorized } from "./cronAuth";

export async function authorizeCollectorControl(request: Request) {
  if (isCronAuthorized(request)) return { status: 200 as const, actorId: null };
  const access = await authorizeOperations(request);
  return { status: access.status, actorId: access.user?.id || null };
}

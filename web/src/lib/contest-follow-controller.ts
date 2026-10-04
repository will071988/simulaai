export type FollowState = { favorite: boolean; following: boolean; ready: boolean; saving: boolean; error: string };
export type FollowSession = { access_token: string } | null;
export const initialFollowState: FollowState = { favorite: false, following: false, ready: false, saving: false, error: "" };

/** Ignore stale requests after auth changes/unmount; serialize writes synchronously. */
export function createContestFollowController(contestId: string, publish: (state: FollowState) => void, request: typeof fetch = fetch) {
  let state = { ...initialFollowState };
  let session: FollowSession = null;
  let revision = 0;
  let disposed = false;
  let pending: AbortController | null = null;
  const update = (patch: Partial<FollowState>) => { state = { ...state, ...patch }; if (!disposed) publish(state); };
  const current = (version: number) => !disposed && revision === version;
  async function load(next: FollowSession) {
    if (disposed) return;
    const version = ++revision;
    pending?.abort(); pending = new AbortController();
    session = next;
    update({ ...initialFollowState });
    if (!next) { update({ ready: true }); return; }
    try {
      const response = await request(`/api/follows?concursoId=${encodeURIComponent(contestId)}`, { headers: { authorization: `Bearer ${next.access_token}` }, cache: "no-store", signal: pending.signal });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const payload = await response.json();
      const follow = payload.data?.follow;
      if (follow !== null && (!follow || follow.concurso_id !== contestId || typeof follow.is_favorite !== "boolean" || typeof follow.is_following !== "boolean")) throw new Error("INVALID_FOLLOW");
      if (current(version)) update({ favorite: follow?.is_favorite ?? false, following: follow?.is_following ?? false, ready: true });
    } catch {
      if (current(version)) update({ ready: false, error: "Não foi possível carregar suas preferências. Tente novamente." });
    }
  }
  async function toggle(field: "favorite" | "following"): Promise<"login" | void> {
    if (disposed || !state.ready || state.saving) return;
    if (!session) return "login";
    const version = revision;
    const desired = { favorite: state.favorite, following: state.following, [field]: !state[field] };
    update({ saving: true, error: "" });
    pending = new AbortController();
    try {
      const response = await request("/api/follows", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ concursoId: contestId, ...desired }), signal: pending.signal });
      if (!response.ok) throw new Error("SAVE_FAILED");
      if (current(version)) update(desired);
    } catch {
      // The server may have committed before the connection failed: reload before writing again.
      if (current(version)) update({ ready: false, error: "Não foi possível confirmar a alteração. Recarregue suas preferências antes de tentar novamente." });
    } finally {
      if (current(version)) update({ saving: false });
    }
  }
  return { load, toggle, retry: () => load(session), dispose: () => { disposed = true; revision++; pending?.abort(); } };
}

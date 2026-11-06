import { supabase } from "../lib/supabase";
let pending: ReturnType<typeof supabase.auth.refreshSession> | null = null;
export async function renewRequestToken(
  sentToken: string,
): Promise<string | null> {
  const before = (await supabase.auth.getSession()).data.session;
  if (!before) return null;
  if (before.access_token !== sentToken) {
    try {
      const payload = JSON.parse(
        atob(sentToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      return payload.sub === before.user.id ? before.access_token : null;
    } catch {
      return null;
    }
  }
  const owner = before.user.id;
  if (!pending)
    pending = supabase.auth.refreshSession().finally(() => {
      pending = null;
    });
  const result = await pending;
  const after = (await supabase.auth.getSession()).data.session;
  return !result.error &&
    after?.user.id === owner &&
    result.data.session?.user.id === owner
    ? after.access_token
    : null;
}

// Thin adapter over supabase-js. Everything the app needs from the cloud goes through this surface, so it can be faked in tests.
const NET = /failed to fetch|networkerror|load failed|network request failed|offline|fetch failed/i;
const fail = (error) => {
  const msg = error?.message || String(error);
  const e = new Error(NET.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'You appear to be offline' : msg);
  e.offline = e.message === 'You appear to be offline'; throw e;
};
export const TABLES = ['spaces', 'members', 'wallets', 'categories', 'transactions', 'budgets', 'recurring', 'investments', 'activity'];

export function createSupabaseBackend(cfg) {
  if (!cfg?.supabaseUrl || /YOUR-PROJECT/.test(cfg.supabaseUrl) || !cfg.supabaseAnonKey || /YOUR-ANON/.test(cfg.supabaseAnonKey)) return null;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const userOf = (s) => s ? { id: s.user.id, email: s.user.email, name: s.user.user_metadata?.name || s.user.email } : null;
  return {
    auth: {
      async getSession() { const { data } = await sb.auth.getSession(); return userOf(data.session); },
      async signUp(email, password, name) { const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } }); if (error) fail(error);
        if (!data.session) throw new Error('Check your email to confirm your account, then sign in. (Or turn off "Confirm email" in Supabase → Authentication.)'); return userOf(data.session); },
      async signIn(email, password) { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) fail(error); return userOf(data.session); },
      async signOut() { await sb.auth.signOut(); },
      async changePassword(email, current, next) {
        const { error: e1 } = await sb.auth.signInWithPassword({ email, password: current }); if (e1) throw new Error('Current password is incorrect');
        const { error } = await sb.auth.updateUser({ password: next }); if (error) fail(error); },
      onSignedOut(cb) { sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') cb(); }); },
    },
    async fetchAll(table) {
      if (table === 'activity') { const { data, error } = await sb.from(table).select('*').order('id', { ascending: false }).limit(60); if (error) fail(error); return data; }
      const out = [], size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await sb.from(table).select('*').order(table === 'members' ? 'joined_at' : table === 'spaces' ? 'created_at' : 'id', { ascending: true }).range(from, from + size - 1);
        if (error) fail(error); out.push(...data); if (data.length < size) break;
      }
      return out;
    },
    async insert(table, row) { const { data, error } = await sb.from(table).insert(row).select().single(); if (error) fail(error); return data; },
    async update(table, match, patch) { let q = sb.from(table).update(patch); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); const { data, error } = await q.select(); if (error) fail(error); if (!data.length) throw new Error('Not allowed or not found'); return data[0]; },
    async remove(table, match) { let q = sb.from(table).delete(); for (const [k, v] of Object.entries(match)) q = q.eq(k, v); const { error } = await q; if (error) fail(error); },
    async rpc(name, args = {}) { const { data, error } = await sb.rpc(name, args); if (error) fail(error); return data; },
    subscribe(spaceId, onTable, onStatus) {
      const ch = sb.channel('space-' + spaceId);
      for (const t of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: t === 'spaces' ? `id=eq.${spaceId}` : `space_id=eq.${spaceId}` }, () => onTable(t));
      ch.subscribe((status) => onStatus?.(status));
      return () => sb.removeChannel(ch);
    },
  };
}

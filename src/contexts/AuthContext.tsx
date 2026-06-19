import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import type { AppRole, Profile } from "@/lib/types";
import { resolvePermissions } from "@/lib/permissions";

interface AuthState {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: Set<string>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: AppRole[]) => boolean;
  can: (key: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadFor = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: p }, { data: r }] = await Promise.all([
      db.from("profiles").select("*").eq("id", uid).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(p ?? null);
    setRoles(((r ?? []) as { role: AppRole }[]).map((x) => x.role));
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    await loadFor(uid);
  }, [loadFor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        loadFor(uid);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh, loadFor]);

  // Touch last_active_at every 30 minutes while the tab is open
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(async () => {
      try {
        await db.rpc("touch_active");
      } catch {
        // non-critical
      }
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setUserId(null);
  }, []);

  const permissions = useMemo(
    () => resolvePermissions(roles, profile?.permissions ?? null),
    [roles, profile],
  );

  const hasRole = useCallback(
    (...needed: AppRole[]) => needed.some((r) => roles.includes(r)),
    [roles],
  );

  const can = useCallback((key: string) => permissions.has(key), [permissions]);

  return (
    <Ctx.Provider value={{ loading, userId, profile, roles, permissions, signOut, refresh, hasRole, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function SupabaseSmokeTest() {
const { role, loading } = useAuth(); if (loading) return null;
const [state, setState] = useState({ loading: true, sessionUserId: null, data: null, error: null });

  useEffect(() => {
    (async () => {
      // 1) Check session (safe async spot)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const sessionUserId = sessionData?.session?.user?.id ?? null;

      // 2) Try a small query
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, role")
        .limit(5);

      setState({
        loading: false,
        sessionUserId,
        data,
        error: sessionError ?? error ?? null,
      });
    })();
  }, []);

  if (state.loading || authLoading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>Supabase Smoke Test</h2>
      <pre>
        {JSON.stringify(
          {
            auth: { userId: user?.id ?? null, role: role ?? null, authError: authError ?? null },
            sessionUserId: state.sessionUserId,
            query: { data: state.data, error: state.error },
          },
          null,
          2
        )}
      </pre>
    </div>
  );
}





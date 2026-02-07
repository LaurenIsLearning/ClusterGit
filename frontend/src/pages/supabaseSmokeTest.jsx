import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";

export default function SupabaseSmokeTest() {
  const { user, role, loading, authError } = useAuth();
  const [query, setQuery] = useState({ data: [], error: null });

  useEffect(() => {
    let alive = true;

    (async () => {
      // Example query: read your own profile row
      if (!user?.id) {
        if (alive) setQuery({ data: [], error: null });
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, role, display_name")
        .eq("user_id", user.id);

      if (!alive) return;
      setQuery({ data: data ?? [], error: error?.message ?? null });
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const payload = {
    auth: {
      userId: user?.id ?? null,
      role: role ?? null,
      authError: authError ?? null,
      loading,
    },
    query,
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Supabase Smoke Test</h1>
      <pre className="text-sm bg-[--bg-tertiary] border border-[--border-color] rounded-lg p-4 overflow-auto">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}






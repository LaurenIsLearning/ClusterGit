import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function SupabaseSmokeTest() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, role")
        .limit(5);

      setState({ loading: false, data, error });
    })();
  }, []);

  if (state.loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>Supabase Smoke Test</h2>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}


import { supabase } from "./supabase.js";

export async function loadLatestNodeSnapshots() {
  const { data, error } = await supabase
    .from("node_health")
    .select("node_key, status, cpu_percent, temp_c, storage_used_bytes, storage_total_bytes, heartbeat_at")
    .order("heartbeat_at", { ascending: false });

  if (error) {
    throw error;
  }

  const latestNodeByKey = new Map();
  for (const row of data || []) {
    if (!latestNodeByKey.has(row.node_key)) {
      latestNodeByKey.set(row.node_key, row);
    }
  }

  return [...latestNodeByKey.values()].map((row) => {
    const usedBytes = Number(row.storage_used_bytes) || 0;
    const totalBytes = Number(row.storage_total_bytes) || 0;
    const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;

    return {
      id: row.node_key,
      status: row.status || "unknown",
      cpu: Number(row.cpu_percent) || 0,
      temp: row.temp_c == null ? null : Number(row.temp_c),
      heartbeat_at: row.heartbeat_at || null,
      storage: {
        used: usedPercent,
        used_bytes: usedBytes,
        total_bytes: totalBytes,
      },
    };
  });
}

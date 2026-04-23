import { getApiBaseUrl } from "../utils/api";
import { mockService } from "./mockData";

const rawApiUrl = getApiBaseUrl();
const normalizedApiUrl = rawApiUrl.replace(/\/+$/, "");
const API_BASE_URL = normalizedApiUrl.endsWith("/api")
  ? normalizedApiUrl
  : `${normalizedApiUrl}/api`;

async function safeParseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function normalizeNodeTelemetry(node) {
  const storageUsedBytes = Number(node?.storage?.used_bytes ?? node?.storageUsedBytes ?? 0) || 0;
  const storageTotalBytes = Number(node?.storage?.total_bytes ?? node?.storageTotalBytes ?? 0) || 0;
  const rawStoragePercent = Number(node?.storage?.used ?? node?.storage_used_percent ?? NaN);
  const computedStoragePercent = storageTotalBytes > 0
    ? (storageUsedBytes / storageTotalBytes) * 100
    : 0;
  const storageUsedPercent = Math.max(0, Math.min(
    100,
    Number.isFinite(rawStoragePercent) ? rawStoragePercent : computedStoragePercent
  ));

  return {
    id: node?.id || "unknown-node",
    status: node?.status || "unknown",
    cpuPercent: Number(node?.cpu ?? node?.cpuPercent ?? 0) || 0,
    temperatureC: node?.temp == null && node?.temp_c == null && node?.temperatureC == null
      ? null
      : Number(node?.temp ?? node?.temp_c ?? node?.temperatureC ?? 0),
    heartbeatAt: node?.heartbeat_at || node?.heartbeatAt || null,
    uptimeLabel: node?.uptime || null,
    storageUsedPercent,
    storageUsedBytes,
    storageTotalBytes,
  };
}

export const publicService = {
  async getNodes() {
    const response = await fetch(`${API_BASE_URL}/public/nodes`, { method: "GET" });
    const data = await safeParseJson(response);

    if (response.ok && Array.isArray(data?.nodes) && data.nodes.length > 0) {
      return data.nodes.map(normalizeNodeTelemetry);
    }

    const mock = await mockService.getClusterStatus();
    return (mock.nodes || []).map(normalizeNodeTelemetry);
  },
};

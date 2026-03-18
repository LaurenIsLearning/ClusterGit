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
  const storageUsedPercent = Number(node?.storage?.used ?? 0) || 0;
  const storageUsedBytes = Number(node?.storage?.used_bytes ?? 0) || 0;
  const storageTotalBytes = Number(node?.storage?.total_bytes ?? 0) || 0;

  return {
    id: node?.id || "unknown-node",
    ip: node?.ip || "",
    status: node?.status || "unknown",
    cpuPercent: Number(node?.cpu ?? 0) || 0,
    temperatureC: node?.temp == null ? null : Number(node.temp),
    heartbeatAt: node?.heartbeat_at || null,
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

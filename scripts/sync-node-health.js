import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const backendEnvPath = path.join(repoRoot, "backend", ".env");
const backendRequire = createRequire(path.join(repoRoot, "backend", "package.json"));
const dotenv = backendRequire("dotenv");
const { createClient } = backendRequire("@supabase/supabase-js");

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else {
  dotenv.config();
}

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PROMETHEUS_URL,
  PROMETHEUS_STORAGE_MOUNTPOINTS,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const prometheusBaseUrl = String(PROMETHEUS_URL || "http://127.0.0.1:9090").replace(/\/+$/, "");
const DEFAULT_STORAGE_MOUNTPOINTS = "/,/mnt/ssd,/mnt/cluster-storage";

function normalizePrometheusBaseUrl(url) {
  return String(url).replace(/\/+$/, "");
}

async function queryPrometheus(promql) {
  const baseUrl = normalizePrometheusBaseUrl(prometheusBaseUrl);
  const endpoint = `${baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Prometheus query failed (${response.status}) for: ${promql}`);
  }

  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(`Prometheus returned non-success for query: ${promql}`);
  }

  return payload.data?.result || [];
}

async function queryPrometheusFirstAvailable(promqlQueries) {
  for (const promql of promqlQueries) {
    const result = await queryPrometheus(promql);
    if (result.length > 0) {
      return result;
    }
  }
  return [];
}

function metricValue(sample) {
  return Number(sample?.value?.[1] || 0);
}

function metricLabel(sample, ...keys) {
  for (const key of keys) {
    const value = sample?.metric?.[key];
    if (value) return value;
  }
  return null;
}

function trimPort(instance) {
  return String(instance || "").replace(/:\d+$/, "");
}

function inferNodeStatus(readyValue) {
  if (readyValue >= 1) return "online";
  if (readyValue > 0) return "warning";
  return "offline";
}

function parseStorageMountpoints(rawValue) {
  return [...new Set(String(`${DEFAULT_STORAGE_MOUNTPOINTS},${rawValue || ""}`)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
}

function escapePrometheusRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}

function buildFilesystemQuery(metricName) {
  const mountpoints = parseStorageMountpoints(PROMETHEUS_STORAGE_MOUNTPOINTS);
  const mountpointRegex = mountpoints.map(escapePrometheusRegex).join("|");
  return `sum by (instance) (${metricName}{fstype!~"tmpfs|overlay",mountpoint=~"${mountpointRegex}"})`;
}

function normalizeTemperatureC(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 150 ? value / 1000 : value;
}

async function collectNodeSnapshots() {
  const [
    readySamples,
    unameSamples,
    cpuSamples,
    fsAvailSamples,
    fsSizeSamples,
    tempSamples,
  ] = await Promise.all([
    queryPrometheus('max by (node) (kube_node_status_condition{condition="Ready",status="true"})'),
    queryPrometheus("node_uname_info"),
    queryPrometheus('100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))'),
    queryPrometheus(buildFilesystemQuery("node_filesystem_avail_bytes")),
    queryPrometheus(buildFilesystemQuery("node_filesystem_size_bytes")),
    queryPrometheusFirstAvailable([
      'max by (instance) (node_thermal_zone_temp)',
      'max by (instance) (node_hwmon_temp_celsius)',
      'max by (instance) (node_hwmon_temp_celsius{chip!=""})',
      'max by (instance) (node_thermal_zone_temp / 1000)',
    ]),
  ]);

  const nodeByInstance = new Map();
  for (const sample of unameSamples) {
    const instance = metricLabel(sample, "instance");
    const nodename = metricLabel(sample, "nodename");
    if (instance && nodename) {
      nodeByInstance.set(trimPort(instance), nodename);
    }
  }

  const readyByNode = new Map();
  for (const sample of readySamples) {
    const node = metricLabel(sample, "node");
    if (node) readyByNode.set(node, metricValue(sample));
  }

  const cpuByNode = new Map();
  for (const sample of cpuSamples) {
    const instance = trimPort(metricLabel(sample, "instance"));
    const node = nodeByInstance.get(instance) || instance;
    if (node) cpuByNode.set(node, metricValue(sample));
  }

  const availByNode = new Map();
  for (const sample of fsAvailSamples) {
    const instance = trimPort(metricLabel(sample, "instance"));
    const node = nodeByInstance.get(instance) || instance;
    if (node) availByNode.set(node, metricValue(sample));
  }

  const totalByNode = new Map();
  for (const sample of fsSizeSamples) {
    const instance = trimPort(metricLabel(sample, "instance"));
    const node = nodeByInstance.get(instance) || instance;
    if (node) totalByNode.set(node, metricValue(sample));
  }

  const tempByNode = new Map();
  for (const sample of tempSamples) {
    const instance = trimPort(metricLabel(sample, "instance"));
    const node = nodeByInstance.get(instance) || instance;
    if (node) tempByNode.set(node, metricValue(sample));
  }

  const allNodeKeys = new Set([
    ...readyByNode.keys(),
    ...cpuByNode.keys(),
    ...availByNode.keys(),
    ...totalByNode.keys(),
    ...tempByNode.keys(),
    ...nodeByInstance.values(),
  ]);

  const now = new Date().toISOString();
  return [...allNodeKeys].map((nodeKey) => {
    const totalBytes = Math.round(totalByNode.get(nodeKey) || 0);
    const availBytes = Math.round(availByNode.get(nodeKey) || 0);
    const usedBytes = Math.max(0, totalBytes - availBytes);
    const readyValue = readyByNode.get(nodeKey) || 0;
    const ipAddress = [...nodeByInstance.entries()].find(([, node]) => node === nodeKey)?.[0] || null;
    const temperatureC = normalizeTemperatureC(tempByNode.get(nodeKey));

    return {
      node_key: nodeKey,
      ip_address: ipAddress,
      status: inferNodeStatus(readyValue),
      cpu_percent: Number((cpuByNode.get(nodeKey) || 0).toFixed(2)),
      temp_c: temperatureC == null ? null : Number(temperatureC.toFixed(2)),
      storage_used_bytes: usedBytes,
      storage_total_bytes: totalBytes,
      heartbeat_at: now,
    };
  });
}

async function main() {
  const rows = await collectNodeSnapshots();

  if (rows.length === 0) {
    console.log("No node metrics found.");
    return;
  }

  // keep a current snapshot per node by replacing the latest row on each run.
  const { error: deleteError } = await supabase
    .from("node_health")
    .delete()
    .in("node_key", rows.map((row) => row.node_key));

  if (deleteError) {
    throw new Error(`Failed to clear old node_health rows: ${deleteError.message}`);
  }

  const { error } = await supabase
    .from("node_health")
    .insert(rows);

  if (error) {
    throw new Error(`Failed to write node_health rows: ${error.message}`);
  }

  console.log(
    `Inserted ${rows.length} node_health rows at ${new Date().toISOString()} from ${prometheusBaseUrl} using mountpoints: ${parseStorageMountpoints(PROMETHEUS_STORAGE_MOUNTPOINTS).join(", ")}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

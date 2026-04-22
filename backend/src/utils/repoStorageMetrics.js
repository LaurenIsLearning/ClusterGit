const DEFAULT_PROMETHEUS_URL = "http://127.0.0.1:9090";

function normalizePrometheusBaseUrl(rawUrl) {
  return String(rawUrl || DEFAULT_PROMETHEUS_URL).replace(/\/+$/, "");
}

async function queryPrometheusValue(promql) {
  const baseUrl = normalizePrometheusBaseUrl(process.env.PROMETHEUS_URL);
  const endpoint = `${baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Prometheus query failed (${response.status}) for: ${promql}`);
  }

  const payload = await response.json();
  if (payload.status !== "success") {
    throw new Error(`Prometheus returned non-success for query: ${promql}`);
  }

  const sample = payload.data?.result?.[0];
  return sample ? Number(sample.value?.[1] || 0) : null;
}

export function resolveRepoVolumeTarget(environmentKey) {
  if (String(environmentKey || "").startsWith("preview:")) {
    const branch = environmentKey.slice("preview:".length).trim().toLowerCase();
    if (!branch) return null;

    return {
      namespace: `preview-${branch}`,
      persistentVolumeClaim: `repo-vol-${branch}`,
    };
  }

  if (environmentKey === "production" || environmentKey === "develop" || environmentKey === "local") {
    return {
      namespace: "storage",
      persistentVolumeClaim: "repo-vol-rwo-pvc",
    };
  }

  return null;
}

export async function loadRepoVolumeMetrics(environmentKey) {
  const target = resolveRepoVolumeTarget(environmentKey);
  if (!target || !process.env.PROMETHEUS_URL) {
    return null;
  }

  const selector = `{namespace="${target.namespace}",persistentvolumeclaim="${target.persistentVolumeClaim}"}`;

  const [capacityBytes, availableBytes, usedBytes, requestedBytes] = await Promise.all([
    queryPrometheusValue(`kubelet_volume_stats_capacity_bytes${selector}`),
    queryPrometheusValue(`kubelet_volume_stats_available_bytes${selector}`),
    queryPrometheusValue(`kubelet_volume_stats_used_bytes${selector}`),
    queryPrometheusValue(`kube_persistentvolumeclaim_resource_requests_storage_bytes${selector}`),
  ]);

  const effectiveCapacityBytes = capacityBytes ?? requestedBytes ?? null;
  const effectiveUsedBytes = usedBytes ?? (
    effectiveCapacityBytes != null && availableBytes != null
      ? Math.max(0, effectiveCapacityBytes - availableBytes)
      : null
  );

  if (effectiveCapacityBytes == null && effectiveUsedBytes == null) {
    return null;
  }

  return {
    namespace: target.namespace,
    persistentVolumeClaim: target.persistentVolumeClaim,
    capacityBytes: effectiveCapacityBytes,
    availableBytes,
    usedBytes: effectiveUsedBytes,
    requestedBytes,
  };
}

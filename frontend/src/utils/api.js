export function getApiBaseUrl() {
  const host = window.location.hostname;

  // Local dev
  if (host === "localhost") {
    return "http://localhost:3000";
  }

  // Preview deployments
  if (host.endsWith(".clustergit.pages.dev")) {
    const branch = host.split(".")[0].replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return `https://${branch}.clustergit.com`;
  }

  // Production
  if (host === "clustergit.com") {
    return "https://api.clustergit.com";
  }

  return "https://api.clustergit.com";
}
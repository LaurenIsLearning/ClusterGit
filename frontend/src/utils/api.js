export function getApiBaseUrl() {
  const host = window.location.hostname;

  // Local dev
  if (host === "localhost") {
    return "http://localhost:8080"; //TODO: Make pull the PORT env var
  }

  // Preview deployments
  if (host.endsWith(".clustergit.pages.dev")) {
    const branch = host.split(".")[0].replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return `https://${branch}.clustergit.com`;
  }

  // Production (clustergit.com frontend → develop.clustergit.com backend)
  // clustergit.com is Cloudflare Pages so API calls must go to the cluster directly
  if (host === "clustergit.com") {
    return "https://develop.clustergit.com";
  }

  return "https://develop.clustergit.com";
}
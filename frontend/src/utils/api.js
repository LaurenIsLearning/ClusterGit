export function getApiBaseUrl() {
  const host = window.location.hostname;

  // sends local dev to the local backend
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "http://localhost:3001";
  }

  if (host === "10.27.12.244") {
    return "http://10.27.12.244:3001"
  }

  // maps each pages preview to the matching cluster preview backend
  if (host.endsWith(".clustergit.pages.dev")) {
    const branch = host.split(".")[0].replace(/[^a-z0-9-]/gi, '').toLowerCase();
    return `https://${branch}.clustergit.com`;
  }

  // keeps production frontend talking to the cluster backend instead of pages itself
  if (host === "clustergit.com") {
    return "https://develop.clustergit.com";
  }

  return "https://develop.clustergit.com";
}

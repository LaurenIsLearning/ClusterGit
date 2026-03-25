function normalizeHost(rawHost) {
    // strips ports and proxy formatting so env detection stays consistent
    return String(rawHost || "")
        .split(",")[0]
        .trim()
        .replace(/:\d+$/, "")
        .toLowerCase();
}

// normalize the incoming host into one environment key shared by frontend and backend.
export function getRequestHost(req) {
    return normalizeHost(
        req.headers["x-forwarded-host"]
        || req.headers.host
        || req.hostname
        || ""
    );
}

// map local, preview, develop, and production hosts to a stable environment label.
export function getEnvironmentKey(req) {
    const host = getRequestHost(req);

    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "10.27.12.244") {
        return "local";
    }

    if (host === "clustergit.com" || host === "api.clustergit.com") {
        return "production";
    }

    if (host === "develop.clustergit.com") {
        return "develop";
    }

    if (host.endsWith(".clustergit.com")) {
        return `preview:${host.replace(/\.clustergit\.com$/, "")}`;
    }

    if (host.endsWith(".clustergit.pages.dev")) {
        return `preview:${host.replace(/\.clustergit\.pages\.dev$/, "")}`;
    }

    return host;
}

// keep legacy local rows visible while making preview and production strict.
export function applyEnvironmentFilter(query, environmentKey, column = "environment_key") {
    if (environmentKey === "local") {
        // keeps old null rows visible locally while previews stay isolated
        if (typeof query.or === "function") {
            return query.or(`${column}.eq.local,${column}.is.null`);
        }

        // test doubles and older query builders may not implement `.or()`
        return query;
    }

    return query.eq(column, environmentKey);
}

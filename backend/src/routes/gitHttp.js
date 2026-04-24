import express from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { createWriteStream, createReadStream } from "fs";
import { resolveExistingRepoPath, getAnnexUuid } from "../services/gitService.js";
import { syncPushMetadata } from "../services/syncService.js";

const execAsync = promisify(execFile);

const router = express.Router();

const GIT_BIN = process.platform === "win32" ? "git" : "/usr/bin/git";

function parseForwardedHeader(value = "") {
    return String(value || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
}

function getPublicProtocol(req) {
    const cfVisitor = req.headers["cf-visitor"];
    if (typeof cfVisitor === "string" && cfVisitor) {
        try {
            const parsed = JSON.parse(cfVisitor);
            if (parsed?.scheme === "https" || parsed?.scheme === "http") {
                return parsed.scheme;
            }
        } catch {
            // ignore malformed proxy metadata and fall through
        }
    }

    const forwardedProto = parseForwardedHeader(req.headers["x-forwarded-proto"]);
    if (forwardedProto === "https" || forwardedProto === "http") {
        return forwardedProto;
    }

    const host = parseForwardedHeader(req.headers["x-forwarded-host"] || req.headers.host);
    if (host.endsWith(".clustergit.com") || host === "clustergit.com") {
        return "https";
    }

    return req.protocol || "http";
}

function getPublicHost(req) {
    return parseForwardedHeader(req.headers["x-forwarded-host"] || req.headers.host);
}

// Collapse double slashes that git-annex produces when the remote URL has a
// trailing slash (e.g. Drake.git//config → Drake.git/config).
router.use((req, _res, next) => {
    if (req.url.includes("//")) req.url = req.url.replace(/\/\/+/g, "/");
    next();
});

/**
 * Resolve the bare repo path from the URL params.
 * Strips trailing .git and looks up the real path on disk.
 */
async function resolveRepo(req) {
    const { userId, repo } = req.params;
    const projectName = repo.replace(/\.git$/, "");
    return resolveExistingRepoPath(userId, projectName);
}

function decodeAnnexPathValue(value = "") {
    if (value.startsWith("[") && value.endsWith("]")) {
        const encoded = value.slice(1, -1);
        const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        return Buffer.from(padded, "base64").toString("utf8");
    }
    return value;
}

async function resolveRepoWithUuid(req) {
    const repoPath = await resolveRepo(req);
    const repoUuid = await getAnnexUuid(repoPath);
    const requestedUuid = decodeAnnexPathValue(req.params.uuid || "");

    if (!repoUuid || (requestedUuid && requestedUuid !== repoUuid)) {
        return { repoPath, repoUuid: null };
    }

    return { repoPath, repoUuid };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /:userId/:repo/config
//
// git-annex probes this URL to discover the remote's annex UUID before deciding
// whether to mark the remote as annex-ignore.  We return a minimal git config
// fragment containing the annex.uuid so git-annex can use the remote for
// content transfer via the regular git HTTP protocol.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:userId/:repo/config", async (req, res) => {
    try {
        const repoPath = await resolveRepo(req);
        const uuid = await getAnnexUuid(repoPath);
        if (!uuid) return res.status(404).end("Not Found\n");

        // Advertise the smart HTTP annex URL so git-annex clients populate
        // remote.<name>.annexUrl and use the HTTP P2P API for content transfer.
        const protocol = getPublicProtocol(req);
        const host = getPublicHost(req);
        const repoUrl = `${protocol}://${host}/git/${req.params.userId}/${req.params.repo}`;
        const annexUrl = `annex+${repoUrl}`;

        res.setHeader("Content-Type", "text/plain");
        res.end(`[annex]\n\tuuid = ${uuid}\n\turl = ${annexUrl}\n\tp2phttp-url = ${repoUrl}\n`);
    } catch {
        res.status(500).end("Internal server error\n");
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// git-annex HTTP P2P API
//
// The smart HTTP config advertises annex.url, and clients then request:
//   /git/<user>/<repo>/git-annex/<uuid>/vN/<action>
//
// Keep the older v3 key endpoints too for backwards compatibility.
// ─────────────────────────────────────────────────────────────────────────────

function annexHashDir(key, upper = false) {
    // git-annex uses MD5 of the key, first 4 hex chars split as 2+2 dirs.
    // Older versions used upper-case hex; newer ones use lower-case.
    const md5 = crypto.createHash("md5").update(key).digest("hex");
    const hex = upper ? md5.toUpperCase() : md5;
    return path.join(hex.slice(0, 2), hex.slice(2, 4));
}

function annexObjectPath(repoPath, key, upper = false) {
    return path.join(repoPath, ".git", "annex", "objects", annexHashDir(key, upper), key, key);
}

async function findAnnexContent(repoPath, key) {
    // First ask git-annex itself — it knows the exact layout.
    try {
        const { stdout } = await execAsync(GIT_BIN, ["annex", "contentlocation", key], { cwd: repoPath });
        const rel = stdout.trim();
        if (rel) {
            const abs = path.join(repoPath, rel);
            await fs.access(abs);
            return abs;
        }
    } catch { /* fall through to filesystem check */ }

    // Fallback: check both lower and upper hashdir layouts directly.
    // This handles the case where the location log is stale or the content
    // was written directly (e.g. via the P2P HTTP POST route) without updating
    // the git-annex branch yet.
    for (const upper of [false, true]) {
        const candidate = annexObjectPath(repoPath, key, upper);
        try {
            await fs.access(candidate);
            return candidate;
        } catch { /* try next layout */ }
    }

    return null;
}

async function resolveKeyRequest(req) {
    const { repoPath, repoUuid } = await resolveRepoWithUuid(req);
    if (!repoUuid) return { repoPath, repoUuid: null, key: null };

    const key = decodeAnnexPathValue(req.params.key || req.query.key || "");
    return { repoPath, repoUuid, key };
}

async function streamAnnexKeyContent(req, res, includeLengthHeader = true) {
    try {
        const { repoPath, repoUuid, key } = await resolveKeyRequest(req);
        if (!repoUuid || !key) return res.status(404).end();

        const found = await findAnnexContent(repoPath, key);
        if (found) {
            const stats = await fs.stat(found);
            if (includeLengthHeader) {
                res.setHeader("X-git-annex-data-length", String(stats.size));
            }
            res.setHeader("Content-Type", "application/octet-stream");

            const offset = Number(req.query.offset || 0);
            return createReadStream(found, Number.isFinite(offset) && offset > 0 ? { start: offset } : undefined).pipe(res);
        }
    } catch (err) {
        console.error("[annex GET]", err);
    }
    res.status(404).end();
}

router.get("/:userId/:repo/git-annex/:uuid/key/:key", async (req, res) => {
    await streamAnnexKeyContent(req, res, true);
});

router.get("/:userId/:repo/git-annex/:uuid/:version/key/:key", async (req, res) => {
    await streamAnnexKeyContent(req, res, req.params.version !== "v0");
});

router.head("/:userId/:repo/git-annex/v3/key/:key", async (req, res) => {
    try {
        const repoPath = await resolveRepo(req);
        const key = decodeAnnexPathValue(req.params.key || "");
        const found = await findAnnexContent(repoPath, key);
        if (found) {
            res.setHeader("X-git-annex-key-is-present", "1");
            return res.status(200).end();
        }
    } catch (err) {
        console.error("[annex HEAD]", err);
    }
    res.status(404).end();
});

router.get("/:userId/:repo/git-annex/v3/key/:key", async (req, res) => {
    await streamAnnexKeyContent(req, res, true);
});

async function writeAnnexContent(repoPath, key, req) {
    const targetPath = annexObjectPath(repoPath, key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    await new Promise((resolve, reject) => {
        const ws = createWriteStream(targetPath, { mode: 0o444 });
        req.pipe(ws);
        ws.on("finish", resolve);
        ws.on("error", reject);
        req.on("error", reject);
    });

    return targetPath;
}

function responseWithPlusUuids(version, payload, repoUuid) {
    if (["v2", "v3", "v4"].includes(version) && repoUuid) {
        return { ...payload, plusuuids: [repoUuid] };
    }
    return payload;
}

router.post("/:userId/:repo/git-annex/v3/key/:key", async (req, res) => {
    try {
        const repoPath = await resolveRepo(req);
        const key = decodeAnnexPathValue(req.params.key || "");

        if (!/^[A-Za-z0-9+._-]+$/.test(key)) return res.status(400).end();

        // Already have it — drain body and return success.
        const existing = await findAnnexContent(repoPath, key);
        if (existing) {
            req.resume();
            return res.status(200).end();
        }

        await writeAnnexContent(repoPath, key, req);

        res.status(200).end();
    } catch (err) {
        console.error("[annex POST]", err);
        res.status(500).end();
    }
});

router.post("/:userId/:repo/git-annex/:uuid/:version/checkpresent", async (req, res) => {
    try {
        const { repoPath, repoUuid, key } = await resolveKeyRequest(req);
        if (!repoUuid || !key) return res.status(404).json({ present: false });

        const found = await findAnnexContent(repoPath, key);
        return res.json({ present: Boolean(found) });
    } catch (err) {
        console.error("[annex checkpresent]", err);
        return res.status(500).json({ present: false });
    }
});

router.post("/:userId/:repo/git-annex/:uuid/:version/gettimestamp", async (_req, res) => {
    return res.json({ timestamp: Math.floor(process.uptime()) });
});

router.post("/:userId/:repo/git-annex/:uuid/:version/putoffset", async (req, res) => {
    try {
        const { repoPath, repoUuid, key } = await resolveKeyRequest(req);
        const version = req.params.version;
        if (!repoUuid || !key) return res.status(404).json({ offset: 0 });

        const found = await findAnnexContent(repoPath, key);
        if (found) {
            return res.json(responseWithPlusUuids(version, { alreadyhave: true }, repoUuid));
        }

        const targetPath = annexObjectPath(repoPath, key);
        let offset = 0;
        try {
            const stats = await fs.stat(targetPath);
            offset = stats.size;
        } catch {
            offset = 0;
        }

        return res.json({ offset });
    } catch (err) {
        console.error("[annex putoffset]", err);
        return res.status(500).json({ offset: 0 });
    }
});

router.post("/:userId/:repo/git-annex/:uuid/:version/put", async (req, res) => {
    try {
        const { repoPath, repoUuid, key } = await resolveKeyRequest(req);
        const version = req.params.version;
        if (!repoUuid || !key) return res.status(404).json({ stored: false });

        if (req.query["data-present"] === "true") {
            const found = await findAnnexContent(repoPath, key);
            return res.json(responseWithPlusUuids(version, { stored: Boolean(found) }, found ? repoUuid : null));
        }

        const expectedLength = Number(req.headers["x-git-annex-data-length"] || 0);
        const targetPath = await writeAnnexContent(repoPath, key, req);
        const stats = await fs.stat(targetPath);

        if (expectedLength > 0 && stats.size !== expectedLength) {
            await fs.rm(targetPath, { force: true }).catch(() => { });
            return res.status(400).json({ stored: false });
        }

        return res.json(responseWithPlusUuids(version, { stored: true }, repoUuid));
    } catch (err) {
        console.error("[annex put]", err);
        return res.status(500).json({ stored: false });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:userId/:repo/info/refs?service=git-upload-pack|git-receive-pack
//
// Smart ref advertisement — Git clients hit this first during clone/fetch/push.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:userId/:repo/info/refs", async (req, res) => {
    const service = req.query.service;

    if (service !== "git-upload-pack" && service !== "git-receive-pack") {
        return res.status(403).end("Invalid service\n");
    }

    const repoPath = await resolveRepo(req);

    res.setHeader("Content-Type", `application/x-${service}-advertisement`);
    res.setHeader("Cache-Control", "no-cache");

    // Smart HTTP preamble packet
    const serverAdvert = `# service=${service}\n`;
    const pktLen = (serverAdvert.length + 4).toString(16).padStart(4, "0");
    res.write(pktLen + serverAdvert);
    res.write("0000"); // flush-pkt

    const gitProcess = spawn(GIT_BIN, [
        service.replace("git-", ""),
        "--stateless-rpc",
        "--advertise-refs",
        repoPath,
    ]);

    gitProcess.stdout.pipe(res);

    gitProcess.stderr.on("data", (data) => {
        console.error(`git ${service} info/refs stderr:`, data.toString());
    });

    gitProcess.on("error", (err) => {
        console.error(`Failed to spawn ${service}:`, err);
        if (!res.headersSent) {
            res.status(500).end("Internal server error\n");
        }
    });

    gitProcess.on("close", (code) => {
        if (code !== 0 && !res.headersSent) {
            res.status(500).end("Git process failed\n");
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:userId/:repo/git-upload-pack   (clone / fetch)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:userId/:repo/git-upload-pack", async (req, res) => {
    const repoPath = await resolveRepo(req);

    res.setHeader("Content-Type", "application/x-git-upload-pack-result");
    res.setHeader("Cache-Control", "no-cache");

    const gitProcess = spawn(GIT_BIN, [
        "upload-pack",
        "--stateless-rpc",
        repoPath,
    ]);

    req.pipe(gitProcess.stdin);
    gitProcess.stdout.pipe(res);

    gitProcess.stderr.on("data", (data) => {
        console.error("git-upload-pack stderr:", data.toString());
    });

    gitProcess.on("error", (err) => {
        console.error("Failed to spawn git-upload-pack:", err);
        if (!res.headersSent) {
            res.status(500).end("Internal server error\n");
        }
    });

    gitProcess.on("close", (code) => {
        if (code !== 0 && !res.headersSent) {
            res.status(500).end("Git process failed\n");
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:userId/:repo/git-receive-pack   (push)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:userId/:repo/git-receive-pack", async (req, res) => {
    const repoPath = await resolveRepo(req);

    res.setHeader("Content-Type", "application/x-git-receive-pack-result");
    res.setHeader("Cache-Control", "no-cache");

    const gitProcess = spawn(GIT_BIN, [
        "receive-pack",
        "--stateless-rpc",
        repoPath,
    ]);

    req.pipe(gitProcess.stdin);
    gitProcess.stdout.pipe(res);

    gitProcess.stderr.on("data", (data) => {
        console.error("git-receive-pack stderr:", data.toString());
    });

    gitProcess.on("error", (err) => {
        console.error("Failed to spawn git-receive-pack:", err);
        if (!res.headersSent) {
            res.status(500).end("Internal server error\n");
        }
    });

    gitProcess.on("close", (code) => {
        if (code !== 0 && !res.headersSent) {
            res.status(500).end("Git process failed\n");
            return;
        }

        if (code === 0) {
            // Fire-and-forget: sync file metadata into Supabase so the frontend
            // reflects files pushed from the CLI (git annex push, git push, etc.)
            const projectName = req.params.repo.replace(/\.git$/, "");
            syncPushMetadata(req.params.userId, projectName)
                .catch(err => console.error('[gitHttp] syncPushMetadata threw:', err));
        }
    });
});

export default router;

import express from "express";
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { stat, mkdir, rename, chmod, access } from "fs/promises";
import path from "path";
import { resolveExistingRepoPath, getAnnexUuid } from "../services/gitService.js";
import { syncPushMetadata } from "../services/syncService.js";

const router = express.Router();

const GIT_BIN = process.platform === "win32" ? "git" : "/usr/bin/git";

/**
 * Resolve the bare repo path from the URL params.
 * Strips trailing .git and looks up the real path on disk.
 */
async function resolveRepo(req) {
    const { userId, repo } = req.params;
    const projectName = repo.replace(/\.git$/, "");
    return resolveExistingRepoPath(userId, projectName);
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

        res.setHeader("Content-Type", "text/plain");
        res.end(`[annex]\n\tuuid = ${uuid}\n`);
    } catch {
        res.status(500).end("Internal server error\n");
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

// ─────────────────────────────────────────────────────────────────────────────
// Git annex object transfer   HEAD / GET / PUT
//
// Git annex stores content outside the regular git pack.  When a remote URL is
// HTTP, git annex reads and writes individual objects at:
//   .git/annex/objects/<x>/<y>/<KEY>/<KEY>
// where x/y are the first two pairs of hex chars derived from the key.
//
// These three routes let `git annex push` / `git annex copy` transfer files
// through Cloudflare Tunnel one object at a time instead of bundling everything
// into one giant pack (which hits the 100 MB tunnel limit).
//
// With `git config annex.chunksize 95mb` on the client, even individual files
// over 100 MB are split into ≤95 MB chunks, each a separate PUT request.
// ─────────────────────────────────────────────────────────────────────────────

// Validate x/y (2-char hex dirs) and key/file (annex key name).
// Prevents path traversal — keys must not contain slashes or ".." sequences.
function validateAnnexParams(x, y, key, file) {
    if (!/^[0-9a-f]{2}$/i.test(x)) return false;
    if (!/^[0-9a-f]{2}$/i.test(y)) return false;
    if (key !== file) return false;
    if (key.includes("/") || key.includes("\\") || key.includes("..")) return false;
    if (!/^[A-Z][A-Z0-9]+-/.test(key)) return false; // must start with backend name
    return true;
}

function annexObjectPath(repoPath, x, y, key, file) {
    return path.join(repoPath, ".git", "annex", "objects", x, y, key, file);
}

// HEAD — check whether the server already has this object
router.head("/:userId/:repo/.git/annex/objects/:x/:y/:key/:file", async (req, res) => {
    const { x, y, key, file } = req.params;
    if (!validateAnnexParams(x, y, key, file)) return res.status(400).end();
    try {
        const repoPath = await resolveRepo(req);
        const s = await stat(annexObjectPath(repoPath, x, y, key, file));
        res.setHeader("Content-Length", s.size);
        res.status(200).end();
    } catch {
        res.status(404).end();
    }
});

// GET — download an annex object (used by `git annex copy --from`)
router.get("/:userId/:repo/.git/annex/objects/:x/:y/:key/:file", async (req, res) => {
    const { x, y, key, file } = req.params;
    if (!validateAnnexParams(x, y, key, file)) return res.status(400).end();
    try {
        const repoPath = await resolveRepo(req);
        const objPath = annexObjectPath(repoPath, x, y, key, file);
        const s = await stat(objPath);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", s.size);
        createReadStream(objPath).pipe(res);
    } catch {
        res.status(404).end();
    }
});

// PUT — upload an annex object (used by `git annex push` / `git annex copy --to`)
router.put("/:userId/:repo/.git/annex/objects/:x/:y/:key/:file", async (req, res) => {
    const { x, y, key, file } = req.params;
    if (!validateAnnexParams(x, y, key, file)) return res.status(400).end();
    try {
        const repoPath = await resolveRepo(req);
        const objPath = annexObjectPath(repoPath, x, y, key, file);

        // Idempotent: if the object is already present, drain and ack.
        try {
            await access(objPath);
            req.resume();
            return res.status(200).end();
        } catch {}

        await mkdir(path.dirname(objPath), { recursive: true });

        // Write to a temp file first so a partial upload never leaves a corrupt object.
        const tmpPath = `${objPath}.tmp.${process.pid}`;
        await new Promise((resolve, reject) => {
            const ws = createWriteStream(tmpPath);
            req.pipe(ws);
            ws.on("finish", resolve);
            ws.on("error", reject);
            req.on("error", reject);
        });

        await rename(tmpPath, objPath);
        await chmod(objPath, 0o444); // read-only, matching git annex convention

        res.status(200).end();
    } catch (err) {
        console.error("[gitHttp] annex PUT error:", err);
        res.status(500).end();
    }
});

export default router;

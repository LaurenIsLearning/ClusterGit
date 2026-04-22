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
// git-annex P2P HTTP API (v3)
//
// Enables `git annex copy --to origin` / `git annex get` directly over HTTP.
// git-annex >= 10.20230213 clients auto-detect these endpoints and use them
// instead of failing with "copying to this remote is not supported".
//
// HEAD  /:userId/:repo/git-annex/v3/key/:key  — check if key is present
// GET   /:userId/:repo/git-annex/v3/key/:key  — download key content
// POST  /:userId/:repo/git-annex/v3/key/:key  — upload key content
// ─────────────────────────────────────────────────────────────────────────────

function annexHashDir(key) {
    // Lower-case hashdir: MD5 of key name, first 4 hex chars split as 2+2 dirs.
    const md5 = crypto.createHash("md5").update(key).digest("hex");
    return path.join(md5.slice(0, 2), md5.slice(2, 4));
}

function annexObjectPath(repoPath, key) {
    return path.join(repoPath, ".git", "annex", "objects", annexHashDir(key), key, key);
}

async function findAnnexContent(repoPath, key) {
    // Ask git-annex where it put the content — handles both lower and upper hashdirs.
    try {
        const { stdout } = await execAsync(GIT_BIN, ["annex", "contentlocation", key], { cwd: repoPath });
        const rel = stdout.trim();
        if (!rel) return null;
        const abs = path.join(repoPath, rel);
        await fs.access(abs);
        return abs;
    } catch {
        return null;
    }
}

router.head("/:userId/:repo/git-annex/v3/key/:key", async (req, res) => {
    try {
        const repoPath = await resolveRepo(req);
        const found = await findAnnexContent(repoPath, req.params.key);
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
    try {
        const repoPath = await resolveRepo(req);
        const found = await findAnnexContent(repoPath, req.params.key);
        if (found) {
            res.setHeader("Content-Type", "application/octet-stream");
            return createReadStream(found).pipe(res);
        }
    } catch (err) {
        console.error("[annex GET]", err);
    }
    res.status(404).end();
});

router.post("/:userId/:repo/git-annex/v3/key/:key", async (req, res) => {
    try {
        const repoPath = await resolveRepo(req);
        const { key } = req.params;

        if (!/^[A-Za-z0-9+._-]+$/.test(key)) return res.status(400).end();

        // Already have it — drain body and return success.
        const existing = await findAnnexContent(repoPath, key);
        if (existing) {
            req.resume();
            return res.status(200).end();
        }

        const targetPath = annexObjectPath(repoPath, key);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });

        await new Promise((resolve, reject) => {
            const ws = createWriteStream(targetPath, { mode: 0o444 });
            req.pipe(ws);
            ws.on("finish", resolve);
            ws.on("error", reject);
            req.on("error", reject);
        });

        res.status(200).end();
    } catch (err) {
        console.error("[annex POST]", err);
        res.status(500).end();
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

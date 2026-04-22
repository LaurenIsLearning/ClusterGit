import express from "express";
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { stat, mkdir, rename, chmod, access } from "fs/promises";
import path from "path";
import { resolveExistingRepoPath, isLfsInitialized } from "../services/gitService.js";
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
// (Annex config route removed)

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
// Git LFS API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Git LFS Batch API
 * Negotiates object transfers between client and server.
 * POST /:userId/:repo/info/lfs/objects/batch
 */
router.post("/:userId/:repo/info/lfs/objects/batch", express.json({ type: ["application/json", "application/vnd.git-lfs+json"] }), async (req, res) => {
    try {
        const { operation, objects } = req.body;
        const { userId, repo } = req.params;

        if (!objects || !Array.isArray(objects)) {
            return res.status(400).json({ message: "Invalid request: objects is required" });
        }

    if (operation !== "upload" && operation !== "download") {
        return res.status(400).json({ message: "Invalid operation" });
    }

    const responseObjects = objects.map((obj) => {
        const { oid, size } = obj;
        if (!oid) return { error: { code: 422, message: "Missing OID" } };

        const host = req.get("host");
        const protocol = req.get("x-forwarded-proto") || req.protocol;
        const baseUrl = `${protocol}://${host}/git/${userId}/${repo}/info/lfs/objects/basic/${oid}`;

        const actions = {};
        if (operation === "upload") {
            actions.upload = {
                href: baseUrl,
                expires_in: 3600,
            };
        } else {
            actions.download = {
                href: baseUrl,
                expires_in: 3600,
            };
        }

        return {
            oid,
            size,
            actions,
        };
    });

    res.setHeader("Content-Type", "application/vnd.git-lfs+json");
    res.json({
        transfer: "basic",
        objects: responseObjects,
    });
    } catch (err) {
        console.error("[gitHttp] LFS Batch error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

function lfsObjectPath(repoPath, oid) {
    return path.join(repoPath, ".git", "lfs", "objects", oid.substring(0, 2), oid.substring(2, 4), oid);
}

// LFS Object Download
router.get("/:userId/:repo/info/lfs/objects/basic/:oid", async (req, res) => {
    const { oid } = req.params;
    try {
        const repoPath = await resolveRepo(req);
        const objPath = lfsObjectPath(repoPath, oid);
        const s = await stat(objPath);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", s.size);
        createReadStream(objPath).pipe(res);
    } catch {
        res.status(404).end();
    }
});

// LFS Object Upload
router.put("/:userId/:repo/info/lfs/objects/basic/:oid", async (req, res) => {
    const { oid } = req.params;
    try {
        const repoPath = await resolveRepo(req);
        const objPath = lfsObjectPath(repoPath, oid);

        // Idempotent: if already present, drain and ack.
        try {
            await access(objPath);
            req.resume();
            return res.status(200).end();
        } catch {}

        await mkdir(path.dirname(objPath), { recursive: true });

        const tmpPath = `${objPath}.tmp.${process.pid}`;
        await new Promise((resolve, reject) => {
            const ws = createWriteStream(tmpPath);
            req.pipe(ws);
            ws.on("finish", resolve);
            ws.on("error", reject);
            req.on("error", reject);
        });

        await rename(tmpPath, objPath);
        res.status(200).end();
    } catch (err) {
        console.error("[gitHttp] LFS PUT error:", err);
        res.status(500).end();
    }
});

export default router;

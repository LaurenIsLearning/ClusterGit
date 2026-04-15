import express from "express";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { resolveExistingRepoPath } from "../services/gitService.js";

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

async function isBareGitRepo(repoPath) {
    try {
        const [headStat, objectsStat, refsStat] = await Promise.all([
            fs.stat(path.join(repoPath, "HEAD")),
            fs.stat(path.join(repoPath, "objects")),
            fs.stat(path.join(repoPath, "refs")),
        ]);

        return headStat.isFile() && objectsStat.isDirectory() && refsStat.isDirectory();
    } catch {
        return false;
    }
}

async function ensureRepoOrRespond(req, res) {
    const repoPath = await resolveRepo(req);
    const exists = await isBareGitRepo(repoPath);

    if (!exists) {
        res.status(404).type("text/plain").end("Repository not found\n");
        return null;
    }

    return repoPath;
}

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

    const repoPath = await ensureRepoOrRespond(req, res);
    if (!repoPath) return;

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
    const repoPath = await ensureRepoOrRespond(req, res);
    if (!repoPath) return;

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
    const repoPath = await ensureRepoOrRespond(req, res);
    if (!repoPath) return;

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
        }
    });
});

export default router;

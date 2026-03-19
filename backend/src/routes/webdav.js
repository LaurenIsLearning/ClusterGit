import express from "express";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { resolveExistingRepoPath } from "../services/gitService.js";

const router = express.Router({ strict: false });

/**
 * Resolves a WebDAV request path to an absolute filesystem path inside the
 * repo's annex objects directory.  Returns null if the path is invalid or
 * attempts directory traversal.
 *
 * URL pattern:  /webdav/:userId/:projectName/<rest>
 *   e.g.        /webdav/abc123/myproject/ab/CD/SHA256E-s123--abc.iso/SHA256E-s123--abc.iso
 */
async function resolveWebdavPath(req) {
    const { userId, projectName } = req.params;
    const rest = req.params[0] || ""; // everything after /:userId/:projectName

    const repoPath = await resolveExistingRepoPath(userId, projectName);
    const annexBase = path.join(repoPath, ".git", "annex", "objects");
    const fullPath = path.join(annexBase, rest);

    // Guard against path traversal
    if (!fullPath.startsWith(annexBase)) {
        return null;
    }

    return { annexBase, fullPath };
}

// ─── PROPFIND ────────────────────────────────────────────────────────────────
// git-annex uses this to check whether a key already exists on the remote.
// Return 207 Multi-Status if the file exists, 404 if it doesn't.
router.use("/:userId/:projectName/*", async (req, res, next) => {
    if (req.method !== "PROPFIND") return next();

    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end("Forbidden\n");

        const { fullPath } = resolved;

        let stat;
        try {
            stat = await fs.promises.stat(fullPath);
        } catch {
            return res.status(404).end("Not Found\n");
        }

        const isDir = stat.isDirectory();
        const href = req.path;
        const size = isDir ? 0 : stat.size;
        const mtime = stat.mtime.toUTCString();
        const resourceType = isDir ? "<D:collection/>" : "";

        const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${href}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>${resourceType}</D:resourcetype>
        <D:getcontentlength>${size}</D:getcontentlength>
        <D:getlastmodified>${mtime}</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

        res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").end(xml);
    } catch (err) {
        console.error("[webdav] PROPFIND error:", err.message);
        res.status(500).end("Internal server error\n");
    }
});

// ─── MKCOL ───────────────────────────────────────────────────────────────────
// git-annex creates intermediate directories before uploading a key.
router.use("/:userId/:projectName/*", async (req, res, next) => {
    if (req.method !== "MKCOL") return next();

    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end("Forbidden\n");

        await fs.promises.mkdir(resolved.fullPath, { recursive: true });
        res.status(201).end();
    } catch (err) {
        console.error("[webdav] MKCOL error:", err.message);
        res.status(500).end("Internal server error\n");
    }
});

// ─── PUT ─────────────────────────────────────────────────────────────────────
// git-annex uploads the file content here.
router.use("/:userId/:projectName/*", async (req, res, next) => {
    if (req.method !== "PUT") return next();

    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end("Forbidden\n");

        const { fullPath } = resolved;

        // Ensure parent directory exists
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

        const writeStream = fs.createWriteStream(fullPath);
        try {
            await pipeline(req, writeStream);
        } catch (err) {
            // Clean up partial write
            await fs.promises.unlink(fullPath).catch(() => {});
            throw err;
        }

        // git-annex expects annex objects to be read-only
        await fs.promises.chmod(fullPath, 0o444);

        res.status(201).end();
    } catch (err) {
        console.error("[webdav] PUT error:", err.message);
        res.status(500).end("Internal server error\n");
    }
});

// ─── GET ─────────────────────────────────────────────────────────────────────
// Serves the file back to the client.
router.get("/:userId/:projectName/*", async (req, res) => {
    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end("Forbidden\n");

        const { fullPath } = resolved;

        let stat;
        try {
            stat = await fs.promises.stat(fullPath);
        } catch {
            return res.status(404).end("Not Found\n");
        }

        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Type", "application/octet-stream");
        fs.createReadStream(fullPath).pipe(res);
    } catch (err) {
        console.error("[webdav] GET error:", err.message);
        res.status(500).end("Internal server error\n");
    }
});

// ─── HEAD ─────────────────────────────────────────────────────────────────────
router.head("/:userId/:projectName/*", async (req, res) => {
    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end();

        const { fullPath } = resolved;

        let stat;
        try {
            stat = await fs.promises.stat(fullPath);
        } catch {
            return res.status(404).end();
        }

        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Type", "application/octet-stream");
        res.status(200).end();
    } catch (err) {
        console.error("[webdav] HEAD error:", err.message);
        res.status(500).end();
    }
});

// ─── DELETE ──────────────────────────────────────────────────────────────────
// git-annex calls this when dropping a key from the remote.
router.use("/:userId/:projectName/*", async (req, res, next) => {
    if (req.method !== "DELETE") return next();

    try {
        const resolved = await resolveWebdavPath(req);
        if (!resolved) return res.status(403).end("Forbidden\n");

        const { fullPath } = resolved;

        // Make writable before deleting (annex objects are stored 0o444)
        await fs.promises.chmod(fullPath, 0o644).catch(() => {});
        await fs.promises.unlink(fullPath);
        res.status(204).end();
    } catch (err) {
        if (err.code === "ENOENT") return res.status(404).end("Not Found\n");
        console.error("[webdav] DELETE error:", err.message);
        res.status(500).end("Internal server error\n");
    }
});

// ─── OPTIONS ─────────────────────────────────────────────────────────────────
// WebDAV discovery
router.options("/:userId/:projectName/*", (req, res) => {
    res.setHeader("DAV", "1");
    res.setHeader("Allow", "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND");
    res.status(200).end();
});

export default router;

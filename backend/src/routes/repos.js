import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import gitService from "../services/gitService.js";
import busboy from "busboy";
import { createWriteStream, createReadStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { applyEnvironmentFilter, getEnvironmentKey } from "../utils/environment.js";
import {
    insertPushEventWithFallback,
    insertAnnexObjectWithFallback,
    insertActivityLogWithFallback,
    insertActivityLogWithUserTokenFallback
} from "../services/syncService.js";

const router = express.Router();

function receiveUpload(req) {
    return new Promise((resolve, reject) => {
        let bb;
        try {
            bb = busboy({ headers: req.headers });
        } catch {
            return reject(new Error('Invalid multipart/form-data request'));
        }

        const tmpPath = path.join(os.tmpdir(), `clustergit-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        let fileStarted = false;

        bb.on('file', (_fieldname, stream, info) => {
            fileStarted = true;
            const ws = createWriteStream(tmpPath);
            stream.pipe(ws);
            ws.on('finish', () => resolve({
                path: tmpPath,
                originalname: info.filename || 'upload',
                mimetype: info.mimeType || null,
            }));
            ws.on('error', reject);
        });

        bb.on('error', reject);
        bb.on('close', () => { if (!fileStarted) resolve(null); });

        req.pipe(bb);
    });
}

// Receives one chunk from a multipart request and captures all form fields.
function receiveChunk(req) {
    return new Promise((resolve, reject) => {
        let bb;
        try { bb = busboy({ headers: req.headers }); }
        catch { return reject(new Error('Invalid multipart/form-data request')); }

        const fields = {};
        const tmpPath = path.join(os.tmpdir(), `clustergit-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        let fileReceived = false;

        bb.on('field', (name, value) => { fields[name] = value; });
        bb.on('file', (_fieldname, stream) => {
            fileReceived = true;
            const ws = createWriteStream(tmpPath);
            stream.pipe(ws);
            ws.on('finish', () => resolve({ fields, chunkPath: tmpPath }));
            ws.on('error', reject);
        });
        bb.on('error', reject);
        bb.on('close', () => { if (!fileReceived) resolve({ fields, chunkPath: null }); });
        req.pipe(bb);
    });
}

// Concatenates numbered chunk files into a single output file using streams.
async function assembleChunks(chunkDir, totalChunks, outputPath) {
    const ws = createWriteStream(outputPath);
    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunkDir, String(i).padStart(6, '0'));
        await new Promise((resolve, reject) => {
            const rs = createReadStream(chunkPath);
            rs.pipe(ws, { end: false });
            rs.on('end', resolve);
            rs.on('error', reject);
        });
    }
    return new Promise((resolve, reject) => {
        ws.end();
        ws.on('finish', resolve);
        ws.on('error', reject);
    });
}

// Writes all upload-related metadata rows to Supabase after git-annex succeeds.
async function persistUploadMetadata(repoId, ownerId, file, uploadResult) {
    const metadataErrors = {};

    const { data: commitRow, error: commitError } = await supabase
        .from("commits")
        .insert({
            repo_id: repoId,
            git_commit_hash: uploadResult.gitCommitHash,
            author_id: ownerId,
            message: `Upload ${file.originalname}`,
            branch: uploadResult.branch || "main",
            is_merge: false,
            annex_key: uploadResult.annexKey,
            committed_at: new Date().toISOString()
        })
        .select()
        .single();

    if (commitError) throw new Error(`Upload succeeded but commit metadata failed: ${commitError.message}`);

    const pushPayload = {
        repo_id: repoId,
        pusher_id: ownerId,
        pushed_at: new Date().toISOString(),
        from_ref: uploadResult.fromRef,
        to_ref: uploadResult.toRef || uploadResult.branch,
        commit_count: uploadResult.commitCount || 1,
        hook_source: "repo_upload_route"
    };
    const { error: pushEventError } = await supabase.from("push_events").insert(pushPayload);
    const resolvedPushError = pushEventError ? await insertPushEventWithFallback(pushPayload) : null;
    if (resolvedPushError) metadataErrors.push_events = resolvedPushError.message;

    if (uploadResult.annexKey) {
        const annexError = await insertAnnexObjectWithFallback({
            repo_id: repoId,
            annex_key: uploadResult.annexKey,
            size_bytes: uploadResult.size || file.size || 0,
            storage_backend: "git-annex"
        });
        if (annexError) metadataErrors.annex_objects = annexError.message;
    }

    const { error: repoFileError } = await supabase
        .from("repo_files")
        .upsert({
            repo_id: repoId,
            latest_commit_id: commitRow?.id || null,
            uploaded_by: ownerId,
            annex_key: uploadResult.annexKey || null,
            file_path: file.originalname,
            original_name: file.originalname,
            mime_type: file.mimetype || null,
            size_bytes: uploadResult.size || file.size || 0,
            status: "synced",
            uploaded_at: new Date().toISOString()
        }, { onConflict: "repo_id,file_path" });
    if (repoFileError) metadataErrors.repo_files = repoFileError.message;

    const activityError = await insertActivityLogWithFallback({
        user_id: ownerId,
        repo_id: repoId,
        event_type: "file_uploaded",
        detail: `Uploaded ${file.originalname} (commit ${uploadResult.gitCommitHash || "unknown"})`
    });
    if (activityError) metadataErrors.activity_log = activityError.message;

    return { commitRow, metadataErrors };
}

async function getUserQuotaBytes(userId) {
    // fetches the signed in user's storage quota from supabase
    const { data, error } = await supabase
        .from("user_profiles")
        .select("storage_quota_bytes")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return Number(data?.storage_quota_bytes) || 0;
}

// load one repo scoped to the current environment so preview/local metadata cannot mix.
async function loadOwnedRepositoryInEnvironment(req, ownerId, repoId, selectClause = "id, name, owner_id") {
    const environmentKey = req ? getEnvironmentKey(req) : null;
    let query = supabase
        .from("repositories")
        .select(selectClause)
        .eq("id", repoId);

    if (environmentKey) {
        query = applyEnvironmentFilter(query, environmentKey);
    }

    const { data: projectScoped, error: scopedError } = await query
        .single();

    if (scopedError || !projectScoped) {
        return { project: null, error: scopedError || new Error("Project not found") };
    }

    if (projectScoped.owner_id !== ownerId) {
        return { project: null, error: new Error("You do not have permission to access this project"), status: 403 };
    }

    return { project: projectScoped, error: null, status: 200 };
}

// CREATE REPOSITORY
router.post("/create", authMiddleware, async (req, res) => {
    const { name, description, is_public = false } = req.body;
    const ownerId = req.user.id;
    const environmentKey = getEnvironmentKey(req);

    if (!name) {
        return res.status(400).json({
            error: { message: "Project name is required" }
        });
    }

    try {
        // Validate project name
        const validation = gitService.validateProjectName(name);
        if (!validation.valid) {
            return res.status(400).json({
                error: { message: validation.error }
            });
        }

        // check name collisions inside the current environment only.
        let existingQuery = supabase
            .from("repositories")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("name", name);

        existingQuery = applyEnvironmentFilter(existingQuery, environmentKey);

        const { data: existing } = await existingQuery.single();

        if (existing) {
            return res.status(400).json({
                error: { message: "A project with this name already exists" }
            });
        }

        // creates the actual bare repo on disk before saving the supabase row
        const projectData = await gitService.createProject(
            ownerId,
            name,
            description || ''
        );

        // makes sure the repo really initialized with git-annex metadata
        if (!projectData.annexUuid) {
            throw new Error("git-annex UUID could not be determined");
        }

        // persist the environment key so shared supabase metadata does not cross environments.
        const { data, error } = await supabase
            .from("repositories")
            .insert({
                name: projectData.name,
                owner_id: ownerId,
                description: description || '',
                is_public: Boolean(is_public),
                git_annex_uuid: projectData.annexUuid,
                environment_key: environmentKey,
            })
            .select()
            .single();

        if (error) {
            // Clean up created repository on database error
            console.error("Database error, cleaning up repository:", error);
            return res.status(500).json({
                error: { message: "Failed to save project metadata" }
            });
        }

        const repoId = data.id;

        const { error: collaboratorError } = await supabase
            .from("collaborators")
            .upsert({
                repo_id: repoId,
                user_id: ownerId,
                access_level: "owner"
            }, { onConflict: "repo_id,user_id" });

        if (collaboratorError) {
            console.error("Failed to persist collaborator metadata:", collaboratorError);
        }

        const { error: activityError } = await supabase
            .from("activity_log")
            .insert({
                user_id: ownerId,
                repo_id: repoId,
                event_type: "repository_created",
                detail: `Created repository ${projectData.name}`
            });

        if (activityError) {
            console.error("Failed to persist activity log metadata:", activityError);
        }

        return res.json({
            success: true,
            project: data
        });

    } catch (error) {
        console.error("Project creation error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to create project" }
        });
    }
});

// LIST USER REPOSITORIES
router.get("/my", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const environmentKey = getEnvironmentKey(req);

    try {
        let projectQuery = supabase
            .from("repositories")
            .select("*")
            .eq("owner_id", ownerId);

        projectQuery = applyEnvironmentFilter(projectQuery, environmentKey)
            .order("last_activity_at", { ascending: false });

        const { data, error } = await projectQuery;

        if (error) {
            return res.status(500).json({
                error: { message: "Failed to fetch projects" }
            });
        }

        const repoIds = (data || []).map((project) => project.id);
        let sizeByRepoId = new Map();

        if (repoIds.length > 0) {
            const { data: annexRows, error: annexError } = await supabase
                .from("annex_objects")
                .select("repo_id, size_bytes")
                .in("repo_id", repoIds);

            if (!annexError) {
                sizeByRepoId = (annexRows || []).reduce((acc, row) => {
                    const current = acc.get(row.repo_id) || 0;
                    acc.set(row.repo_id, current + (Number(row.size_bytes) || 0));
                    return acc;
                }, new Map());
            }
        }

        // combines db metadata with git url/path info for the student projects page
        const enrichedProjects = await Promise.all((data || []).map(async (project) => {
            const repoPath = gitService.getRepoPath(ownerId, project.name);
            const gitUrl = gitService.getGitUrl(ownerId, project.name);

            // Prefer authoritative metadata size from Supabase; fallback to filesystem if missing.
            let size = sizeByRepoId.get(project.id) || 0;
            if (!size) {
                try {
                    size = await gitService.getRepoSize(repoPath);
                } catch (err) {
                    console.warn("Repo path missing:", repoPath);
                }
            }

            return {
                ...project,
                repo: gitUrl,
                size: (size / (1024 * 1024)).toFixed(1) + ' MB',
                updated: new Date(project.last_activity_at || project.updated_at || project.created_at).toLocaleDateString(),
                repo_path: repoPath,
                git_url: gitUrl,
                size_bytes: size,
                environment_key: project.environment_key || environmentKey,
            };
        }));

        return res.json(enrichedProjects);
    } catch (error) {
        console.error("Error fetching projects:", error);
        return res.status(500).json({
            error: { message: "Failed to fetch projects" }
        });
    }
});

// USER DASHBOARD SUMMARY (quota + recent activity)
router.get("/summary", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const environmentKey = getEnvironmentKey(req);

    try {
        const totalBytes = await getUserQuotaBytes(ownerId);

        let reposQuery = supabase
            .from("repositories")
            .select("id, name")
            .eq("owner_id", ownerId);

        reposQuery = applyEnvironmentFilter(reposQuery, environmentKey);

        const { data: repos, error: reposError } = await reposQuery;

        if (reposError) {
            return res.status(500).json({
                error: { message: reposError.message || "Failed to load repositories" }
            });
        }

        const repoIds = (repos || []).map((repo) => repo.id);
        const repoNameById = new Map((repos || []).map((repo) => [repo.id, repo.name]));

        let usedBytes = 0;
        if (repoIds.length > 0) {
            const { data: annexObjects, error: annexError } = await supabase
                .from("annex_objects")
                .select("size_bytes")
                .in("repo_id", repoIds);

            if (annexError) {
                return res.status(500).json({
                    error: { message: annexError.message || "Failed to load storage usage" }
                });
            }

            usedBytes = (annexObjects || []).reduce((sum, row) => {
                return sum + (Number(row.size_bytes) || 0);
            }, 0);
        }

        // recent activity is also repo-scoped so local and preview feeds stay separate.
        let activityRows = [];
        if (repoIds.length > 0) {
            const { data, error: activityError } = await supabase
                .from("activity_log")
                .select("id, repo_id, event_type, detail, created_at")
                .eq("user_id", ownerId)
                .in("repo_id", repoIds)
                .order("created_at", { ascending: false })
                .limit(10);

            if (activityError) {
                return res.status(500).json({
                    error: { message: activityError.message || "Failed to load activity" }
                });
            }

            activityRows = data || [];
        }

        const recentActivity = (activityRows || []).map((row) => ({
            id: row.id,
            event_type: row.event_type || "activity",
            detail: row.detail || "Activity recorded",
            project: row.repo_id ? (repoNameById.get(row.repo_id) || "Unknown project") : "Account",
            created_at: row.created_at || null
        }));

        return res.json({
            quota: {
                used: usedBytes,
                total: totalBytes
            },
            recent_activity: recentActivity
        });
    } catch (error) {
        console.error("Error loading dashboard summary:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to load dashboard summary" }
        });
    }
});

// LIST FILES FOR A REPOSITORY
router.get("/:id/files", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const repoId = req.params.id;
    const environmentKey = getEnvironmentKey(req);

    try {
        let projectQuery = supabase
            .from("repositories")
            .select("id, name, owner_id")
            .eq("id", repoId);

        projectQuery = applyEnvironmentFilter(projectQuery, environmentKey);

        const { data: project, error: fetchError } = await projectQuery.single();

        if (fetchError || !project) {
            console.error("Failed to fetch repository for files endpoint:", fetchError);
            return res.status(404).json({
                error: { message: fetchError?.message || "Project not found" }
            });
        }

        if (project.owner_id !== ownerId) {
            return res.status(403).json({
                error: { message: "You do not have permission to view this project" }
            });
        }

        // keeps the ui labels decent even when all we have is a filename
        const inferType = (fileName) => {
            const lower = String(fileName || "").toLowerCase();
            if (/\.(mp4|mov|avi|mkv|webm|m4v)$/.test(lower)) return "video";
            if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(lower)) return "archive";
            if (/\.(onnx|pt|pth|h5|ckpt|bin|safetensors)$/.test(lower)) return "model";
            if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?)$/.test(lower)) return "image";
            if (/\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|h|cs|rb|php|sh|json|yaml|yml|toml|xml|html|css)$/.test(lower)) return "code";
            if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md)$/.test(lower)) return "document";
            return "file";
        };

        // Fetch Supabase metadata for enrichment (status, upload time, etc.)
        const { data: repoFiles } = await supabase
            .from("repo_files")
            .select("file_path, original_name, mime_type, size_bytes, status, uploaded_at, annex_key, latest_commit_id, id")
            .eq("repo_id", repoId);

        const metaByPath = new Map((repoFiles || []).map((f) => [f.file_path, f]));

        // Read all files directly from the git tree
        const repoPath = await gitService.resolveExistingRepoPath(ownerId, project.name);
        let gitFiles;
        try {
            const state = await gitService.readRepoStateForSync(repoPath);
            gitFiles = state.files;
        } catch (err) {
            if (err.name === "NoBranchError") {
                return res.json([]); // empty repo, no commits yet
            }
            throw err;
        }

        const SKIP = new Set([".gitattributes", ".gitignore", ".annex-placeholder"]);

        return res.json(
            gitFiles
                .filter((f) => !SKIP.has(f.name))
                .map((f, idx) => {
                    const meta = metaByPath.get(f.path);
                    return {
                        id: meta?.id ?? `git-${idx}`,
                        name: f.name,
                        path: f.path,
                        size_bytes: f.sizeBytes || Number(meta?.size_bytes) || 0,
                        annex_key: f.annexKey || meta?.annex_key || null,
                        type: inferType(f.name),
                        status: meta?.status || "synced",
                        uploaded_at: meta?.uploaded_at || null,
                        mime_type: meta?.mime_type || null,
                        latest_commit_id: meta?.latest_commit_id || null,
                    };
                })
        );
    } catch (error) {
        console.error("Error listing repository files:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to fetch repository files" }
        });
    }
});

// RECEIVE ONE CHUNK (chunked upload for files > 90 MB)
router.post("/:id/upload/chunk", async (req, res) => {
    const chunkPromise = receiveChunk(req);

    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        chunkPromise.catch(() => {});
        return res.status(401).json({ error: { message: 'Missing or invalid Authorization header' } });
    }

    let chunkData;
    try {
        const [authResult, received] = await Promise.all([supabase.auth.getUser(token), chunkPromise]);
        if (authResult.error || !authResult.data?.user) {
            if (received?.chunkPath) await fs.unlink(received.chunkPath).catch(() => {});
            return res.status(401).json({ error: { message: 'Invalid or expired session' } });
        }
        chunkData = received;
    } catch (err) {
        return res.status(500).json({ error: { message: err.message || 'Failed to receive chunk' } });
    }

    const { fields, chunkPath } = chunkData;
    const { uploadId, chunkIndex, fileName } = fields;

    if (!uploadId || chunkIndex === undefined || !chunkPath || !fileName) {
        await fs.unlink(chunkPath).catch(() => {});
        return res.status(400).json({ error: { message: 'Missing required chunk metadata' } });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
        await fs.unlink(chunkPath).catch(() => {});
        return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const chunkDir = path.join(os.tmpdir(), `clustergit-chunks-${uploadId}`);
    await fs.mkdir(chunkDir, { recursive: true });
    const destPath = path.join(chunkDir, String(Number(chunkIndex)).padStart(6, '0'));

    try {
        await fs.rename(chunkPath, destPath);
    } catch {
        // rename fails across device boundaries — copy then delete
        await fs.writeFile(destPath, await fs.readFile(chunkPath));
        await fs.unlink(chunkPath).catch(() => {});
    }

    return res.json({ success: true, chunkIndex: Number(chunkIndex) });
});

// FINALIZE CHUNKED UPLOAD — reassemble shards and commit to git-annex
router.post("/:id/upload/complete", authMiddleware, async (req, res) => {
    const repoId = req.params.id;
    const ownerId = req.user.id;
    const environmentKey = getEnvironmentKey(req);
    const { uploadId, fileName, totalChunks } = req.body;

    if (!uploadId || !fileName || !totalChunks) {
        return res.status(400).json({ error: { message: 'Missing uploadId, fileName, or totalChunks' } });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
        return res.status(400).json({ error: { message: 'Invalid uploadId' } });
    }

    const total = Number(totalChunks);
    const chunkDir = path.join(os.tmpdir(), `clustergit-chunks-${uploadId}`);
    const assembledPath = path.join(os.tmpdir(), `clustergit-assembled-${uploadId}`);

    try {
        let projectQuery = supabase.from("repositories").select("name, owner_id").eq("id", repoId);
        projectQuery = applyEnvironmentFilter(projectQuery, environmentKey);
        const { data: project, error: fetchError } = await projectQuery.single();

        if (fetchError || !project) return res.status(404).json({ error: { message: "Project not found" } });
        if (project.owner_id !== ownerId) return res.status(403).json({ error: { message: "Permission denied" } });

        // Verify every chunk arrived before attempting assembly
        for (let i = 0; i < total; i++) {
            await fs.access(path.join(chunkDir, String(i).padStart(6, '0'))).catch(() => {
                throw new Error(`Chunk ${i} of ${total} is missing — upload may be incomplete`);
            });
        }

        await assembleChunks(chunkDir, total, assembledPath);
        await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});

        const fileStat = await fs.stat(assembledPath);
        const file = {
            path: assembledPath,
            originalname: path.basename(fileName),
            mimetype: null,
            size: fileStat.size,
        };

        const uploadResult = await gitService.addFileToProject(ownerId, project.name, file.path, file.originalname);
        const { commitRow, metadataErrors } = await persistUploadMetadata(repoId, ownerId, file, uploadResult);

        const hasMetadataError = Object.values(metadataErrors).some(Boolean);
        if (hasMetadataError) {
            return res.status(500).json({
                error: { message: "Upload succeeded but one or more metadata table writes failed" },
                metadata_errors: metadataErrors,
                metadata: { commit_id: commitRow?.id, git_commit_hash: uploadResult.gitCommitHash, annex_key: uploadResult.annexKey }
            });
        }

        return res.json({
            success: true,
            message: "File uploaded and added to repository successfully",
            file: { name: file.originalname, size: file.size },
            metadata: { commit_id: commitRow?.id, git_commit_hash: uploadResult.gitCommitHash, annex_key: uploadResult.annexKey }
        });

    } catch (error) {
        console.error("Chunked upload finalize error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to finalize upload" } });
    } finally {
        await fs.unlink(assembledPath).catch(() => {});
    }
});

// UPLOAD FILE TO REPOSITORY
router.post("/:id/upload", async (req, res) => {
    const repoId = req.params.id;

    // Drain the body immediately (parallel with auth) to prevent TCP abort
    const filePromise = receiveUpload(req);

    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        filePromise.catch(() => {});
        return res.status(401).json({ error: { message: 'Missing or invalid Authorization header' } });
    }

    let user, fileData;
    try {
        const [authResult, received] = await Promise.all([
            supabase.auth.getUser(token),
            filePromise,
        ]);
        if (authResult.error || !authResult.data?.user) {
            if (received?.path) await fs.unlink(received.path).catch(() => {});
            return res.status(401).json({ error: { message: authResult.error?.message || 'Invalid or expired session' } });
        }
        user = authResult.data.user;
        fileData = received;
    } catch (err) {
        return res.status(500).json({ error: { message: err.message || 'Failed to receive upload' } });
    }

    if (!fileData) {
        return res.status(400).json({ error: { message: 'No file uploaded' } });
    }

    const ownerId = user.id;
    const environmentKey = getEnvironmentKey(req);
    const fileStat = await fs.stat(fileData.path).catch(() => ({ size: 0 }));
    const file = {
        path: fileData.path,
        originalname: fileData.originalname,
        mimetype: fileData.mimetype,
        size: fileStat.size,
    };

    try {
        // 1. Get repository info from database
        let projectQuery = supabase
            .from("repositories")
            .select("name, owner_id")
            .eq("id", repoId);

        projectQuery = applyEnvironmentFilter(projectQuery, environmentKey);

        const { data: project, error: fetchError } = await projectQuery.single();

        if (fetchError || !project) {
            return res.status(404).json({
                error: { message: "Project not found" }
            });
        }

        // 2. Security check: Ensure user owns the repository
        if (project.owner_id !== ownerId) {
            return res.status(403).json({
                error: { message: "You do not have permission to upload to this project" }
            });
        }

        // sends the uploaded file through the git-annex flow first, then writes metadata rows
        const uploadResult = await gitService.addFileToProject(
            ownerId,
            project.name,
            file.path,
            file.originalname
        );

        const commitPayload = {
            repo_id: repoId,
            git_commit_hash: uploadResult.gitCommitHash,
            author_id: ownerId,
            message: `Upload ${file.originalname}`,
            branch: uploadResult.branch || "main",
            is_merge: false,
            annex_key: uploadResult.annexKey,
            committed_at: new Date().toISOString()
        };

        const { data: commitRow, error: commitError } = await supabase
            .from("commits")
            .insert(commitPayload)
            .select()
            .single();

        if (commitError) {
            return res.status(500).json({
                error: { message: `Upload succeeded but commit metadata failed: ${commitError.message}` }
            });
        }

        const { error: pushEventError } = await supabase
            .from("push_events")
            .insert({
                repo_id: repoId,
                pusher_id: ownerId,
                pushed_at: new Date().toISOString(),
                from_ref: uploadResult.fromRef,
                to_ref: uploadResult.toRef || uploadResult.branch,
                commit_count: uploadResult.commitCount || 1,
                hook_source: "repo_upload_route"
            });

        const resolvedPushError = pushEventError
            ? await insertPushEventWithFallback({
                repo_id: repoId,
                pusher_id: ownerId,
                pushed_at: new Date().toISOString(),
                from_ref: uploadResult.fromRef,
                to_ref: uploadResult.toRef || uploadResult.branch,
                commit_count: uploadResult.commitCount || 1,
                hook_source: "repo_upload_route"
            })
            : null;

        if (resolvedPushError) {
            console.error("Failed to persist push event metadata:", resolvedPushError);
        }

        let annexObjectError = null;
        if (uploadResult.annexKey) {
            annexObjectError = await insertAnnexObjectWithFallback({
                repo_id: repoId,
                annex_key: uploadResult.annexKey,
                size_bytes: uploadResult.size || file.size || 0,
                storage_backend: "git-annex"
            });

            if (annexObjectError) {
                console.error("Failed to persist annex object metadata:", annexObjectError);
            }
        }

        const mimeType = file.mimetype || null;
        const { error: repoFileError } = await supabase
            .from("repo_files")
            .upsert({
                repo_id: repoId,
                latest_commit_id: commitRow?.id || null,
                uploaded_by: ownerId,
                annex_key: uploadResult.annexKey || null,
                file_path: file.originalname,
                original_name: file.originalname,
                mime_type: mimeType,
                size_bytes: uploadResult.size || file.size || 0,
                status: "synced",
                uploaded_at: new Date().toISOString()
            }, { onConflict: "repo_id,file_path" });

        if (repoFileError) {
            console.error("Failed to persist repo_files metadata:", repoFileError);
        }

        const activityError = await insertActivityLogWithFallback({
            user_id: ownerId,
            repo_id: repoId,
            event_type: "file_uploaded",
            detail: `Uploaded ${file.originalname} (commit ${uploadResult.gitCommitHash || "unknown"})`
        });

        if (activityError) {
            console.error("Failed to persist upload activity metadata:", activityError);
        }

        // reports partial-success cases where git worked but one of the metadata tables did not
        const metadataErrors = {
            push_events: resolvedPushError?.message || null,
            annex_objects: annexObjectError?.message || null,
            repo_files: repoFileError?.message || null,
            activity_log: activityError?.message || null
        };

        const hasMetadataError = Object.values(metadataErrors).some(Boolean);
        if (hasMetadataError) {
            return res.status(500).json({
                error: {
                    message: "Upload succeeded but one or more metadata table writes failed"
                },
                metadata_errors: metadataErrors,
                metadata: {
                    commit_id: commitRow?.id,
                    git_commit_hash: uploadResult.gitCommitHash,
                    annex_key: uploadResult.annexKey
                }
            });
        }

        return res.json({
            success: true,
            message: "File uploaded and added to repository successfully",
            file: {
                name: file.originalname,
                size: file.size
            },
            metadata: {
                commit_id: commitRow?.id,
                git_commit_hash: uploadResult.gitCommitHash,
                annex_key: uploadResult.annexKey
            },
        });

    } catch (error) {
        console.error("Upload error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to upload file" }
        });
    }
});

router.delete("/:repoId/files/:fileId", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const { repoId, fileId } = req.params;

    try {
        const { project, error, status } = await loadOwnedRepositoryInEnvironment(req, ownerId, repoId, "id, name, owner_id");
        if (error || !project) {
            return res.status(status || 404).json({
                error: { message: error?.message || "Project not found" }
            });
        }

        const { data: repoFile, error: repoFileError } = await supabase
            .from("repo_files")
            .select("id, file_path, original_name, annex_key")
            .eq("id", fileId)
            .eq("repo_id", repoId)
            .maybeSingle();

        if (repoFileError) {
            return res.status(500).json({
                error: { message: repoFileError.message || "Failed to load file metadata" }
            });
        }

        if (!repoFile) {
            return res.status(404).json({
                error: { message: "File not found" }
            });
        }

        // deletes from the real repo first so supabase does not get ahead of storage
        const deleteResult = await gitService.deleteFileFromProject(
            ownerId,
            project.name,
            repoFile.file_path
        );

        const { data: commitRow, error: commitError } = await supabase
            .from("commits")
            .insert({
                repo_id: repoId,
                git_commit_hash: deleteResult.gitCommitHash,
                author_id: ownerId,
                message: `Delete ${repoFile.original_name || repoFile.file_path}`,
                branch: deleteResult.branch || "main",
                is_merge: false,
                annex_key: null,
                committed_at: new Date().toISOString()
            })
            .select()
            .single();

        if (commitError) {
            return res.status(500).json({
                error: { message: `Delete succeeded but commit metadata failed: ${commitError.message}` }
            });
        }

        const { error: deleteRepoFileError } = await supabase
            .from("repo_files")
            .delete()
            .eq("id", fileId)
            .eq("repo_id", repoId);

        if (deleteRepoFileError) {
            return res.status(500).json({
                error: { message: deleteRepoFileError.message || "Failed to remove file metadata" }
            });
        }

        if (repoFile.annex_key) {
            const { error: annexDeleteError } = await supabase
                .from("annex_objects")
                .delete()
                .eq("repo_id", repoId)
                .eq("annex_key", repoFile.annex_key);

            if (annexDeleteError) {
                console.error("Failed to delete annex object metadata:", annexDeleteError);
            }
        }

        const activityError = await insertActivityLogWithFallback({
            user_id: ownerId,
            repo_id: repoId,
            event_type: "file_deleted",
            detail: `Deleted ${repoFile.original_name || repoFile.file_path} (commit ${deleteResult.gitCommitHash || "unknown"})`
        });

        if (activityError) {
            console.error("Failed to persist delete activity metadata:", activityError);
        }

        return res.json({
            success: true,
            message: "File deleted successfully",
            metadata: {
                commit_id: commitRow?.id,
                git_commit_hash: deleteResult.gitCommitHash
            }
        });
    } catch (error) {
        console.error("Delete file error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to delete file" }
        });
    }
});

router.post("/:id/request-review", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const repoId = req.params.id;

    try {
        const { project, error, status } = await loadOwnedRepositoryInEnvironment(req, ownerId, repoId, "id, name, owner_id");
        if (error || !project) {
            return res.status(status || 404).json({
                error: { message: error?.message || "Project not found" }
            });
        }

        // uses activity_log as the lightweight admin review notification path
        const reviewPayload = {
            user_id: ownerId,
            repo_id: repoId,
            event_type: "review_requested",
            detail: `Requested admin review for ${project.name}`
        };

        const activityError = await insertActivityLogWithFallback(reviewPayload);
        const resolvedActivityError = activityError
            ? await insertActivityLogWithUserTokenFallback(reviewPayload, req.accessToken)
            : null;

        if (resolvedActivityError) {
            return res.status(500).json({
                error: { message: resolvedActivityError.message || "Failed to request review" }
            });
        }

        return res.json({
            success: true,
            message: "Review request sent to admins"
        });
    } catch (error) {
        console.error("Request review error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to request review" }
        });
    }
});

router.delete("/:id", authMiddleware, async (req, res) => {
    const ownerId = req.user.id;
    const repoId = req.params.id;

    try {
        const { project, error, status } = await loadOwnedRepositoryInEnvironment(req, ownerId, repoId, "id, name, owner_id");
        if (error || !project) {
            return res.status(status || 404).json({
                error: { message: error?.message || "Project not found" }
            });
        }

        // removes the actual repo storage before removing the supabase metadata row
        await gitService.deleteProjectRepository(ownerId, project.name);

        const { error: deleteRepoError } = await supabase
            .from("repositories")
            .delete()
            .eq("id", repoId)
            .eq("owner_id", ownerId);

        if (deleteRepoError) {
            return res.status(500).json({
                error: { message: deleteRepoError.message || "Failed to delete repository metadata" }
            });
        }

        const activityError = await insertActivityLogWithFallback({
            user_id: ownerId,
            repo_id: null,
            event_type: "repository_deleted",
            detail: `Deleted repository ${project.name}`
        });

        if (activityError) {
            console.error("Failed to persist repository delete activity:", activityError);
        }

        return res.json({
            success: true,
            message: "Repository deleted successfully"
        });
    } catch (error) {
        console.error("Delete repository error:", error);
        return res.status(500).json({
            error: { message: error.message || "Failed to delete repository" }
        });
    }
});

export default router;

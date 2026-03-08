import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import gitService from "../services/gitService.js";
import multer from "multer";
import os from "os";
import path from "path";

const router = express.Router();

// Configure multer for temporary file storage
const upload = multer({ dest: path.join(os.tmpdir(), 'clustergit-uploads') });

async function insertPushEventWithFallback(payload) {
    // Fallback for environments with stricter/different push_events schema.
    const { error: fallbackError } = await supabase
        .from("push_events")
        .insert({
            repo_id: payload.repo_id,
            pusher_id: payload.pusher_id,
            from_ref: payload.from_ref,
            to_ref: payload.to_ref,
            commit_count: payload.commit_count
        });

    return fallbackError || null;
}

async function insertAnnexObjectWithFallback(payload) {
    // Prefer upsert so repeated uploads/metadata retries don't fail on duplicate keys.
    const { error: upsertError } = await supabase
        .from("annex_objects")
        .upsert(payload, { onConflict: "repo_id,annex_key" });

    if (!upsertError) return null;

    const { error: fallbackError } = await supabase
        .from("annex_objects")
        .insert({
            repo_id: payload.repo_id,
            annex_key: payload.annex_key,
            size_bytes: payload.size_bytes
        });

    return fallbackError || upsertError;
}

async function insertActivityLogWithFallback(payload) {
    const attempts = [
        payload,
        { ...payload, event_type: "commit_recorded" },
        { ...payload, event_type: "upload" }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        const { error } = await supabase
            .from("activity_log")
            .insert(attempt);
        if (!error) return null;
        lastError = error;
    }

    return lastError;
}

// CREATE REPOSITORY
router.post("/create", authMiddleware, async (req, res) => {
    const { name, description, is_public = false } = req.body;
    const ownerId = req.user.id;

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

        // Check if project with same name already exists for this user
        const { data: existing } = await supabase
            .from("repositories")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("name", name)
            .single();

        if (existing) {
            return res.status(400).json({
                error: { message: "A project with this name already exists" }
            });
        }

        // Create Git repository with git-annex
        const projectData = await gitService.createProject(
            ownerId,
            name,
            description || ''
        );

        // Safety check
        if (!projectData.annexUuid) {
            throw new Error("git-annex UUID could not be determined");
        }

        // Store repository metadata in database
        // git_annex_uuid is a mandatory column in the repositories table
        const { data, error } = await supabase
            .from("repositories")
            .insert({
                name: projectData.name,
                owner_id: ownerId,
                is_public: Boolean(is_public),
                git_annex_uuid: projectData.annexUuid,
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

    try {
        const { data, error } = await supabase
            .from("repositories")
            .select("*")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: false });

        if (error) {
            return res.status(500).json({
                error: { message: "Failed to fetch projects" }
            });
        }

        // Enrich projects with metadata not stored in DB
        const enrichedProjects = await Promise.all((data || []).map(async (project) => {
            const repoPath = gitService.getRepoPath(ownerId, project.name);
            const gitUrl = gitService.getGitUrl(ownerId, project.name);
            const size = await gitService.getRepoSize(repoPath);

            // Format for frontend expectations
            // Frontend expects: repo, size, updated
            return {
                ...project,
                repo: gitUrl,
                size: (size / (1024 * 1024)).toFixed(1) + ' MB',
                updated: new Date(project.created_at).toLocaleDateString(),
                // Also provide original values just in case
                repo_path: repoPath,
                git_url: gitUrl,
                size_bytes: size
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

// UPLOAD FILE TO REPOSITORY
router.post("/:id/upload", authMiddleware, upload.single('file'), async (req, res) => {
    const ownerId = req.user.id;
    const repoId = req.params.id;
    const file = req.file;

    if (!file) {
        return res.status(400).json({
            error: { message: "No file uploaded" }
        });
    }

    try {
        // 1. Get repository info from database
        const { data: project, error: fetchError } = await supabase
            .from("repositories")
            .select("name, owner_id")
            .eq("id", repoId)
            .single();

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

        // 3. Add file to Git repository using git-annex
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

        const activityError = await insertActivityLogWithFallback({
            user_id: ownerId,
            repo_id: repoId,
            event_type: "file_uploaded",
            detail: `Uploaded ${file.originalname} (commit ${uploadResult.gitCommitHash || "unknown"})`
        });

        if (activityError) {
            console.error("Failed to persist upload activity metadata:", activityError);
        }

        const metadataErrors = {
            push_events: resolvedPushError?.message || null,
            annex_objects: annexObjectError?.message || null,
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

export default router;

import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

async function upsertRepoFileMetadata({
    repoId,
    commitId,
    authorId,
    annexKey,
    sizeBytes,
    originalName,
    mimeType
}) {
    if (!originalName) return null;

    const { error } = await supabase
        .from("repo_files")
        .upsert({
            repo_id: repoId,
            latest_commit_id: commitId,
            uploaded_by: authorId,
            annex_key: annexKey || null,
            file_path: originalName,
            original_name: originalName,
            mime_type: mimeType || null,
            size_bytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : 0,
            status: "synced",
            uploaded_at: new Date().toISOString()
        }, { onConflict: "repo_id,file_path" });

    return error || null;
}

// RECORD A COMMIT
router.post("/:repo_id", authMiddleware, async (req, res) => {
    const { repo_id } = req.params;
    const authorId = req.user.id;
    const {
        git_commit_hash,
        commit_hash,
        message,
        branch,
        is_merge,
        annex_key,
        annex_uuid, // compatibility fallback
        size_bytes,
        storage_backend,
        from_ref,
        to_ref,
        commit_count,
        file_count, // compatibility fallback
        hook_source,
        original_name,
        file_path,
        mime_type
    } = req.body;

    const commitPayload = {
        repo_id,
        git_commit_hash: git_commit_hash || commit_hash || null,
        author_id: authorId,
        message: message || "Commit recorded",
        branch: branch || to_ref || "main",
        is_merge: Boolean(is_merge),
        annex_key: annex_key || annex_uuid || null,
        committed_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from("commits")
        .insert(commitPayload)
        .select()
        .single();

    if (error) {
        return res.status(400).json({ error });
    }

    if (from_ref || to_ref || commit_count || file_count || hook_source) {
        const { error: pushEventError } = await supabase
            .from("push_events")
            .insert({
                repo_id,
                pusher_id: authorId,
                from_ref: from_ref || null,
                to_ref: to_ref || branch || null,
                commit_count: Number.isFinite(Number(commit_count))
                    ? Number(commit_count)
                    : (Number.isFinite(Number(file_count)) ? Number(file_count) : 1),
                hook_source: hook_source || "api"
            });

        if (pushEventError) {
            console.error("Failed to persist push event metadata:", pushEventError);
        }
    }

    if (commitPayload.annex_key) {
        const parsedSizeBytes = Number(size_bytes);
        const { error: annexObjectError } = await supabase
            .from("annex_objects")
            .upsert({
                repo_id,
                annex_key: commitPayload.annex_key,
                size_bytes: Number.isFinite(parsedSizeBytes) ? parsedSizeBytes : 0,
                storage_backend: storage_backend || "git-annex"
            }, { onConflict: "repo_id,annex_key" });

        if (annexObjectError) {
            console.error("Failed to persist annex object metadata:", annexObjectError);
        }
    }

    const derivedName = original_name
        || file_path
        || (typeof message === "string" && message.startsWith("Upload ")
            ? message.replace(/^Upload\s+/, "").trim()
            : null);

    const repoFileError = await upsertRepoFileMetadata({
        repoId: repo_id,
        commitId: data?.id || null,
        authorId,
        annexKey: commitPayload.annex_key,
        sizeBytes: size_bytes,
        originalName: derivedName,
        mimeType: mime_type
    });

    if (repoFileError) {
        console.error("Failed to persist repo file metadata:", repoFileError);
    }

    const { error: activityError } = await supabase
        .from("activity_log")
        .insert({
            user_id: authorId,
            repo_id,
            event_type: "commit_recorded",
            detail: `Commit ${commitPayload.git_commit_hash || "(no hash)"} on ${commitPayload.branch}`
        });

    if (activityError) {
        console.error("Failed to persist commit activity metadata:", activityError);
    }

    return res.json(data);
});

// LIST COMMITS FOR A REPO
router.get("/:repo_id", authMiddleware, async (req, res) => {
    const { repo_id } = req.params;
    const { data, error } = await supabase
        .from("commits")
        .select("*")
        .eq("repo_id", repo_id)
        .order("created_at", { ascending: false });

    if (error) {
        return res.status(400).json({ error });
    }

    return res.json(data);
});

export default router;

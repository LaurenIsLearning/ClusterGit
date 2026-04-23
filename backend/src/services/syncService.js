import { supabase } from '../utils/supabase.js';
import { resolveExistingRepoPath, readRepoStateForSync } from './gitService.js';

function getSupabaseRestBaseUrl() {
    return String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
}

function getSupabaseApiKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
}

async function parseRestError(response) {
    const body = await response.json().catch(() => ({}));
    return new Error(body.message || body.error || `Supabase REST write failed (${response.status})`);
}

async function writeRowWithUserToken(tableName, payload, accessToken, options = {}) {
    const baseUrl = getSupabaseRestBaseUrl();
    const apiKey = getSupabaseApiKey();

    if (!accessToken || !baseUrl || !apiKey) {
        return {
            data: null,
            error: new Error('Missing authenticated Supabase context for metadata fallback')
        };
    }

    const params = new URLSearchParams();
    if (options.onConflict) params.set('on_conflict', options.onConflict);
    if (options.returnRepresentation) params.set('select', '*');

    const url = `${baseUrl}/rest/v1/${tableName}${params.toString() ? `?${params}` : ''}`;
    const prefer = [
        options.onConflict ? 'resolution=merge-duplicates' : null,
        options.returnRepresentation ? 'return=representation' : 'return=minimal',
    ].filter(Boolean).join(',');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: apiKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: prefer,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        return { data: null, error: await parseRestError(response) };
    }

    if (!options.returnRepresentation) {
        return { data: null, error: null };
    }

    const rows = await response.json().catch(() => []);
    return { data: Array.isArray(rows) ? rows[0] : rows, error: null };
}

export async function insertRowWithUserTokenFallback(tableName, payload, accessToken, options = {}) {
    return writeRowWithUserToken(tableName, payload, accessToken, options);
}

export async function upsertRowWithUserTokenFallback(tableName, payload, accessToken, onConflict, options = {}) {
    return writeRowWithUserToken(tableName, payload, accessToken, {
        ...options,
        onConflict,
    });
}

// ─── Supabase fallback helpers (shared with repos.js) ────────────────────────

export async function insertPushEventWithFallback(payload) {
    // backfills older push_events schemas that may not have every new column yet
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

export async function insertAnnexObjectWithFallback(payload) {
    // keeps annex object metadata idempotent if the same upload logic retries
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

export async function insertActivityLogWithFallback(payload) {
    // tries a few event names so activity logging still works against older schemas
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

export async function insertActivityLogWithUserTokenFallback(payload, accessToken) {
    if (!accessToken || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Error('Missing authenticated Supabase context for activity log fallback');
    }

    const attempts = [
        payload,
        { ...payload, event_type: "commit_recorded" },
        { ...payload, event_type: "upload" }
    ];

    let lastError = null;
    for (const attempt of attempts) {
        const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/activity_log`, {
            method: 'POST',
            headers: {
                apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
            },
            body: JSON.stringify(attempt),
        });

        if (response.ok) return null;

        const body = await response.json().catch(() => ({}));
        lastError = new Error(body.message || body.error || `Activity log insert failed (${response.status})`);
    }

    return lastError;
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

const MIME_MAP = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', webm: 'video/webm', m4v: 'video/x-m4v',
    zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip',
    rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
    pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    onnx: 'application/octet-stream', pt: 'application/octet-stream',
    pth: 'application/octet-stream', h5: 'application/x-hdf5',
    bin: 'application/octet-stream', safetensors: 'application/octet-stream',
    iso: 'application/x-iso9660-image', img: 'application/octet-stream',
};

function guessMime(filename) {
    const ext = String(filename || '').split('.').pop().toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
}

// ─── Files to skip when syncing ──────────────────────────────────────────────

const SKIP_FILES = new Set(['.annex-placeholder', 'README.md', '.gitattributes', '.gitignore']);

// ─── Main sync function ───────────────────────────────────────────────────────

/**
 * Called fire-and-forget after git-receive-pack completes.
 * Reads the current HEAD state and upserts metadata into Supabase so the
 * frontend can display files that were pushed from the CLI.
 */
export async function syncPushMetadata(userId, projectName) {
    try {
        const repoPath = await resolveExistingRepoPath(userId, projectName);

        let state;
        try {
            state = await readRepoStateForSync(repoPath);
        } catch (err) {
            if (err.name === 'NoBranchError') {
                console.log(`[syncPush] No main branch in ${projectName}, skipping`);
                return;
            }
            throw err;
        }

        // Look up the repo record
        const { data: repo } = await supabase
            .from('repositories')
            .select('id')
            .eq('owner_id', userId)
            .eq('name', projectName)
            .maybeSingle();

        if (!repo) {
            console.log(`[syncPush] No repo record found for ${userId}/${projectName}`);
            return;
        }

        // Idempotency guard — skip if this commit was already recorded
        const { data: existing } = await supabase
            .from('commits')
            .select('id')
            .eq('repo_id', repo.id)
            .eq('git_commit_hash', state.commitHash)
            .maybeSingle();

        if (existing) {
            console.log(`[syncPush] Commit ${state.commitHash.slice(0, 8)} already recorded, skipping`);
            return;
        }

        // Insert commit row
        const { data: commitRow } = await supabase
            .from('commits')
            .insert({
                repo_id: repo.id,
                git_commit_hash: state.commitHash,
                author_id: userId,
                message: state.message,
                branch: 'main',
                is_merge: false,
                annex_key: null,
                committed_at: state.timestamp,
            })
            .select()
            .single();

        // Upsert repo_files + annex_objects for each file
        for (const file of state.files) {
            if (SKIP_FILES.has(file.name)) continue;

            await supabase
                .from('repo_files')
                .upsert({
                    repo_id: repo.id,
                    latest_commit_id: commitRow?.id ?? null,
                    uploaded_by: userId,
                    file_path: file.path,
                    original_name: file.name,
                    annex_key: file.annexKey,
                    mime_type: guessMime(file.name),
                    size_bytes: file.sizeBytes,
                    status: 'synced',
                    uploaded_at: state.timestamp,
                }, { onConflict: 'repo_id,file_path' });

            if (file.annexKey) {
                await insertAnnexObjectWithFallback({
                    repo_id: repo.id,
                    annex_key: file.annexKey,
                    size_bytes: file.sizeBytes,
                    storage_backend: 'git-annex',
                });
            }
        }

        // Push event
        await insertPushEventWithFallback({
            repo_id: repo.id,
            pusher_id: userId,
            from_ref: null,
            to_ref: state.commitHash,
            commit_count: 1,
        });

        // Activity log
        const fileCount = state.files.filter(f => !SKIP_FILES.has(f.name)).length;
        await insertActivityLogWithFallback({
            user_id: userId,
            repo_id: repo.id,
            event_type: 'file_uploaded',
            detail: `CLI push: ${fileCount} file(s) in commit ${state.commitHash.slice(0, 8)}`,
        });

        console.log(`[syncPush] Synced ${fileCount} file(s) for ${userId}/${projectName} @ ${state.commitHash.slice(0, 8)}`);
    } catch (err) {
        // Never rethrow — this is always called fire-and-forget
        console.error(`[syncPush] Error syncing ${userId}/${projectName}:`, err.message);
    }
}

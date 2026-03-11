import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { applyEnvironmentFilter, getEnvironmentKey } from "../utils/environment.js";
import gitService from "../services/gitService.js";

const router = express.Router();
const DEFAULT_STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;

async function requireAdmin(req, res, next) {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: { message: "Authentication required" } });
    }

    const { data, error } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ error: { message: error.message || "Failed to verify role" } });
    }

    if (data?.role !== "admin") {
        return res.status(403).json({ error: { message: "Admin access required" } });
    }

    next();
}

router.use(authMiddleware, requireAdmin);

function formatFallbackUserName(authUser, profile) {
    return profile?.display_name
        || authUser?.email?.split("@")?.[0]
        || "Unknown";
}

// auth lookups let admin pages show real names/emails without trusting stale profile text.
async function listAuthUsersById() {
    const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return new Map((authList?.users || []).map((user) => [user.id, user]));
}

// admin views only inspect repos that belong to the current environment.
async function loadEnvironmentRepositories(environmentKey) {
    let query = supabase
        .from("repositories")
        .select("id, name, owner_id, created_at, last_activity_at, environment_key")
        .order("last_activity_at", { ascending: false });

    query = applyEnvironmentFilter(query, environmentKey);

    const { data: repos, error } = await query;

    if (error) throw error;
    return repos || [];
}

// review requests are stored as activity events and surfaced back into the admin ui.
async function loadReviewRequests(repoIds) {
    if (!repoIds.length) return [];

    const { data, error } = await supabase
        .from("activity_log")
        .select("id, user_id, repo_id, detail, created_at")
        .eq("event_type", "review_requested")
        .in("repo_id", repoIds)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

function parseQuotaBytes(input) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return Math.round(parsed);
}

router.get("/summary", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { data: profiles, error: profilesError } = await supabase
            .from("user_profiles")
            .select("user_id, role, storage_quota_bytes");
        if (profilesError) {
            return res.status(500).json({ error: { message: profilesError.message || "Failed to load profiles" } });
        }

        const studentProfiles = (profiles || []).filter((p) => p.role === "student");
        const totalStorageBytes = studentProfiles.reduce((sum, profile) => {
            return sum + (Number(profile.storage_quota_bytes) || 0);
        }, 0);

        const repos = await loadEnvironmentRepositories(environmentKey);

        const repoById = new Map((repos || []).map((r) => [r.id, r]));
        const repoIds = repos.map((repo) => repo.id);
        const totalUsers = new Set(repos.map((repo) => repo.owner_id).filter(Boolean)).size;

        let usedStorageBytes = 0;
        if (repoIds.length > 0) {
            const { data: annexRows, error: annexError } = await supabase
                .from("annex_objects")
                .select("size_bytes")
                .in("repo_id", repoIds);
            if (annexError) {
                return res.status(500).json({ error: { message: annexError.message || "Failed to load storage usage" } });
            }
            usedStorageBytes = (annexRows || []).reduce((sum, row) => sum + (Number(row.size_bytes) || 0), 0);
        }

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // summary activity is constrained to repos in this environment.
        let activityQuery = supabase
            .from("activity_log")
            .select("user_id, repo_id, detail, created_at")
            .gte("created_at", oneDayAgo)
            .order("created_at", { ascending: false });

        if (repoIds.length > 0) {
            activityQuery = activityQuery.in("repo_id", repoIds);
        } else {
            activityQuery = activityQuery.eq("repo_id", "00000000-0000-0000-0000-000000000000");
        }

        const { data: activityRows, error: activityError } = await activityQuery;
        if (activityError) {
            return res.status(500).json({ error: { message: activityError.message || "Failed to load activity" } });
        }

        const activeUsers = new Set((activityRows || []).map((r) => r.user_id).filter(Boolean)).size;

        const archivedCandidates = (repos || [])
            .filter((r) => {
                const referenceDate = r.last_activity_at || r.created_at;
                if (!referenceDate) return false;
                const ageDays = (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24);
                return ageDays >= 90;
            })
            .slice(0, 10);

        const archivedIds = archivedCandidates.map((r) => r.id);
        let archivedAnnex = [];
        if (archivedIds.length > 0) {
            const { data, error } = await supabase
                .from("annex_objects")
                .select("repo_id, size_bytes")
                .in("repo_id", archivedIds);
            if (!error) archivedAnnex = data || [];
        }

        const sizeByRepo = new Map();
        for (const row of archivedAnnex) {
            sizeByRepo.set(row.repo_id, (sizeByRepo.get(row.repo_id) || 0) + (Number(row.size_bytes) || 0));
        }

        const recentActivity = (activityRows || []).slice(0, 10).map((row) => ({
            detail: row.detail || "Activity",
            created_at: row.created_at || null,
            project: row.repo_id ? (repoById.get(row.repo_id)?.name || "Unknown project") : "Account"
        }));

        const archivedRepositories = archivedCandidates.map((repo) => ({
            name: repo.name,
            size_bytes: sizeByRepo.get(repo.id) || 0,
            created_at: repo.last_activity_at || repo.created_at || null
        }));

        const { data: nodeRows, error: nodeError } = await supabase
            .from("node_health")
            .select("node_key, status, heartbeat_at")
            .order("heartbeat_at", { ascending: false });

        const latestNodeByKey = new Map();
        if (!nodeError) {
            for (const row of nodeRows || []) {
                if (!latestNodeByKey.has(row.node_key)) {
                    latestNodeByKey.set(row.node_key, row);
                }
            }
        }

        const latestNodes = [...latestNodeByKey.values()];
        const healthyNodes = latestNodes.filter((node) => node.status === "online").length;
        const health = latestNodes.length > 0
            ? `${Math.round((healthyNodes / latestNodes.length) * 100)}%`
            : "N/A";

        return res.json({
            health,
            active_users: activeUsers,
            total_users: totalUsers,
            used_storage_bytes: usedStorageBytes,
            total_storage_bytes: totalStorageBytes,
            archived_repositories: archivedRepositories,
            recent_activity: recentActivity
        });
    } catch (error) {
        console.error("Admin summary error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load admin summary" } });
    }
});

router.get("/users", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { data: profiles, error: profilesError } = await supabase
            .from("user_profiles")
            .select("user_id, role, display_name, storage_quota_bytes, is_admin_created");
        if (profilesError) {
            return res.status(500).json({ error: { message: profilesError.message || "Failed to load profiles" } });
        }

        const students = (profiles || []).filter((p) => p.role === "student");
        const studentIds = students.map((s) => s.user_id);

        // build user rows from environment-scoped repos so previews do not show local storage.
        const repos = await loadEnvironmentRepositories(environmentKey);
        const ownedRepos = repos.filter((repo) => studentIds.includes(repo.owner_id));

        const repoIds = ownedRepos.map((repo) => repo.id);
        const ownerByRepoId = new Map(ownedRepos.map((repo) => [repo.id, repo.owner_id]));
        const repoCountByUser = new Map();
        for (const repo of ownedRepos) {
            repoCountByUser.set(repo.owner_id, (repoCountByUser.get(repo.owner_id) || 0) + 1);
        }

        let annexRows = [];
        if (repoIds.length > 0) {
            const { data, error } = await supabase
                .from("annex_objects")
                .select("repo_id, size_bytes")
                .in("repo_id", repoIds);
            if (!error) annexRows = data || [];
        }

        const usedByUser = new Map();
        for (const row of annexRows) {
            const ownerId = ownerByRepoId.get(row.repo_id);
            if (!ownerId) continue;
            usedByUser.set(ownerId, (usedByUser.get(ownerId) || 0) + (Number(row.size_bytes) || 0));
        }

        let activityRows = [];
        if (repoIds.length > 0) {
            const { data } = await supabase
                .from("activity_log")
                .select("user_id, repo_id, created_at")
                .in("repo_id", repoIds)
                .order("created_at", { ascending: false });
            activityRows = data || [];
        }

        const lastActiveByUser = new Map();
        for (const row of activityRows || []) {
            if (!lastActiveByUser.has(row.user_id)) {
                lastActiveByUser.set(row.user_id, row.created_at || null);
            }
        }

        const authById = await listAuthUsersById();
        const reviewRequests = await loadReviewRequests(repoIds);
        const latestReviewByUser = new Map();

        for (const request of reviewRequests) {
            if (!latestReviewByUser.has(request.user_id)) {
                latestReviewByUser.set(request.user_id, request);
            }
        }

        const users = students.map((student) => {
            const authUser = authById.get(student.user_id);
            const reviewRequest = latestReviewByUser.get(student.user_id) || null;
            return {
                id: student.user_id,
                name: formatFallbackUserName(authUser, student),
                email: authUser?.email || "",
                used_bytes: usedByUser.get(student.user_id) || 0,
                quota_bytes: Number(student.storage_quota_bytes) || 0,
                is_admin_created: Boolean(student.is_admin_created),
                last_active_at: lastActiveByUser.get(student.user_id) || authUser?.last_sign_in_at || null,
                repo_count: repoCountByUser.get(student.user_id) || 0,
                has_review_request: Boolean(reviewRequest),
                review_requested_at: reviewRequest?.created_at || null,
                review_repo_id: reviewRequest?.repo_id || null,
                review_detail: reviewRequest?.detail || null,
            };
        });

        users.sort((a, b) => {
            if (a.has_review_request !== b.has_review_request) {
                return a.has_review_request ? -1 : 1;
            }

            const aTime = a.review_requested_at ? new Date(a.review_requested_at).getTime() : 0;
            const bTime = b.review_requested_at ? new Date(b.review_requested_at).getTime() : 0;
            if (aTime !== bTime) return bTime - aTime;

            const aLast = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
            const bLast = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
            return bLast - aLast;
        });

        return res.json({
            environment_key: environmentKey,
            users
        });
    } catch (error) {
        console.error("Admin users error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load admin users" } });
    }
});

router.post("/users", async (req, res) => {
    try {
        const adminUserId = req.user.id;
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        const displayName = String(req.body?.display_name || "").trim();
        const requestedQuotaBytes = parseQuotaBytes(req.body?.storage_quota_bytes);

        if (!email || !password) {
            return res.status(400).json({ error: { message: "Email and password are required" } });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: { message: "Password must be at least 6 characters" } });
        }

        const quotaBytes = requestedQuotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES;

        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: displayName || email.split("@")[0]
            }
        });

        if (error || !data?.user?.id) {
            return res.status(400).json({ error: { message: error?.message || "Failed to create student" } });
        }

        const userId = data.user.id;
        const { error: profileError } = await supabase
            .from("user_profiles")
            .upsert({
                user_id: userId,
                role: "student",
                display_name: displayName || email.split("@")[0],
                storage_quota_bytes: quotaBytes,
                is_admin_created: true,
                admin_created_by: adminUserId
            }, { onConflict: "user_id" });

        if (profileError) {
            return res.status(500).json({ error: { message: profileError.message || "Failed to create student profile" } });
        }

        const { error: activityError } = await supabase
            .from("activity_log")
            .insert({
                user_id: adminUserId,
                event_type: "student_created",
                detail: `Created student ${email}`
            });

        if (activityError) {
            console.error("Failed to log student creation:", activityError);
        }

        return res.json({
            success: true,
            user: {
                id: userId,
                email,
                display_name: displayName || email.split("@")[0],
                storage_quota_bytes: quotaBytes
            }
        });
    } catch (error) {
        console.error("Admin create user error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to create student" } });
    }
});

router.patch("/users/:userId/quota", async (req, res) => {
    try {
        const { userId } = req.params;
        const requestedQuotaBytes = parseQuotaBytes(req.body?.storage_quota_bytes);

        if (requestedQuotaBytes === null) {
            return res.status(400).json({ error: { message: "Valid storage_quota_bytes is required" } });
        }

        const { data, error } = await supabase
            .from("user_profiles")
            .update({ storage_quota_bytes: requestedQuotaBytes })
            .eq("user_id", userId)
            .select("user_id, storage_quota_bytes")
            .single();

        if (error) {
            return res.status(500).json({ error: { message: error.message || "Failed to update quota" } });
        }

        return res.json({ success: true, profile: data });
    } catch (error) {
        console.error("Admin quota update error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to update quota" } });
    }
});

router.post("/users/:userId/reset-quota", async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from("user_profiles")
            .update({ storage_quota_bytes: DEFAULT_STORAGE_QUOTA_BYTES })
            .eq("user_id", userId)
            .select("user_id, storage_quota_bytes")
            .single();

        if (error) {
            return res.status(500).json({ error: { message: error.message || "Failed to reset quota" } });
        }

        return res.json({ success: true, profile: data });
    } catch (error) {
        console.error("Admin quota reset error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to reset quota" } });
    }
});

router.get("/users/:userId/repos", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { userId } = req.params;

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("user_id, role")
            .eq("user_id", userId)
            .maybeSingle();

        if (profileError) {
            return res.status(500).json({ error: { message: profileError.message || "Failed to load user" } });
        }

        if (!profile || profile.role !== "student") {
            return res.status(404).json({ error: { message: "Student not found" } });
        }

        // the drill-down reuses the same environment filter as the main users list.
        const repos = (await loadEnvironmentRepositories(environmentKey))
            .filter((repo) => repo.owner_id === userId);

        const repoIds = repos.map((repo) => repo.id);
        const sizeByRepo = new Map();
        const latestReviewByRepo = new Map();

        if (repoIds.length > 0) {
            const { data: annexRows } = await supabase
                .from("annex_objects")
                .select("repo_id, size_bytes")
                .in("repo_id", repoIds);

            for (const row of annexRows || []) {
                sizeByRepo.set(row.repo_id, (sizeByRepo.get(row.repo_id) || 0) + (Number(row.size_bytes) || 0));
            }

            const reviewRequests = await loadReviewRequests(repoIds);
            for (const request of reviewRequests) {
                if (!latestReviewByRepo.has(request.repo_id)) {
                    latestReviewByRepo.set(request.repo_id, request);
                }
            }
        }

        return res.json({
            environment_key: environmentKey,
            repos: repos.map((repo) => ({
                id: repo.id,
                name: repo.name,
                git_url: gitService.getGitUrl(userId, repo.name),
                created_at: repo.created_at || null,
                last_activity_at: repo.last_activity_at || null,
                size_bytes: sizeByRepo.get(repo.id) || 0,
                has_review_request: latestReviewByRepo.has(repo.id),
                review_requested_at: latestReviewByRepo.get(repo.id)?.created_at || null,
                review_detail: latestReviewByRepo.get(repo.id)?.detail || null,
            }))
        });
    } catch (error) {
        console.error("Admin user repos error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load user repositories" } });
    }
});

router.get("/repos/:repoId/files", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { repoId } = req.params;

        let repoQuery = supabase
            .from("repositories")
            .select("id, owner_id, environment_key")
            .eq("id", repoId);

        repoQuery = applyEnvironmentFilter(repoQuery, environmentKey);

        const { data: repo, error: repoError } = await repoQuery.maybeSingle();

        if (repoError) {
            return res.status(500).json({ error: { message: repoError.message || "Failed to load repository" } });
        }

        if (!repo) {
            return res.status(404).json({ error: { message: "Repository not found" } });
        }

        // file inspection stays metadata-only on the admin side.
        const { data: files, error: filesError } = await supabase
            .from("repo_files")
            .select("id, original_name, file_path, mime_type, size_bytes, status, uploaded_at")
            .eq("repo_id", repoId)
            .order("uploaded_at", { ascending: false });

        if (filesError) {
            return res.status(500).json({ error: { message: filesError.message || "Failed to load repository files" } });
        }

        return res.json({
            environment_key: environmentKey,
            files: (files || []).map((file) => ({
                id: file.id,
                name: file.original_name || file.file_path || "unknown-file",
                path: file.file_path || file.original_name || "",
                mime_type: file.mime_type || null,
                size_bytes: Number(file.size_bytes) || 0,
                status: file.status || "synced",
                uploaded_at: file.uploaded_at || null,
            }))
        });
    } catch (error) {
        console.error("Admin repo files error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load repository files" } });
    }
});

router.get("/repos/:repoId/inspect", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { repoId } = req.params;

        let repoQuery = supabase
            .from("repositories")
            .select("id, name, owner_id")
            .eq("id", repoId);

        repoQuery = applyEnvironmentFilter(repoQuery, environmentKey);

        const { data: repo, error: repoError } = await repoQuery.maybeSingle();
        if (repoError) {
            return res.status(500).json({ error: { message: repoError.message || "Failed to load repository" } });
        }

        if (!repo) {
            return res.status(404).json({ error: { message: "Repository not found" } });
        }

        const inspection = await gitService.inspectProjectRepository(repo.owner_id, repo.name);

        return res.json({
            environment_key: environmentKey,
            repo: {
                id: repo.id,
                name: repo.name,
                git_url: gitService.getGitUrl(repo.owner_id, repo.name)
            },
            branches: inspection.branches,
            commits: inspection.commits,
            files: inspection.files
        });
    } catch (error) {
        console.error("Admin repo inspect error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to inspect repository" } });
    }
});

router.get("/repos/:repoId/files/download", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        const { repoId } = req.params;
        const requestedPath = String(req.query.path || "").trim();

        if (!requestedPath) {
            return res.status(400).json({ error: { message: "File path is required" } });
        }

        if (requestedPath.includes("..")) {
            return res.status(400).json({ error: { message: "Invalid file path" } });
        }

        let repoQuery = supabase
            .from("repositories")
            .select("id, name, owner_id")
            .eq("id", repoId);

        repoQuery = applyEnvironmentFilter(repoQuery, environmentKey);

        const { data: repo, error: repoError } = await repoQuery.maybeSingle();
        if (repoError) {
            return res.status(500).json({ error: { message: repoError.message || "Failed to load repository" } });
        }

        if (!repo) {
            return res.status(404).json({ error: { message: "Repository not found" } });
        }

        const fileResult = await gitService.getProjectFileBuffer(repo.owner_id, repo.name, requestedPath);
        const downloadName = requestedPath.split(/[\\/]/).pop() || "download.bin";

        res.setHeader("Content-Disposition", `attachment; filename="${downloadName.replace(/"/g, "")}"`);
        res.setHeader("Content-Length", String(fileResult.size));
        res.setHeader("Content-Type", "application/octet-stream");
        return res.send(fileResult.buffer);
    } catch (error) {
        console.error("Admin repo download error:", error);
        return res.status(500).json({
            error: {
                message: error.message || "Failed to download repository file"
            }
        });
    }
});

router.get("/nodes", async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from("node_health")
            .select("node_key, ip_address, status, cpu_percent, temp_c, storage_used_bytes, storage_total_bytes, heartbeat_at")
            .order("heartbeat_at", { ascending: false });

        if (error) {
            console.error("Node telemetry fallback:", error);
            return res.json({ nodes: [] });
        }

        const latestNodeByKey = new Map();
        for (const row of data || []) {
            if (!latestNodeByKey.has(row.node_key)) {
                latestNodeByKey.set(row.node_key, row);
            }
        }

        const nodes = [...latestNodeByKey.values()].map((row) => {
            const usedBytes = Number(row.storage_used_bytes) || 0;
            const totalBytes = Number(row.storage_total_bytes) || 0;
            const usedPercent = totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0;

            return {
                id: row.node_key,
                ip: row.ip_address || "",
                status: row.status || "unknown",
                cpu: Number(row.cpu_percent) || 0,
                temp: Number(row.temp_c) || 0,
                heartbeat_at: row.heartbeat_at || null,
                storage: {
                    used: usedPercent,
                    used_bytes: usedBytes,
                    total_bytes: totalBytes
                }
            };
        });

        return res.json({ nodes });
    } catch (error) {
        console.error("Admin nodes error:", error);
        return res.json({ nodes: [] });
    }
});

export default router;

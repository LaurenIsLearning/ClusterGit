import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { applyEnvironmentFilter, getEnvironmentKey } from "../utils/environment.js";
import gitService from "../services/gitService.js";
import { loadLatestNodeSnapshots } from "../utils/nodeTelemetry.js";

const router = express.Router();
const DEFAULT_STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;

async function requireAdmin(req, res, next) {
    // checks if the signed in user is actually an admin before letting them use admin routes
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
    // gives the admin ui a name even if the profile row is missing display_name
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

async function getRepoContentSizeSafely(ownerId, projectName) {
    try {
        return await gitService.getRepoContentSize(ownerId, projectName);
    } catch (error) {
        console.warn(`Failed to compute repo content size for ${ownerId}/${projectName}:`, error.message);
        return 0;
    }
}

async function getRepoFilesFromTreeSafely(ownerId, projectName) {
    try {
        const repoPath = await gitService.resolveExistingRepoPath(ownerId, projectName);
        const state = await gitService.readRepoStateForSync(repoPath);
        const hidden = new Set([".gitattributes", ".gitignore", ".annex-placeholder"]);
        return state.files.filter((file) => !hidden.has(file.name));
    } catch (error) {
        if (error.name === "NoBranchError") return [];
        console.warn(`Failed to inspect repo files for ${ownerId}/${projectName}:`, error.message);
        return [];
    }
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

    if (error) {
        console.warn("Failed to load review request metadata:", error.message);
        return [];
    }
    return data || [];
}

function parseQuotaBytes(input) {
    // normalizes quota input so the db always gets a safe integer byte value
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return Math.round(parsed);
}

function isValidationError(err) {
    const msg = err?.message ?? "";
    return (
        msg.includes("required")
        || msg.includes("Invalid")
        || msg.includes("must be")
        || msg.includes("No valid fields")
    );
}

function normalizeOptionalString(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
}

function normalizeOptionalDateTime(value) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid datetime value");
    }

    return date.toISOString();
}

function validateManageUserCreatePayload(body) {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const display_name = normalizeOptionalString(body.display_name);
    const role = String(body.role ?? "student").trim();
    const storage_quota_bytes = Number(body.storage_quota_bytes ?? DEFAULT_STORAGE_QUOTA_BYTES);
    const storage_used_bytes = Number(body.storage_used_bytes ?? 0);
    const last_active_at = normalizeOptionalDateTime(body.last_active_at);

    if (!email) throw new Error("Email is required");
    if (!password) throw new Error("Password is required");
    if (!["student", "instructor", "admin"].includes(role)) throw new Error("Invalid role");
    if (!Number.isFinite(storage_quota_bytes) || storage_quota_bytes < 0) {
        throw new Error("storage_quota_bytes must be a non-negative number");
    }
    if (!Number.isFinite(storage_used_bytes) || storage_used_bytes < 0) {
        throw new Error("storage_used_bytes must be a non-negative number");
    }

    return {
        email,
        password,
        display_name,
        role,
        storage_quota_bytes: Math.trunc(storage_quota_bytes),
        storage_used_bytes: Math.trunc(storage_used_bytes),
        last_active_at,
    };
}

function validateManageUserUpdatePayload(body) {
    const updates = {};

    if ("display_name" in body) {
        updates.display_name = normalizeOptionalString(body.display_name);
    }

    if ("role" in body) {
        const role = String(body.role ?? "").trim();
        if (!["student", "instructor", "admin"].includes(role)) {
            throw new Error("Invalid role");
        }
        updates.role = role;
    }

    if ("storage_quota_bytes" in body) {
        const quota = Number(body.storage_quota_bytes);
        if (!Number.isFinite(quota) || quota < 0) {
            throw new Error("storage_quota_bytes must be a non-negative number");
        }
        updates.storage_quota_bytes = Math.trunc(quota);
    }

    if ("storage_used_bytes" in body) {
        const used = Number(body.storage_used_bytes);
        if (!Number.isFinite(used) || used < 0) {
            throw new Error("storage_used_bytes must be a non-negative number");
        }
        updates.storage_used_bytes = Math.trunc(used);
    }

    if ("last_active_at" in body) {
        updates.last_active_at = normalizeOptionalDateTime(body.last_active_at);
    }

    if (Object.keys(updates).length === 0) {
        throw new Error("No valid fields provided for update");
    }

    return updates;
}

function formatManageUserRow(profile, authUser) {
    return {
        user_id: profile.user_id,
        email: authUser?.email || "",
        display_name: profile.display_name,
        role: profile.role,
        storage_quota_bytes: Number(profile.storage_quota_bytes) || 0,
        storage_used_bytes: Number(profile.storage_used_bytes) || 0,
        last_active_at: profile.last_active_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        is_admin_created: profile.is_admin_created,
        admin_created_by: profile.admin_created_by,
    };
}

router.get("/summary", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        // pulls student quotas so the admin summary uses real supabase allocations instead of filler values
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
        const nodeSnapshots = await loadLatestNodeSnapshots().catch((error) => {
            console.warn("Failed to load node snapshots for admin summary:", error.message);
            return [];
        });

        const repoById = new Map((repos || []).map((r) => [r.id, r]));
        const repoIds = repos.map((repo) => repo.id);
        const totalUsers = new Set(repos.map((repo) => repo.owner_id).filter(Boolean)).size;

        let metadataSizeByRepo = new Map();
        if (repoIds.length > 0) {
            const { data: annexRows, error: annexError } = await supabase
                .from("annex_objects")
                .select("repo_id, size_bytes")
                .in("repo_id", repoIds);
            if (annexError) {
                console.warn("Failed to load admin storage metadata:", annexError.message);
            } else {
                metadataSizeByRepo = (annexRows || []).reduce((acc, row) => {
                    acc.set(row.repo_id, (acc.get(row.repo_id) || 0) + (Number(row.size_bytes) || 0));
                    return acc;
                }, new Map());
            }
        }

        const repoStorageBytes = (await Promise.all(repos.map(async (repo) => {
            const metadataSize = metadataSizeByRepo.get(repo.id) || 0;
            const treeSize = await getRepoContentSizeSafely(repo.owner_id, repo.name);
            return Math.max(metadataSize, treeSize);
        }))).reduce((sum, size) => sum + size, 0);

        const clusterUsedStorageBytes = nodeSnapshots.reduce((sum, node) => {
            return sum + (Number(node.storage?.used_bytes) || 0);
        }, 0);
        const clusterTotalStorageBytes = nodeSnapshots.reduce((sum, node) => {
            return sum + (Number(node.storage?.total_bytes) || 0);
        }, 0);
        const usedStorageBytes = clusterUsedStorageBytes || repoStorageBytes;

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
            console.warn("Failed to load admin activity metadata:", activityError.message);
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

        const healthyNodes = nodeSnapshots.filter((node) => node.status === "online").length;
        const health = nodeSnapshots.length > 0
            ? `${Math.round((healthyNodes / nodeSnapshots.length) * 100)}%`
            : "N/A";

        return res.json({
            health,
            active_users: activeUsers,
            total_users: totalUsers,
            used_storage_bytes: usedStorageBytes,
            total_storage_bytes: clusterTotalStorageBytes || totalStorageBytes,
            archived_repositories: archivedRepositories,
            recent_activity: activityError ? [] : recentActivity
        });
    } catch (error) {
        console.error("Admin summary error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load admin summary" } });
    }
});

router.get("/users", async (req, res) => {
    try {
        const environmentKey = getEnvironmentKey(req);
        // loads the real student list from supabase and then decorates it with repo usage for this environment
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

        const metadataSizeByRepo = new Map();
        for (const row of annexRows) {
            metadataSizeByRepo.set(row.repo_id, (metadataSizeByRepo.get(row.repo_id) || 0) + (Number(row.size_bytes) || 0));
        }

        const usedByUser = new Map();
        for (const repo of ownedRepos) {
            const ownerId = ownerByRepoId.get(repo.id);
            if (!ownerId) continue;

            const metadataSize = metadataSizeByRepo.get(repo.id) || 0;
            const treeSize = await getRepoContentSizeSafely(repo.owner_id, repo.name);
            usedByUser.set(ownerId, (usedByUser.get(ownerId) || 0) + Math.max(metadataSize, treeSize));
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
            // pushes review requests to the top so admins see them first
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

router.get("/manage-users", async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from("user_profiles")
            .select(`
                user_id,
                display_name,
                role,
                storage_quota_bytes,
                storage_used_bytes,
                last_active_at,
                created_at,
                updated_at,
                is_admin_created,
                admin_created_by
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const authUsersById = await listAuthUsersById();
        return res.json((data || []).map((profile) => formatManageUserRow(profile, authUsersById.get(profile.user_id))));
    } catch (error) {
        console.error("GET manage-users failed:", error);
        return res.status(500).json({
            error: {
                message: "Failed to fetch users",
                details: error.message || null
            }
        });
    }
});

router.post("/manage-users", async (req, res) => {
    try {
        const {
            email,
            password,
            display_name,
            role,
            storage_quota_bytes,
            storage_used_bytes,
            last_active_at,
        } = validateManageUserCreatePayload(req.body);

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name }
        });

        if (authError) throw authError;

        const userId = authData?.user?.id;
        if (!userId) {
            throw new Error("Auth user was created without a valid id");
        }

        const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .upsert(
                {
                    user_id: userId,
                    display_name,
                    role,
                    storage_quota_bytes,
                    storage_used_bytes,
                    last_active_at,
                    is_admin_created: true,
                    admin_created_by: req.user?.id ?? null,
                },
                { onConflict: "user_id" }
            )
            .select(`
                user_id,
                display_name,
                role,
                storage_quota_bytes,
                storage_used_bytes,
                last_active_at,
                created_at,
                updated_at,
                is_admin_created,
                admin_created_by
            `)
            .single();

        if (profileError) {
            await supabase.auth.admin.deleteUser(userId).catch(() => null);
            throw profileError;
        }

        return res.status(201).json(formatManageUserRow(profile, { email }));
    } catch (error) {
        console.error("CREATE manage-user failed:", error);
        const status = isValidationError(error) ? 400 : 500;
        return res.status(status).json({
            error: {
                message: status === 400 ? error.message : "Failed to create user",
                details: status === 500 ? error.message || null : null,
                code: error.code || null
            }
        });
    }
});

router.patch("/manage-users/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        const updates = validateManageUserUpdatePayload(req.body);

        const { data, error } = await supabase
            .from("user_profiles")
            .update(updates)
            .eq("user_id", userId)
            .select(`
                user_id,
                display_name,
                role,
                storage_quota_bytes,
                storage_used_bytes,
                last_active_at,
                created_at,
                updated_at,
                is_admin_created,
                admin_created_by
            `)
            .single();

        if (error) throw error;

        const authUsersById = await listAuthUsersById();
        return res.json(formatManageUserRow(data, authUsersById.get(userId)));
    } catch (error) {
        console.error("UPDATE manage-user failed:", error);
        const status = isValidationError(error) ? 400 : 500;
        return res.status(status).json({
            error: {
                message: status === 400 ? error.message : "Failed to update user",
                details: status === 500 ? error.message || null : null,
                code: error.code || null
            }
        });
    }
});

router.delete("/manage-users/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        if (req.user?.id === userId) {
            return res.status(400).json({
                error: { message: "Admins cannot delete their own account." }
            });
        }

        const { data: targetUser, error: targetErr } = await supabase
            .from("user_profiles")
            .select("role")
            .eq("user_id", userId)
            .maybeSingle();

        if (targetErr) throw targetErr;

        if (!targetUser) {
            return res.status(404).json({
                error: { message: "User not found" }
            });
        }

        if (targetUser.role === "admin") {
            const { count, error: countErr } = await supabase
                .from("user_profiles")
                .select("user_id", { count: "exact", head: true })
                .eq("role", "admin");

            if (countErr) throw countErr;

            if (count <= 1) {
                return res.status(400).json({
                    error: { message: "Cannot delete the last admin." }
                });
            }
        }

        const { data, error } = await supabase.auth.admin.deleteUser(userId);
        if (error) throw error;

        return res.json({ success: true, data });
    } catch (error) {
        console.error("DELETE manage-user failed:", error);
        return res.status(500).json({
            error: {
                message: "Failed to delete user",
                details: error.message || null,
                code: error.code || null
            }
        });
    }
});

router.post("/users", async (req, res) => {
    try {
        const adminUserId = req.user.id;
        // lets admins create student auth users directly from the dashboard
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
        // updates a student's storage allocation in supabase
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
        // resets a student's quota back to the app default
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

        for (const repo of repos) {
            const metadataSize = sizeByRepo.get(repo.id) || 0;
            const treeSize = await getRepoContentSizeSafely(userId, repo.name);
            sizeByRepo.set(repo.id, Math.max(metadataSize, treeSize));
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
            .select("id, name, owner_id, environment_key")
            .eq("id", repoId);

        repoQuery = applyEnvironmentFilter(repoQuery, environmentKey);

        const { data: repo, error: repoError } = await repoQuery.maybeSingle();

        if (repoError) {
            return res.status(500).json({ error: { message: repoError.message || "Failed to load repository" } });
        }

        if (!repo) {
            return res.status(404).json({ error: { message: "Repository not found" } });
        }

        const treeFiles = await getRepoFilesFromTreeSafely(repo.owner_id, repo.name);

        // file inspection prefers metadata, but falls back to the live git tree.
        const { data: files, error: filesError } = await supabase
            .from("repo_files")
            .select("id, original_name, file_path, mime_type, size_bytes, status, uploaded_at")
            .eq("repo_id", repoId)
            .order("uploaded_at", { ascending: false });

        if (filesError) {
            console.warn("Failed to load repo_files metadata for admin files view:", filesError.message);
        }

        const metadataFiles = filesError ? [] : (files || []);
        const metaByPath = new Map(metadataFiles.map((file) => [file.file_path || file.original_name, file]));
        const mergedFiles = treeFiles.length > 0
            ? treeFiles.map((file, index) => {
                const meta = metaByPath.get(file.path) || metaByPath.get(file.name);
                return {
                    id: meta?.id || `git-${index}`,
                    original_name: meta?.original_name || file.name,
                    file_path: file.path,
                    mime_type: meta?.mime_type || null,
                    size_bytes: Number(meta?.size_bytes) || Number(file.sizeBytes) || 0,
                    status: meta?.status || "synced",
                    uploaded_at: meta?.uploaded_at || null,
                };
            })
            : metadataFiles;

        return res.json({
            environment_key: environmentKey,
            files: mergedFiles.map((file) => ({
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

        // uses the live repo on disk so admins can inspect real branches, commits, and file trees
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

        // blocks obvious path traversal before touching the repo checkout
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
        const nodes = await loadLatestNodeSnapshots();
        res.set("Cache-Control", "no-store");
        return res.json({ nodes });
    } catch (error) {
        console.error("Admin nodes error:", error);
        res.set("Cache-Control", "no-store");
        return res.json({ nodes: [] });
    }
});

export default router;

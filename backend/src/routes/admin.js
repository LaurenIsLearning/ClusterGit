import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

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

router.get("/summary", async (_req, res) => {
    try {
        const { data: profiles, error: profilesError } = await supabase
            .from("user_profiles")
            .select("user_id, role, storage_quota_bytes");
        if (profilesError) {
            return res.status(500).json({ error: { message: profilesError.message || "Failed to load profiles" } });
        }

        const studentProfiles = (profiles || []).filter((p) => p.role === "student");
        const totalUsers = studentProfiles.length;
        const totalStorageBytes = studentProfiles.reduce((sum, profile) => {
            return sum + (Number(profile.storage_quota_bytes) || 0);
        }, 0);

        const { data: annexRows, error: annexError } = await supabase
            .from("annex_objects")
            .select("size_bytes");
        if (annexError) {
            return res.status(500).json({ error: { message: annexError.message || "Failed to load storage usage" } });
        }

        const usedStorageBytes = (annexRows || []).reduce((sum, row) => sum + (Number(row.size_bytes) || 0), 0);

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: activityRows, error: activityError } = await supabase
            .from("activity_log")
            .select("user_id, repo_id, detail, created_at")
            .gte("created_at", oneDayAgo)
            .order("created_at", { ascending: false });
        if (activityError) {
            return res.status(500).json({ error: { message: activityError.message || "Failed to load activity" } });
        }

        const activeUsers = new Set((activityRows || []).map((r) => r.user_id).filter(Boolean)).size;

        const { data: repos, error: reposError } = await supabase
            .from("repositories")
            .select("id, name, created_at, last_activity_at");
        if (reposError) {
            return res.status(500).json({ error: { message: reposError.message || "Failed to load repositories" } });
        }

        const repoById = new Map((repos || []).map((r) => [r.id, r]));

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

router.get("/users", async (_req, res) => {
    try {
        const { data: profiles, error: profilesError } = await supabase
            .from("user_profiles")
            .select("user_id, role, display_name, storage_quota_bytes");
        if (profilesError) {
            return res.status(500).json({ error: { message: profilesError.message || "Failed to load profiles" } });
        }

        const students = (profiles || []).filter((p) => p.role === "student");
        const studentIds = students.map((s) => s.user_id);

        const { data: repos, error: reposError } = await supabase
            .from("repositories")
            .select("id, owner_id")
            .in("owner_id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"]);
        if (reposError) {
            return res.status(500).json({ error: { message: reposError.message || "Failed to load repositories" } });
        }

        const repoIds = (repos || []).map((r) => r.id);
        const ownerByRepoId = new Map((repos || []).map((r) => [r.id, r.owner_id]));

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

        const { data: activityRows } = await supabase
            .from("activity_log")
            .select("user_id, created_at")
            .in("user_id", studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"])
            .order("created_at", { ascending: false });

        const lastActiveByUser = new Map();
        for (const row of activityRows || []) {
            if (!lastActiveByUser.has(row.user_id)) {
                lastActiveByUser.set(row.user_id, row.created_at || null);
            }
        }

        const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authById = new Map((authList?.users || []).map((u) => [u.id, u]));

        const users = students.map((student) => {
            const authUser = authById.get(student.user_id);
            return {
                id: student.user_id,
                name: student.display_name || authUser?.email?.split("@")?.[0] || "Unknown",
                email: authUser?.email || "",
                used_bytes: usedByUser.get(student.user_id) || 0,
                quota_bytes: Number(student.storage_quota_bytes) || 0,
                last_active_at: lastActiveByUser.get(student.user_id) || authUser?.last_sign_in_at || null
            };
        });

        return res.json(users);
    } catch (error) {
        console.error("Admin users error:", error);
        return res.status(500).json({ error: { message: error.message || "Failed to load admin users" } });
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

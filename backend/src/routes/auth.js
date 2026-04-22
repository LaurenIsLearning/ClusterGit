import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();

function resolveRole(profileRole, rawUser) {
    return (
        profileRole
        || rawUser?.app_metadata?.role
        || rawUser?.user_metadata?.role
        || null
    );
}

function resolveDisplayName(profileDisplayName, rawUser, email) {
    return (
        profileDisplayName
        || rawUser?.user_metadata?.display_name
        || rawUser?.user_metadata?.full_name
        || rawUser?.user_metadata?.name
        || rawUser?.user_metadata?.user_name
        || rawUser?.user_metadata?.preferred_username
        || email?.split("@")?.[0]
        || "user"
    );
}

async function ensureUserProfile(userId, email, rawUser, existingProfile = null) {
    const resolvedRole = resolveRole(existingProfile?.role, rawUser) || "student";
    const resolvedDisplayName = resolveDisplayName(existingProfile?.display_name, rawUser, email);

    if (
        existingProfile?.role === resolvedRole
        && existingProfile?.display_name === resolvedDisplayName
    ) {
        return {
            display_name: resolvedDisplayName,
            role: resolvedRole
        };
    }

    const { error } = await supabase
        .from("user_profiles")
        .upsert(
            {
                user_id: userId,
                display_name: resolvedDisplayName,
                role: resolvedRole
            },
            { onConflict: "user_id" }
        );

    if (error) {
        console.error("Failed to ensure user profile metadata:", error);
    }

    return {
        display_name: resolvedDisplayName,
        role: resolvedRole
    };
}

// REGISTER
router.post("/register", async (req, res) => {
    const { email, password, display_name, role } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: { message: "Email and password are required" }
        });
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        return res.status(400).json({
            error: { message: error.message || "Registration failed" }
        });
    }

    const userId = data?.user?.id;
    if (userId) {
        const fallbackDisplayName = email?.split("@")?.[0] || "user";
        const { error: profileError } = await supabase
            .from("user_profiles")
            .upsert({
                user_id: userId,
                role: role || "student",
                display_name: display_name || fallbackDisplayName
            }, { onConflict: "user_id" });

        if (profileError) {
            console.error("Failed to upsert user profile metadata:", profileError);
        }

        const { error: activityError } = await supabase
            .from("activity_log")
            .insert({
                user_id: userId,
                event_type: "user_registered",
                detail: `User registered with email ${email}`
            });

        if (activityError) {
            console.error("Failed to log registration activity:", activityError);
        }
    }

    return res.json(data);
});

// LOGIN
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: { message: "Email and password are required" }
        });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return res.status(401).json({
            error: { message: error.message || "Invalid credentials" }
        });
    }

    return res.json(data);
});

// LOGOUT
router.post("/logout", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: { message: "No authorization token provided" }
        });
    }

    const token = authHeader.replace("Bearer ", "");
    const { error } = await supabase.auth.admin.signOut(token);

    if (error) {
        return res.status(400).json({
            error: { message: error.message || "Logout failed" }
        });
    }

    return res.json({ message: "Logged out successfully" });
});

// GET SESSION
router.get("/session", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: { message: "No authorization token provided" }
        });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({
            error: { message: "Invalid or expired session" }
        });
    }

    return res.json({ user });
});

// GET PROFILE (for authenticated user)
router.get("/profile", authMiddleware, async (req, res) => {
    const userId = req.user.id;

    const { data, error } = await supabase
        .from("user_profiles")
        .select("display_name, role")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        return res.status(500).json({
            error: { message: error.message || "Failed to load profile" }
        });
    }

    const ensuredProfile = await ensureUserProfile(
        userId,
        req.user.email,
        req.user.raw,
        data || null
    );

    return res.json({
        user_id: userId,
        email: req.user.email,
        display_name: ensuredProfile.display_name,
        role: ensuredProfile.role
    });
});

// UPDATE DISPLAY NAME (for authenticated user)
router.patch("/profile", authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const displayName = String(req.body?.display_name || "").trim();

    if (!displayName) {
        return res.status(400).json({
            error: { message: "Display name is required" }
        });
    }

    if (displayName.length > 60) {
        return res.status(400).json({
            error: { message: "Display name must be 60 characters or fewer" }
        });
    }

    // role is NOT NULL in user_profiles; preserve metadata/admin role when the profile row is missing.
    const { data: existingProfile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

    const resolvedRole = resolveRole(existingProfile?.role, req.user.raw) || "student";

    const { data, error } = await supabase
        .from("user_profiles")
        .upsert(
            {
                user_id: userId,
                display_name: displayName,
                role: resolvedRole
            },
            { onConflict: "user_id" }
        )
        .select("display_name, role")
        .single();

    if (error) {
        return res.status(500).json({
            error: { message: error.message || "Failed to update profile" }
        });
    }

    return res.json({
        user_id: userId,
        email: req.user.email,
        display_name: data?.display_name || displayName,
        role: resolveRole(data?.role, req.user.raw)
    });
});

export default router;

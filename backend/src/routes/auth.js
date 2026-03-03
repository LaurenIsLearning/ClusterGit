import express from "express";
import { supabase } from "../utils/supabase.js";
const router = express.Router();

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

export default router;

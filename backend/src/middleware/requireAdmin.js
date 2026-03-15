import { supabase } from "../utils/supabase.js";

export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: { message: "Authentication required" },
      });
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error: {
          message: "Failed to verify admin role",
          details: error.message || null,
        },
      });
    }

    if (!data || data.role !== "admin") {
      return res.status(403).json({
        error: { message: "Admin access required" },
      });
    }

    req.user.role = data.role;
    next();
  } catch (err) {
    console.error("[requireAdmin] failed:", err);
    return res.status(500).json({
      error: {
        message: "Admin authorization failed",
        details: err.message || null,
      },
    });
  }
};

export default requireAdmin;
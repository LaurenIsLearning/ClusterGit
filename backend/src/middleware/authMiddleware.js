import { supabase } from "../utils/supabase.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        error: { message: "Missing or invalid Authorization header" },
      });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: {
          message: "Invalid or expired session",
          details: error?.message || null,
        },
      });
    }

    req.user = {
      id: user.id,
      email: user.email ?? null,
      raw: user,
    };
    req.accessToken = token;

    next();
  } catch (err) {
    console.error("[requireAuth] failed:", err);
    return res.status(500).json({
      error: {
        message: "Authentication check failed",
        details: err.message || null,
      },
    });
  }
};

export default requireAuth;

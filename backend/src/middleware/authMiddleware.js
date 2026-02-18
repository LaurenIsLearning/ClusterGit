import { supabase } from "../utils/supabase.js";

export const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: { message: "Authentication required" }
        });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(401).json({
            error: { message: "Invalid or expired session" }
        });
    }

    req.user = user;
    next();
};

export default requireAuth;
import { supabase } from "../utils/supabase.js";
export default async function authMiddleware(req, res, next) {
const token = req.headers.authorization?.replace("Bearer ", "");
if (!token) {
return res.status(401).json({ error: "Missing token" });
}
const { data, error } = await supabase.auth.getUser(token);
if (error || !data.user) {
return res.status(401).json({ error: "Invalid token" });
}
req.user = data.user;
next();
}
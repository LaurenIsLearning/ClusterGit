import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();
// CREATE REPOSITORY
router.post("/create", authMiddleware, async (req, res) => {
const { repo_name } = req.body;
const owner_id = req.user.id;
const { data, error } = await supabase
.from("repos")
.insert({
name: repo_name,
owner_id,
created_at: new Date(),
})
.select();
if (error) return res.status(400).json({ error });
return res.json({ success: true, repo: data[0] });
});
// LIST USER REPOSITORIES
router.get("/my", authMiddleware, async (req, res) => {
const owner_id = req.user.id;
const { data, error } = await supabase
.from("repos")
.select("*")
.eq("owner_id", owner_id);
if (error) return res.status(400).json({ error });
return res.json(data);
});
export default router;
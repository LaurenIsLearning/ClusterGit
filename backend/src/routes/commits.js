import express from "express";
import { supabase } from "../utils/supabase.js";
import authMiddleware from "../middleware/authMiddleware.js";
const router = express.Router();
// RECORD A COMMIT
router.post("/:repo_id", authMiddleware, async (req, res) => {
const { repo_id } = req.params;
const { file_size, file_count, annex_uuid } = req.body;
const { data, error } = await supabase
.from("commits")
.insert({
repo_id,
user_id: req.user.id,
file_size,
file_count,
annex_uuid,
timestamp: new Date(),
})
.select();
if (error) return res.status(400).json({ error });
return res.json(data[0]);
});
// LIST COMMITS FOR A REPO
router.get("/:repo_id", authMiddleware, async (req, res) => {
const { repo_id } = req.params;
const { data, error } = await supabase
.from("commits")
.select("*")
.eq("repo_id", repo_id);
if (error) return res.status(400).json({ error });
return res.json(data);
});
export default router;
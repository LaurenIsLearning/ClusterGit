import express from "express";
import { supabase } from "../utils/supabase.js";
const router = express.Router();
// REGISTER
router.post("/register", async (req, res) => {
const { email, password } = req.body;
const { data, error } = await supabase.auth.signUp({
    email,
password,
});
if (error) return res.status(400).json({ error });
return res.json(data);
});
// LOGIN
router.post("/login", async (req, res) => {
const { email, password } = req.body;
const { data, error } = await supabase.auth.signInWithPassword({
email,
password,
});
if (error) return res.status(401).json({ error });
return res.json(data);
});
export default router;
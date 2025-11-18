import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
// Connect using service role (so API can write DB rows)
export const supabase = createClient(
process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY
);
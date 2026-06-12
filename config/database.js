const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error("❌ ERROR: SUPABASE_URL or SUPABASE_KEY is not defined in the environment variables!");
    console.error("Please ensure you have a .env file in the root directory with these variables defined.");
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

module.exports = { supabase };
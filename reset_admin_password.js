require("dotenv").config();
const bcrypt = require("bcrypt");
const { supabase } = require("./config/database");

async function reset() {
    const newPassword = "admin";
    const hash = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
        .from("users")
        .update({ password: hash })
        .eq("username", "admin");

    if (error) {
        console.error("❌ Failed to reset admin password:", error);
    } else {
        console.log("✅ Admin password successfully reset to 'admin'!");
    }
}
reset();

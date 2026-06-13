const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const keyFilePath = path.join(__dirname, "credentials.json");
let googleAuth;

if (fs.existsSync(keyFilePath)) {
    googleAuth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
} else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        googleAuth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/drive"],
        });
        console.log("✅ Google Drive Client initialized using GOOGLE_SERVICE_ACCOUNT_JSON environment variable");
    } catch (err) {
        console.error("❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", err.message);
    }
}

if (!googleAuth) {
    console.error("⚠️ Warning: Google credentials not configured (credentials.json missing and GOOGLE_SERVICE_ACCOUNT_JSON not set).");
}

const drive = googleAuth ? google.drive({ version: "v3", auth: googleAuth }) : null;

module.exports = { drive };
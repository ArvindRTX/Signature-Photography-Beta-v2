const { google } = require("googleapis");
const path = require("path");

// Google Drive Client
const googleAuth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, "credentials.json"),
    scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth: googleAuth });

module.exports = { drive };
require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const compression = require("compression");
const { connectDB, getDB } = require("./config/database");
const { drive, twilioClient } = require("./config/services");

const indexRoutes = require("./routes/index");
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");

const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "7d",
    etag: true,
    setHeaders: (res, filePath) => {
      if (/(\.html)$/.test(filePath)) {
        // Avoid caching HTML
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  })
);

// Make db and services available to routes
app.use((req, res, next) => {
  req.db = getDB();
  req.drive = drive;
  req.twilioClient = twilioClient;
  next();
});

// Mount routers
app.use("/", indexRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);

// 404 handler (last)
app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Page Not Found</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:40px;color:#333} .wrap{max-width:720px;margin:0 auto;text-align:center} h1{font-size:28px;margin-bottom:10px} p{color:#666} a{color:#1a73e8;text-decoration:none}</style></head><body><div class="wrap"><h1>404 - Page Not Found</h1><p>The page you are looking for does not exist.</p><p><a href="/">Return to Home</a></p></div></body></html>`);
});

async function startServer() {
  try {
    await connectDB();
    console.log("✅ Connected successfully to MongoDB");
    app.listen(port, () => {
      console.log(`🚀 Server is running at http://localhost:${port}`);
      console.log(
        `🙍 Dashboard is running at http://localhost:${port}/dashboard`
      );
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

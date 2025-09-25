require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
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
app.use(express.static(path.join(__dirname, "public")));

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

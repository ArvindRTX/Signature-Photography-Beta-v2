const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const router = express.Router();

// Admin Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = req.db;
    const user = await db
      .collection("users")
      .findOne({ username: username.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }
    const token = jwt.sign(
      { username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.status(200).json({
      message: "Admin login successful",
      token,
      username: user.username,
    });
  } catch (error) {
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

// Client Login
// Inside routes/auth.js

router.post("/client-login", async (req, res) => {
  try {
    // We no longer need the 'slug' here
    const { username, password } = req.body;
    const db = req.db;

    // 1. Find the user and validate password
    const clientUser = await db
      .collection("clients")
      .findOne({ username: username.toLowerCase() });
    if (!clientUser || !(await bcrypt.compare(password, clientUser.password))) {
      return res.status(401).json({ message: "Invalid client credentials." });
    }

    // 2. Generate the token immediately after successful login
    const token = jwt.sign(
      { clientId: clientUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    const assignedGalleryIds = clientUser.galleryIds || [];

    // 3. Handle different scenarios based on gallery count

    // CASE: User has NO galleries assigned
    if (assignedGalleryIds.length === 0) {
      return res
        .status(403)
        .json({ message: "You have not been assigned to any galleries yet." });
    }

    // CASE: User has ONE gallery assigned
    if (assignedGalleryIds.length === 1) {
      const gallery = await db
        .collection("galleries")
        .findOne({ _id: assignedGalleryIds[0] });
      if (!gallery) {
        return res.status(404).json({
          message:
            "Your assigned gallery could not be found. Please contact support.",
        });
      }
      // Respond with instructions to redirect
      return res.status(200).json({
        message: "Login successful! Redirecting...",
        token,
        clientName: clientUser.name, // ✨ ADD THIS LINE
        action: "redirect",
        destination: `/gallery/${gallery.slug}`,
      });
    }

    // CASE: User has MULTIPLE galleries assigned
    const galleries = await db
      .collection("galleries")
      .find({
        _id: { $in: assignedGalleryIds },
      })
      .project({ name: 1, slug: 1 })
      .toArray();

    // Respond with a list of galleries for the user to choose from
    return res.status(200).json({
      message: "Please select a gallery to view.",
      token,
      clientName: clientUser.name, // ✨ ADD THIS LINE
      action: "select",
      galleries: galleries.map((g) => ({ name: g.name, slug: g.slug })),
    });
  } catch (error) {
    console.error("Client login error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

module.exports = router;

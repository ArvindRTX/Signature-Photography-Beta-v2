const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();

// Admin Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const supabase = req.supabase;

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Admin login db error:", error);
      return res.status(500).json({ message: "An internal server error occurred." });
    }

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
    console.error("Admin login error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

// Client Login
router.post("/client-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const supabase = req.supabase;

    // 1. Find the client and validate password
    const { data: clientUser, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("username", username.toLowerCase())
      .maybeSingle();

    if (clientError) {
      console.error("Client login db error:", clientError);
      return res.status(500).json({ message: "An internal server error occurred." });
    }

    if (!clientUser || !(await bcrypt.compare(password, clientUser.password))) {
      return res.status(401).json({ message: "Invalid client credentials." });
    }

    // 2. Generate token with client UUID (mapped as clientId)
    const token = jwt.sign(
      { clientId: clientUser.id },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // 3. Fetch assigned gallery IDs
    const { data: cgData, error: cgError } = await supabase
      .from("client_galleries")
      .select("gallery_id")
      .eq("client_id", clientUser.id);

    if (cgError) {
      console.error("Fetch client galleries error:", cgError);
      return res.status(500).json({ message: "Failed to retrieve assigned galleries." });
    }

    const assignedGalleryIds = cgData.map(row => row.gallery_id) || [];

    // CASE: User has NO galleries assigned
    if (assignedGalleryIds.length === 0) {
      return res
        .status(403)
        .json({ message: "You have not been assigned to any galleries yet." });
    }

    // CASE: User has ONE gallery assigned
    if (assignedGalleryIds.length === 1) {
      const { data: gallery, error: gError } = await supabase
        .from("galleries")
        .select("*")
        .eq("id", assignedGalleryIds[0])
        .maybeSingle();

      if (gError || !gallery) {
        console.error("Fetch single gallery error:", gError);
        return res.status(404).json({
          message:
            "Your assigned gallery could not be found. Please contact support.",
        });
      }

      return res.status(200).json({
        message: "Login successful! Redirecting...",
        token,
        clientName: clientUser.name,
        action: "redirect",
        destination: `/gallery/${gallery.slug}`,
      });
    }

    // CASE: User has MULTIPLE galleries assigned
    const { data: galleries, error: gError } = await supabase
      .from("galleries")
      .select("id, name, slug")
      .in("id", assignedGalleryIds);

    if (gError || !galleries) {
      console.error("Fetch multiple galleries error:", gError);
      return res.status(500).json({ message: "Failed to load assigned galleries." });
    }

    // Respond with list of galleries for user to choose from
    return res.status(200).json({
      message: "Please select a gallery to view.",
      token,
      clientName: clientUser.name,
      action: "select",
      galleries: galleries.map((g) => ({ name: g.name, slug: g.slug })),
    });
  } catch (error) {
    console.error("Client login error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

module.exports = router;

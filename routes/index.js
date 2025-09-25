const express = require('express');
const path = require('path');
const router = express.Router();

router.get("/gallery/:slug", (req, res) =>
    res.sendFile(path.join(__dirname, "../views/index.html"))
);

router.get("/dashboard", (req, res) =>
    res.sendFile(path.join(__dirname, "../views/dashboard.html"))
);

router.get("/", (req, res) => 
    res.sendFile(path.join(__dirname, "../views/index.html"))
);

module.exports = router;
const jwt = require("jsonwebtoken");

const checkAdminAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) throw new Error("Missing auth header");
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.username || decoded.clientId !== undefined) {
            throw new Error("Invalid admin claim");
        }
        req.adminData = decoded;
        next();
    } catch (error) {
        console.error("checkAdminAuth failed:", error.message || error);
        return res.status(401).json({ message: "Admin authentication failed." });
    }
};

const checkClientAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) throw new Error("Missing auth header");
        const token = authHeader.split(" ")[1];
        req.clientData = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Client authentication failed." });
    }
};

module.exports = { checkAdminAuth, checkClientAuth };
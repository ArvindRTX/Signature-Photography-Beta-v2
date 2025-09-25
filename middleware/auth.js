const jwt = require("jsonwebtoken");

const checkAdminAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Admin authentication failed." });
    }
};

const checkClientAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(" ")[1];
        req.clientData = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Client authentication failed." });
    }
};

module.exports = { checkAdminAuth, checkClientAuth };
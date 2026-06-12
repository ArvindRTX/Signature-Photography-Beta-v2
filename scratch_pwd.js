const bcrypt = require("bcrypt");

const hash = "$2b$10$Q.KBhPexndPphes9CEUQsuWuNNSAuVXfa6/6H/u9yCnUEO8WyVkE.";
const candidates = [
    "admin",
    "admin123",
    "password",
    "123456",
    "aravinth",
    "aravinth123",
    "signature",
    "signature123",
    "signaturephotography",
    "signaturephotography123"
];

async function check() {
    for (const c of candidates) {
        const match = await bcrypt.compare(c, hash);
        if (match) {
            console.log("MATCH FOUND:", c);
            return;
        }
    }
    console.log("No matches found among standard candidates.");
}

check();

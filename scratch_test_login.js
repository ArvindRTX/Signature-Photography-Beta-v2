const http = require("http");

function testLogin() {
    const data = JSON.stringify({
        username: "admin",
        password: "admin_password_here" // Wait! What is the password?
    });

    // Wait, let's just inspect the database entry's password.
    // The hash is: $2b$10$Q.KBhPexndPphes9CEUQsuWuNNSAuVXfa6/6H/u9yCnUEO8WyVkE.
    // Let's check what password matches it. Or wait, let's write a script that tests
    // authenticating with different passwords or checks if the request crashes the backend.
}

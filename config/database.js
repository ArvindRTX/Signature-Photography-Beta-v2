const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI);
let db;

async function connectDB() {
    if (db) return db;
    try {
        await client.connect();
        db = client.db("photo-gallery-db");
        return db;
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        throw err;
    }
}

function getDB() {
    if (!db) {
        throw new Error("Database not initialized! Call connectDB first.");
    }
    return db;
}

module.exports = { connectDB, getDB };
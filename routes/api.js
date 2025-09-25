const express = require('express');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const { checkAdminAuth, checkClientAuth } = require('../middleware/auth');
const { extractFolderIdFromUrl, createSlug } = require('../utils/helpers');
const router = express.Router();

// --- Client-Facing Routes ---

router.get("/my-gallery", checkClientAuth, async (req, res) => {
    try {
        const { slug } = req.query;
        const { clientData, db, drive } = req;
        if (!slug) return res.status(400).json({ error: "Gallery slug is required." });

        const clientUser = await db.collection("clients").findOne({ _id: new ObjectId(clientData.clientId) });
        const gallery = await db.collection("galleries").findOne({ slug });

        const clientHasAccess = (clientUser.galleryIds || []).some(id => id.equals(gallery?._id));

        if (!gallery || !clientHasAccess) {
            return res.status(404).json({ error: "Gallery not found or access denied." });
        }

        const response = await drive.files.list({
            q: `'${gallery.folderId}' in parents and mimeType contains 'image/' and trashed=false`,
            fields: "files(id, name)",
            pageSize: 1000,
            orderBy: "name",
        });

        if (!response.data.files) return res.json({ photos: [], totalPages: 0 });

        const allFiles = response.data.files;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const totalPages = Math.ceil(allFiles.length / limit);
        const paginatedFiles = allFiles.slice(startIndex, endIndex);

        const photoData = paginatedFiles.map((file) => ({
            id: file.id,
            name: file.name,
            url: `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`,
        }));

        res.json({ photos: photoData, totalPages, totalPhotos: allFiles.length });
    } catch (error) {
        console.error("Fetch gallery error:", error);
        res.status(500).json({ error: "Failed to fetch photos." });
    }
});

router.post("/submit", async (req, res) => {
    const { clientName, clientEmail, clientPhone, selectedPhotos, gallerySlug } = req.body;
    const { db, twilioClient } = req;
    try {
        await db.collection("submissions").insertOne({ clientName, clientEmail, clientPhone, selectedPhotos, submittedAt: new Date(), gallerySlug });
        await db.collection("contacts").updateOne({ email: clientEmail.toLowerCase() }, { $set: { name: clientName, phone: clientPhone, email: clientEmail.toLowerCase() }, $setOnInsert: { createdAt: new Date() }, $currentDate: { lastSubmittedAt: true } }, { upsert: true });

        const gallery = await db.collection("galleries").findOne({ slug: gallerySlug });
        const folderLink = gallery ? `https://drive.google.com/drive/u/0/folders/${gallery.folderId}` : "Not Found";
        const fileList = selectedPhotos.map(photo => `- ${photo.name}`).join("\n");
        const messageBody = `*New Photo Selection!* ✅\n\n*Client:* ${clientName}\n*Phone:* ${clientPhone}\n*Total Selected:* ${selectedPhotos.length}\n\n*View Gallery Folder:*\n${folderLink}\n\n*Selected Files:*\n${fileList}`;

        await twilioClient.messages.create({ body: messageBody, from: process.env.TWILIO_WHATSAPP_NUMBER, to: process.env.YOUR_WHATSAPP_NUMBER });
        res.status(200).json({ message: "Selections submitted and processed successfully!" });
    } catch (error) {
        console.error("Submission Error:", error);
        // Error notification logic...
        res.status(500).json({ error: "Failed to process submission." });
    }
});

// --- Admin Dashboard API Routes ---

const getPaginatedList = async (req, res, collectionName, searchFields) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const skip = (page - 1) * limit;
        const db = req.db;

        let query = {};
        if (search && searchFields.length > 0) {
            query.$or = searchFields.map(field => ({
                [field]: { $regex: search, $options: "i" }
            }));
        }

        const collection = db.collection(collectionName);
        const data = await collection.find(query).sort({ _id: -1 }).skip(skip).limit(limit).toArray();
        const total = await collection.countDocuments(query);

        res.status(200).json({ data, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: `Failed to fetch ${collectionName}.` });
    }
};

router.get("/dashboard-stats", checkAdminAuth, async (req, res) => {
    try {
        const db = req.db;
        const totalGalleries = await db.collection("galleries").countDocuments();
        const totalClients = await db.collection("clients").countDocuments();
        const totalSelections = await db.collection("submissions").countDocuments();
        const assignedGalleryIds = await db.collection("clients").distinct("galleryIds");
        const unassignedGalleries = await db.collection("galleries").countDocuments({ _id: { $nin: assignedGalleryIds } });
        res.status(200).json({ totalGalleries, totalClients, totalSelections, unassignedGalleries });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch dashboard stats." });
    }
});

// Galleries Routes
router.get("/galleries", checkAdminAuth, (req, res) => getPaginatedList(req, res, "galleries", ["name", "slug"]));
router.post("/galleries", checkAdminAuth, async (req, res) => {
    try {
        const { name, folderLink, clientId } = req.body;
        const db = req.db;
        if (!name || !folderLink) return res.status(400).json({ message: "Gallery name and folder link are required." });
        
        const folderId = extractFolderIdFromUrl(folderLink);
        if (!folderId) return res.status(400).json({ message: "Invalid Google Drive folder link." });

        const slug = createSlug(name);
        const newGallery = await db.collection("galleries").insertOne({ name, slug, folderId, createdAt: new Date() });
        if (clientId) {
            await db.collection("clients").updateOne({ _id: new ObjectId(clientId) }, { $addToSet: { galleryIds: newGallery.insertedId } });
        }
        res.status(201).json({ message: "Gallery created successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Failed to create gallery." });
    }
});
router.delete("/galleries/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const db = req.db;
        await db.collection("galleries").deleteOne({ _id: new ObjectId(id) });
        await db.collection("clients").updateMany({}, { $pull: { galleryIds: new ObjectId(id) } });
        res.status(200).json({ message: "Gallery deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete gallery." });
    }
});

// Clients Routes
router.get("/clients", checkAdminAuth, (req, res) => getPaginatedList(req, res, "clients", ["name", "username"]));
router.post("/clients", checkAdminAuth, async (req, res) => {
    try {
        const { name, username, password } = req.body;
        const db = req.db;
        if (!name || !username || !password) return res.status(400).json({ message: "All fields are required." });

        const existingClient = await db.collection("clients").findOne({ username: username.toLowerCase() });
        if (existingClient) return res.status(409).json({ message: "Username already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection("clients").insertOne({ name, username: username.toLowerCase(), password: hashedPassword, galleryIds: [], createdAt: new Date() });
        res.status(201).json({ message: "Client created successfully!" });
    } catch (error) {
        res.status(500).json({ message: "Failed to create client." });
    }
});
router.put("/clients/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, password } = req.body;
        const db = req.db;
        let updateData = { name, username: username.toLowerCase() };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        await db.collection("clients").updateOne({ _id: new ObjectId(id) }, { $set: updateData });
        res.status(200).json({ message: "Client updated successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to update client." });
    }
});
router.put("/clients/:id/galleries", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { galleryIds } = req.body;
        const db = req.db;
        const galleryObjectIds = galleryIds.map(gid => new ObjectId(gid));
        await db.collection("clients").updateOne({ _id: new ObjectId(id) }, { $set: { galleryIds: galleryObjectIds } });
        res.status(200).json({ message: "Client galleries updated successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to update client galleries." });
    }
});
router.delete("/clients/:id", checkAdminAuth, async (req, res) => {
    try {
        const db = req.db;
        await db.collection("clients").deleteOne({ _id: new ObjectId(req.params.id) });
        res.status(200).json({ message: "Client deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete client." });
    }
});

// Contacts & Submissions Routes
router.get("/contacts", checkAdminAuth, (req, res) => getPaginatedList(req, res, "contacts", ["name", "email", "phone"]));
router.delete("/contacts/:id", checkAdminAuth, async (req, res) => {
    try {
        const db = req.db;
        await db.collection("contacts").deleteOne({ _id: new ObjectId(req.params.id) });
        res.status(200).json({ message: "Contact deleted successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete contact." });
    }
});
router.get("/submissions/:email", checkAdminAuth, async (req, res) => {
    try {
        const db = req.db;
        const submissions = await db.collection("submissions").find({ clientEmail: req.params.email }).sort({ submittedAt: -1 }).toArray();
        res.status(200).json(submissions);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch submission history." });
    }
});

module.exports = router;
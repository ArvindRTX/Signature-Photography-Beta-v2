const express = require('express');
const bcrypt = require('bcrypt');
const https = require('https');
const { checkAdminAuth, checkClientAuth } = require('../middleware/auth');
const { extractFolderIdFromUrl, createSlug } = require('../utils/helpers');
const router = express.Router();

// --- DATA MAPPING HELPERS FOR FRONTEND COMPATIBILITY ---

const mapClient = (client, clientGalleries = []) => {
    return {
        _id: client.id,
        id: client.id,
        name: client.name,
        username: client.username,
        createdAt: client.created_at,
        galleryIds: clientGalleries
            .filter(cg => cg.client_id === client.id)
            .map(cg => cg.gallery_id)
    };
};

const mapGallery = (gallery) => {
    return {
        _id: gallery.id,
        id: gallery.id,
        name: gallery.name,
        slug: gallery.slug,
        folderId: gallery.folder_id,
        createdAt: gallery.created_at,
        selectionLimit: gallery.selection_limit
    };
};

const mapContact = (contact) => {
    return {
        _id: contact.id,
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        createdAt: contact.created_at,
        lastSubmittedAt: contact.last_submitted_at
    };
};

const mapSubmission = (sub) => {
    return {
        _id: sub.id,
        id: sub.id,
        clientName: sub.client_name,
        clientEmail: sub.client_email,
        clientPhone: sub.client_phone,
        selectedPhotos: sub.selected_photos,
        gallerySlug: sub.gallery_slug,
        submittedAt: sub.submitted_at
    };
};

// --- Client-Facing Routes ---

router.get("/my-gallery", checkClientAuth, async (req, res) => {
    try {
        const { slug } = req.query;
        const { clientData, supabase, drive } = req;
        console.log(`[DEBUG] /api/my-gallery requested for slug: "${slug}" with clientId: "${clientData?.clientId}"`);
        
        if (!slug) return res.status(400).json({ error: "Gallery slug is required." });

        if (!drive) {
            console.error("❌ Drive client is not initialized. Verify service credentials.");
            return res.status(500).json({ error: "Google Drive service is not configured on the server." });
        }

        // 1. Fetch client and gallery details
        const { data: clientUser, error: clientErr } = await supabase
            .from("clients")
            .select("*")
            .eq("id", clientData.clientId)
            .maybeSingle();

        if (clientErr) {
            console.error("[DEBUG] Supabase client fetch error:", clientErr);
        }

        const { data: gallery, error: galleryErr } = await supabase
            .from("galleries")
            .select("*")
            .eq("slug", slug)
            .maybeSingle();

        if (galleryErr) {
            console.error("[DEBUG] Supabase gallery fetch error:", galleryErr);
        }

        if (clientErr || galleryErr || !clientUser || !gallery) {
            console.warn(`[DEBUG] Gallery not found or access denied. clientUser found: ${!!clientUser}, gallery found: ${!!gallery}`);
            return res.status(404).json({ error: "Gallery not found or access denied." });
        }

        // 2. Verify client has access to this gallery
        const { data: cgRelation, error: relationErr } = await supabase
            .from("client_galleries")
            .select("*")
            .eq("client_id", clientUser.id)
            .eq("gallery_id", gallery.id)
            .maybeSingle();

        if (relationErr) {
            console.error("[DEBUG] Supabase relation fetch error:", relationErr);
        }

        if (relationErr || !cgRelation) {
            console.warn(`[DEBUG] Client "${clientUser.name}" does not have relation to gallery "${gallery.name}"`);
            return res.status(403).json({ error: "Access denied to this gallery." });
        }

        // 3. Query Google Drive files
        console.log(`[DEBUG] Querying Google Drive files in folder ID: "${gallery.folder_id}"`);
        const response = await drive.files.list({
            q: `'${gallery.folder_id}' in parents and mimeType contains 'image/' and trashed=false`,
            fields: "files(id, name, imageMediaMetadata)",
            pageSize: 1000,
            orderBy: "name",
        });

        console.log(`[DEBUG] Drive API response status: ${response.status}. Files returned: ${response.data?.files?.length || 0}`);

        if (!response.data.files) return res.json({ photos: [], totalPages: 0 });

        const allFiles = response.data.files;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const totalPages = Math.ceil(allFiles.length / limit);
        const paginatedFiles = allFiles.slice(startIndex, endIndex);

        const photoData = paginatedFiles.map((file) => {
            let width = 400;
            let height = 300;
            if (file.imageMediaMetadata) {
                const meta = file.imageMediaMetadata;
                const isRotated = meta.rotation === 1 || meta.rotation === 3;
                width = isRotated ? (meta.height || 400) : (meta.width || 400);
                height = isRotated ? (meta.width || 300) : (meta.height || 300);
            }
            return {
                id: file.id,
                name: file.name,
                url: `https://drive.google.com/uc?export=download&id=${file.id}`,
                width,
                height
            };
        });

        res.json({ 
            photos: photoData, 
            totalPages, 
            totalPhotos: allFiles.length,
            selectionLimit: gallery.selection_limit
        });
    } catch (error) {
        console.error("Fetch gallery error detail:", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            response: error.response ? {
                status: error.response.status,
                data: error.response.data
            } : null
        });
        res.status(500).json({ error: "Failed to fetch photos.", details: error.message });
    }
});

router.post("/submit", async (req, res) => {
    const { clientName, clientEmail, clientPhone, selectedPhotos, gallerySlug } = req.body;
    const { supabase } = req;
    try {
        // 1. Save submission
        const { error: subErr } = await supabase
            .from("submissions")
            .insert({
                client_name: clientName,
                client_email: clientEmail,
                client_phone: clientPhone,
                selected_photos: selectedPhotos,
                gallery_slug: gallerySlug,
                submitted_at: new Date().toISOString()
            });

        if (subErr) throw subErr;

        // 2. Upsert contact
        const { error: contactErr } = await supabase
            .from("contacts")
            .upsert(
                {
                    name: clientName,
                    email: clientEmail.toLowerCase(),
                    phone: clientPhone,
                    last_submitted_at: new Date().toISOString()
                },
                { onConflict: 'email' }
            );

        if (contactErr) throw contactErr;

        // 3. Fetch gallery to construct link for email
        const { data: gallery } = await supabase
            .from("galleries")
            .select("*")
            .eq("slug", gallerySlug)
            .maybeSingle();

        const folderLink = gallery ? `https://drive.google.com/drive/u/0/folders/${gallery.folder_id}` : "Not Found";

        // 4. Send EmailJS notification
        const serviceId = process.env.EMAILJS_SERVICE_ID;
        const templateId = process.env.EMAILJS_TEMPLATE_ID;
        const publicKey = process.env.EMAILJS_PUBLIC_KEY;
        const privateKey = process.env.EMAILJS_PRIVATE_KEY;

        const isEmailJSConfigured = 
            serviceId && serviceId !== "YOUR_EMAILJS_SERVICE_ID" &&
            templateId && templateId !== "YOUR_EMAILJS_TEMPLATE_ID" &&
            publicKey && publicKey !== "YOUR_EMAILJS_PUBLIC_KEY";

        if (isEmailJSConfigured) {
            try {
                const searchQuery = selectedPhotos.map(p => `"${p.name}"`).join(" OR ");
                
                // Generate a beautiful HTML table of selected photos
                let selectedPhotosHtml = `
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-family: sans-serif; border: 1px solid #dee2e6;">
                        <thead>
                            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                <th style="padding: 10px; text-align: center; font-weight: 600; color: #495057; border: 1px solid #dee2e6; width: 40px;">#</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600; color: #495057; border: 1px solid #dee2e6;">Photo Name</th>
                                <th style="padding: 10px; text-align: left; font-weight: 600; color: #495057; border: 1px solid #dee2e6;">Client Notes</th>
                                <th style="padding: 10px; text-align: center; font-weight: 600; color: #495057; border: 1px solid #dee2e6; width: 120px;">Google Drive</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                selectedPhotos.forEach((photo, idx) => {
                    const photoLink = photo.id ? `https://drive.google.com/open?id=${photo.id}` : '#';
                    const noteText = photo.note ? photo.note.trim() : '';
                    selectedPhotosHtml += `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 10px; color: #6c757d; border: 1px solid #dee2e6; text-align: center;">${idx + 1}</td>
                            <td style="padding: 10px; font-weight: 500; color: #212529; border: 1px solid #dee2e6; word-break: break-all;">${photo.name}</td>
                            <td style="padding: 10px; color: #555555; border: 1px solid #dee2e6; word-break: break-word;">${noteText ? `<em>${noteText}</em>` : '-'}</td>
                            <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">
                                ${photo.id ? `<a href="${photoLink}" target="_blank" style="color: #d4af37; text-decoration: none; font-weight: 600;">View Photo</a>` : 'N/A'}
                            </td>
                        </tr>
                    `;
                });
                
                selectedPhotosHtml += `
                        </tbody>
                    </table>
                `;

                const emailParams = {
                    service_id: serviceId,
                    template_id: templateId,
                    user_id: publicKey,
                    template_params: {
                        client_name: clientName,
                        client_email: clientEmail,
                        client_phone: clientPhone,
                        gallery_slug: gallerySlug,
                        total_selected: selectedPhotos.length,
                        folder_link: folderLink,
                        selected_photos: selectedPhotos.map(photo => `- ${photo.name}`).join("\n"),
                        selected_photos_html: selectedPhotosHtml,
                        search_query: searchQuery
                    }
                };
                
                if (privateKey && privateKey !== "YOUR_EMAILJS_PRIVATE_KEY") {
                    emailParams.accessToken = privateKey;
                }

                const emailParamsStr = JSON.stringify(emailParams);
                
                await new Promise((resolve, reject) => {
                    const reqOpt = {
                        hostname: 'api.emailjs.com',
                        port: 443,
                        path: '/api/v1.0/email/send',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(emailParamsStr)
                        }
                    };

                    const emailReq = https.request(reqOpt, (emailRes) => {
                        let data = '';
                        emailRes.on('data', (chunk) => {
                            data += chunk;
                        });
                        emailRes.on('end', () => {
                            if (emailRes.statusCode < 200 || emailRes.statusCode >= 300) {
                                console.error("EmailJS Error response status:", emailRes.statusCode, data);
                            } else {
                                console.log("✅ Selection email notification sent via EmailJS");
                            }
                            resolve();
                        });
                    });

                    emailReq.on('error', (err) => {
                        console.error("Failed to send EmailJS notification:", err);
                        reject(err);
                    });

                    emailReq.write(emailParamsStr);
                    emailReq.end();
                });
            } catch (err) {
                console.error("Failed to send EmailJS notification:", err);
            }
        } else {
            console.warn("⚠️ EmailJS configuration is missing or using placeholder values, skipping email notification.");
        }

        res.status(200).json({ message: "Selections submitted and processed successfully!" });
    } catch (error) {
        console.error("Submission Error:", error);
        res.status(500).json({ error: "Failed to process submission." });
    }
});

// --- Admin Dashboard API Routes ---

const getPaginatedList = async (req, res, tableName, searchFields) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || "";
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const supabase = req.supabase;

        let query = supabase
            .from(tableName)
            .select('*', { count: 'exact' });

        if (search && searchFields.length > 0) {
            const orConditions = searchFields.map(field => `${field}.ilike.%${search}%`).join(',');
            query = query.or(orConditions);
        }

        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        // Map Postgres schema to match MongoDB keys expected by dashboard JS
        let mappedData = [];
        if (tableName === "galleries") {
            mappedData = (data || []).map(mapGallery);
        } else if (tableName === "clients") {
            if (data && data.length > 0) {
                const clientIds = data.map(c => c.id);
                const { data: cgData, error: cgError } = await supabase
                    .from("client_galleries")
                    .select("*")
                    .in("client_id", clientIds);
                
                if (cgError) throw cgError;
                mappedData = data.map(c => mapClient(c, cgData || []));
            } else {
                mappedData = [];
            }
        } else if (tableName === "contacts") {
            mappedData = (data || []).map(mapContact);
        } else {
            mappedData = data;
        }

        res.status(200).json({ data: mappedData, total: count, page, totalPages: Math.ceil(count / limit) });
    } catch (error) {
        console.error(`Failed to fetch ${tableName}:`, error);
        res.status(500).json({ message: `Failed to fetch ${tableName}.` });
    }
};

router.get("/dashboard-stats", checkAdminAuth, async (req, res) => {
    try {
        const supabase = req.supabase;
        
        // Count galleries
        const { count: totalGalleries, error: gallErr } = await supabase
            .from("galleries")
            .select("*", { count: 'exact', head: true });

        // Count clients
        const { count: totalClients, error: cliErr } = await supabase
            .from("clients")
            .select("*", { count: 'exact', head: true });

        // Count submissions (selections)
        const { count: totalSelections, error: subErr } = await supabase
            .from("submissions")
            .select("*", { count: 'exact', head: true });

        if (gallErr || cliErr || subErr) throw (gallErr || cliErr || subErr);

        // Count unassigned galleries
        const { data: cgData, error: cgErr } = await supabase
            .from("client_galleries")
            .select("gallery_id");
            
        if (cgErr) throw cgErr;

        const assignedGalleryIds = cgData ? [...new Set(cgData.map(r => r.gallery_id))] : [];
        let unassignedGalleries = 0;
        
        if (assignedGalleryIds.length === 0) {
            unassignedGalleries = totalGalleries || 0;
        } else {
            const { count: unassignedCount, error: unassignErr } = await supabase
                .from("galleries")
                .select("*", { count: 'exact', head: true })
                .not("id", "in", `(${assignedGalleryIds.join(",")})`);
                
            if (unassignErr) throw unassignErr;
            unassignedGalleries = unassignedCount || 0;
        }

        res.status(200).json({ totalGalleries, totalClients, totalSelections, unassignedGalleries });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ message: "Failed to fetch dashboard stats." });
    }
});

// Galleries Routes
router.get("/galleries", checkAdminAuth, (req, res) => getPaginatedList(req, res, "galleries", ["name", "slug"]));

router.post("/galleries", checkAdminAuth, async (req, res) => {
    try {
        const { name, folderLink, clientId, selectionLimit } = req.body;
        const supabase = req.supabase;
        if (!name || !folderLink) return res.status(400).json({ message: "Gallery name and folder link are required." });
        
        const folderId = extractFolderIdFromUrl(folderLink);
        if (!folderId) return res.status(400).json({ message: "Invalid Google Drive folder link." });

        const slug = createSlug(name);
        const insertData = { 
            name, 
            slug, 
            folder_id: folderId, 
            created_at: new Date().toISOString() 
        };
        if (selectionLimit !== undefined && selectionLimit !== null && selectionLimit !== "") {
            insertData.selection_limit = parseInt(selectionLimit) || null;
        }

        const { data: newGallery, error } = await supabase
            .from("galleries")
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        if (clientId) {
            const { error: relationErr } = await supabase
                .from("client_galleries")
                .insert({ client_id: clientId, gallery_id: newGallery.id });
            if (relationErr) throw relationErr;
        }
        
        const createdGallery = mapGallery(newGallery);
        res.status(201).json({ message: "Gallery created successfully!", data: createdGallery });
    } catch (error) {
        console.error("Create gallery error:", error);
        res.status(500).json({ message: "Failed to create gallery." });
    }
});

router.delete("/galleries/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = req.supabase;
        const { error } = await supabase
            .from("galleries")
            .delete()
            .eq("id", id);
            
        if (error) throw error;
        // Cascade deletes in Postgres handles deleting references from client_galleries table automatically
        res.status(200).json({ message: "Gallery deleted successfully." });
    } catch (error) {
        console.error("Delete gallery error:", error);
        res.status(500).json({ message: "Failed to delete gallery." });
    }
});

// Clients Routes
router.get("/clients", checkAdminAuth, (req, res) => getPaginatedList(req, res, "clients", ["name", "username"]));

router.post("/clients", checkAdminAuth, async (req, res) => {
    try {
        const { name, username, password } = req.body;
        const supabase = req.supabase;
        if (!name || !username || !password) return res.status(400).json({ message: "All fields are required." });

        const { data: existingClient, error: checkErr } = await supabase
            .from("clients")
            .select("*")
            .eq("username", username.toLowerCase())
            .maybeSingle();

        if (checkErr) throw checkErr;
        if (existingClient) return res.status(409).json({ message: "Username already exists." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: newClients, error: insertErr } = await supabase
            .from("clients")
            .insert({
                name,
                username: username.toLowerCase(),
                password: hashedPassword,
                created_at: new Date().toISOString()
            })
            .select();

        if (insertErr) throw insertErr;
        
        const createdClient = mapClient(newClients[0]);
        res.status(201).json({ message: "Client created successfully!", data: createdClient });
    } catch (error) {
        console.error("Create client error:", error);
        res.status(500).json({ message: "Failed to create client." });
    }
});

router.put("/clients/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, password } = req.body;
        const supabase = req.supabase;
        
        let updateData = { name, username: username.toLowerCase() };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const { error } = await supabase
            .from("clients")
            .update(updateData)
            .eq("id", id);

        if (error) throw error;
        res.status(200).json({ message: "Client updated successfully." });
    } catch (error) {
        console.error("Update client error:", error);
        res.status(500).json({ message: "Failed to update client." });
    }
});

// Support both endpoint styles for assigning galleries to client
const handleAssignGalleries = async (req, res) => {
    try {
        const { id } = req.params;
        const { galleryIds } = req.body;
        const supabase = req.supabase;

        // 1. Delete all existing linkages
        const { error: deleteErr } = await supabase
            .from("client_galleries")
            .delete()
            .eq("client_id", id);

        if (deleteErr) throw deleteErr;

        // 2. Insert new linkages
        if (galleryIds && galleryIds.length > 0) {
            const insertData = galleryIds.map(gid => ({
                client_id: id,
                gallery_id: gid
            }));
            const { error: insertErr } = await supabase
                .from("client_galleries")
                .insert(insertData);
            
            if (insertErr) throw insertErr;
        }

        res.status(200).json({ message: "Client galleries updated successfully." });
    } catch (error) {
        console.error("Assign galleries error:", error);
        res.status(500).json({ message: "Failed to update client galleries." });
    }
};

router.put("/clients/:id/galleries", checkAdminAuth, handleAssignGalleries);
router.put("/clients/:id/assign", checkAdminAuth, handleAssignGalleries);

router.delete("/clients/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = req.supabase;
        const { error } = await supabase
            .from("clients")
            .delete()
            .eq("id", id);
            
        if (error) throw error;
        // Cascade delete on Postgres clears references in client_galleries automatically
        res.status(200).json({ message: "Client deleted successfully." });
    } catch (error) {
        console.error("Delete client error:", error);
        res.status(500).json({ message: "Failed to delete client." });
    }
});

router.get("/clients/:id/share-link", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { gallerySlug } = req.query;
        const supabase = req.supabase;
        const jwt = require("jsonwebtoken");
        
        if (!gallerySlug) {
            return res.status(400).json({ message: "Gallery slug is required." });
        }

        const { data: client, error } = await supabase
            .from("clients")
            .select("id, name, username")
            .eq("id", id)
            .maybeSingle();

        if (error || !client) {
            return res.status(404).json({ message: "Client not found." });
        }

        // Generate JWT token valid for 30 days
        const token = jwt.sign(
            { clientId: client.id, username: client.username },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        const referer = req.headers.referer;
        let hostOrigin = "";
        if (referer) {
            try {
                hostOrigin = new URL(referer).origin;
            } catch (e) {
                hostOrigin = `${req.protocol}://${req.get("host")}`;
            }
        } else {
            hostOrigin = `${req.protocol}://${req.get("host")}`;
        }

        const shareUrl = `${hostOrigin}/gallery/${gallerySlug}?token=${token}&name=${encodeURIComponent(client.name)}`;
        res.status(200).json({ shareUrl });
    } catch (error) {
        console.error("Generate share link error:", error);
        res.status(500).json({ message: "Failed to generate share link." });
    }
});

// Contacts & Submissions Routes
router.get("/contacts", checkAdminAuth, (req, res) => getPaginatedList(req, res, "contacts", ["name", "email", "phone"]));

router.delete("/contacts/:id", checkAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = req.supabase;
        const { error } = await supabase
            .from("contacts")
            .delete()
            .eq("id", id);
            
        if (error) throw error;
        res.status(200).json({ message: "Contact deleted successfully." });
    } catch (error) {
        console.error("Delete contact error:", error);
        res.status(500).json({ message: "Failed to delete contact." });
    }
});

router.get("/submissions/:email", checkAdminAuth, async (req, res) => {
    try {
        const { email } = req.params;
        const supabase = req.supabase;
        
        const { data: submissions, error } = await supabase
            .from("submissions")
            .select("*")
            .eq("client_email", email)
            .order("submitted_at", { ascending: false });

        if (error) throw error;
        
        const mappedSubmissions = (submissions || []).map(mapSubmission);
        res.status(200).json(mappedSubmissions);
    } catch (error) {
        console.error("Fetch submission history error:", error);
        res.status(500).json({ message: "Failed to fetch submission history." });
    }
});

module.exports = router;
const extractFolderIdFromUrl = (url) => {
    const patterns = [
        /drive\.google\.com\/drive\/folders\/([a-zA-Z0-9-_]+)/,
        /\/folders\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    // Fallback for just the ID being pasted
    if (url && url.length > 20 && !url.includes("/")) {
        return url;
    }
    return null;
}

const createSlug = (name) =>
    name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

module.exports = {
    extractFolderIdFromUrl,
    createSlug
};
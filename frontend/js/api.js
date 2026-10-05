/**
 * CampusLink — api.js
 * Central HTTP client for all backend API calls.
 *
 * Architecture principle: The frontend NEVER calls MongoDB directly.
 * All data comes from the Node.js/Express backend via these helpers.
 */

"use strict";

// ─── Configuration ────────────────────────────────────────────────────────────
// Plain constant — no Vite, no build tools required.
const API_BASE =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:5000/api"
        : "https://campus-link-x02a.onrender.com/api";
// ─── Token management ─────────────────────────────────────────────────────────
/**
 * Returns the stored JWT token, or null if not authenticated.
 * Token storage is handled by auth.js; api.js just reads it.
 */
function getToken() {
    return sessionStorage.getItem("campuslink_token");
}

async function apiBlob(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        cache: "no-store",
    });
    if (!response.ok) {
        let data = {};
        try { data = await response.json(); } catch {}
        const error = new Error(data?.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data?.error?.code || "API_ERROR";
        throw error;
    }
    return response.blob();
}

// ─── Core request helper ──────────────────────────────────────────────────────
/**
 * Makes an authenticated HTTP request to the CampusLink backend.
 *
 * @param {string} endpoint  - API path e.g. "/students/123"
 * @param {Object} [options] - fetch options (method, body, headers, etc.)
 * @returns {Promise<{success, data, message, error}>}
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    // Attach JWT if available
    const token = getToken();
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    // For multipart/form-data (file uploads), let the browser set Content-Type
    if (options.body instanceof FormData) {
        delete headers["Content-Type"];
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json();

        // Backend always responds with { success, data, message } or { success, error }
        if (!response.ok) {
            const err = new Error(
                data?.error?.message || `HTTP ${response.status} — ${response.statusText}`
            );
            err.code   = data?.error?.code   || "API_ERROR";
            err.status = response.status;
            err.conflicts = data?.error?.conflicts || [];
            throw err;
        }

        return data;
    } catch (err) {
        // Network-level failure (backend unreachable, CORS, etc.)
        if (err instanceof TypeError && err.message === "Failed to fetch") {
            throw Object.assign(new Error("Cannot reach the CampusLink server. Is it running?"), {
                code: "NETWORK_ERROR",
            });
        }
        throw err;
    }
}

// ─── Convenience methods ──────────────────────────────────────────────────────

/** GET /api{endpoint} */
async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: "GET" });
}

/** POST /api{endpoint} with JSON body */
async function apiPost(endpoint, body) {
    return apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

/** PATCH /api{endpoint} with JSON body */
async function apiPatch(endpoint, body) {
    return apiRequest(endpoint, {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

/** DELETE /api{endpoint} */
async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: "DELETE" });
}

/** POST /api{endpoint} with FormData (file upload) */
async function apiUpload(endpoint, formData) {
    return apiRequest(endpoint, {
        method: "POST",
        body: formData,
    });
}

/** Multipart upload with native upload progress events; response/error shape matches apiRequest. */
function apiUploadWithProgress(endpoint, formData, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}${endpoint}`);
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
        });
        xhr.addEventListener('load', () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
            if (xhr.status < 200 || xhr.status >= 300) {
                const error = new Error(data?.error?.message || `HTTP ${xhr.status}`);
                error.status = xhr.status;
                error.code = data?.error?.code || 'API_ERROR';
                error.conflicts = data?.error?.conflicts || [];
                reject(error);
                return;
            }
            onProgress(100);
            resolve(data);
        });
        xhr.addEventListener('error', () => reject(Object.assign(new Error('Cannot reach the CampusLink server. Is it running?'), { code: 'NETWORK_ERROR' })));
        xhr.addEventListener('abort', () => reject(Object.assign(new Error('Upload was cancelled.'), { code: 'UPLOAD_ABORTED' })));
        xhr.send(formData);
    });
}

// ─── Health check ─────────────────────────────────────────────────────────────
/** Returns true if the backend is reachable. */
async function checkHealth() {
    try {
        const res = await apiGet("/health");
        return res.success === true;
    } catch {
        return false;
    }
}

// ─── Exports (browser globals — no module bundler required) ───────────────────
// All functions are on window by default in browser scripts.
// Namespaced to avoid collisions in future.
window.CampusAPI = {
    base: API_BASE,
    request: apiRequest,
    get:     apiGet,
    post:    apiPost,
    patch:   apiPatch,
    delete:  apiDelete,
    blob:    apiBlob,
    upload:  apiUpload,
    uploadWithProgress: apiUploadWithProgress,
    health:  checkHealth,
};

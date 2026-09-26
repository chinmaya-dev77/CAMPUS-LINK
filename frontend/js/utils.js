/**
 * CampusLink — utils.js
 * Shared helper functions used across all dashboard pages.
 * Must be loaded before api.js, auth.js, and page-specific scripts.
 */

"use strict";

// ─── Toast notifications ──────────────────────────────────────────────────────

/**
 * Displays a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 * @param {number} [duration=3500] - ms before auto-dismiss
 */
function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Date/Time formatting ─────────────────────────────────────────────────────

/**
 * Formats an ISO date string to a human-readable date.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDate(dateInput) {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    if (isNaN(date)) return "—";
    return date.toLocaleDateString("en-IN", {
        day:   "2-digit",
        month: "short",
        year:  "numeric",
    });
}

/**
 * Formats an ISO date string to a date + time string.
 * @param {string|Date} dateInput
 * @returns {string}
 */
function formatDateTime(dateInput) {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    if (isNaN(date)) return "—";
    return date.toLocaleString("en-IN", {
        day:    "2-digit",
        month:  "short",
        year:   "numeric",
        hour:   "2-digit",
        minute: "2-digit",
    });
}

/**
 * Returns a relative time string (e.g. "2 days ago").
 * @param {string|Date} dateInput
 * @returns {string}
 */
function timeAgo(dateInput) {
    if (!dateInput) return "—";
    const now  = Date.now();
    const then = new Date(dateInput).getTime();
    const diff = Math.floor((now - then) / 1000); // seconds

    if (diff < 60)   return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

/**
 * Returns a CSS class for a numeric score (0–100).
 * Used for match scores and readiness scores.
 */
function scoreClass(score) {
    if (score === null || score === undefined) return "score-none";
    if (score >= 75) return "score-high";
    if (score >= 50) return "score-medium";
    return "score-low";
}

/**
 * Returns the readiness category string for a readiness score.
 * Mirrors the backend readiness thresholds exactly.
 */
function readinessCategory(score) {
    if (score >= 85) return "Highly Employable";
    if (score >= 70) return "Ready";
    if (score >= 50) return "Developing";
    return "Not Ready";
}

/**
 * Returns a CSS class for the readiness category badge.
 */
function readinessBadgeClass(score) {
    if (score >= 85) return "badge readiness-badge readiness-highly-employable";
    if (score >= 70) return "badge readiness-badge readiness-ready";
    if (score >= 50) return "badge readiness-badge readiness-developing";
    return "badge readiness-badge readiness-not-ready";
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Sets the text content of an element by ID.
 * Safe no-op if the element doesn't exist.
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "—";
}

/**
 * Shows an element (removes 'hidden' class).
 */
function show(idOrEl) {
    const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if (el) el.classList.remove("hidden");
}

/**
 * Hides an element (adds 'hidden' class).
 */
function hide(idOrEl) {
    const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if (el) el.classList.add("hidden");
}

/**
 * Sets button loading state.
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 * @param {string} [loadingText]
 */
function setButtonLoading(btn, loading, loadingText = "Loading…") {
    if (!btn) return;
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText;
        btn.disabled = true;
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
        btn.disabled = false;
    }
}

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Formats a CTC value (in LPA) for display.
 * @param {number} ctc - in LPA
 * @returns {string}
 */
function formatCTC(ctc) {
    if (ctc === null || ctc === undefined) return "—";
    return `₹${ctc.toFixed(1)} LPA`;
}

// ─── String helpers ───────────────────────────────────────────────────────────

/**
 * Capitalises the first letter of each word.
 */
function titleCase(str) {
    if (!str) return "";
    return str.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/**
 * Returns initials from a full name (up to 2 chars).
 */
function getInitials(name) {
    if (!name) return "?";
    return name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0]?.toUpperCase() || "")
        .join("");
}

function studentAvatarMarkup(name, userId, size = 'sm') {
    return `<span class="student-avatar student-avatar-${size}" data-student-avatar="${escapeHtml(userId || '')}" aria-label="${escapeHtml(name || 'Student')}">${escapeHtml(getInitials(name || 'Student'))}</span>`;
}

async function hydrateStudentAvatars(root = document) {
    if (!window.CampusAPI) return;
    const avatars = [...root.querySelectorAll('[data-student-avatar]')];
    await Promise.all(avatars.map(async (avatar) => {
        const userId = avatar.dataset.studentAvatar;
        if (!userId) return;
        try {
            const imageBlob = await CampusAPI.blob(`/students/${encodeURIComponent(userId)}/profile-picture`);
            const image = document.createElement('img');
            image.src = URL.createObjectURL(imageBlob);
            image.alt = '';
            avatar.replaceChildren(image);
        } catch { /* Keep the initials fallback when a photo is missing or not authorized. */ }
    }));
}

async function openStudentResume(userId, download = false) {
    const blob = await CampusAPI.blob(`/students/${encodeURIComponent(userId)}/resume${download ? '?download=true' : ''}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    if (download) link.download = 'resume.pdf';
    else link.target = '_blank';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Active sidebar link ──────────────────────────────────────────────────────

/**
 * Sets the active sidebar link based on the current section.
 * @param {string} section - matches data-section attribute
 */


function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function setActiveSidebarLink(section) {
    document.querySelectorAll(".sidebar-link").forEach((link) => {
        link.classList.toggle("active", link.dataset.section === section);
    });
}

function requestForm(title, fields) {
    return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "campus-form-dialog";
        const form = document.createElement("form");
        form.className = "campus-form-dialog__form";
        const heading = document.createElement("h2");
        heading.textContent = title;
        form.appendChild(heading);
        const controls = new Map();

        fields.forEach((field) => {
            const group = document.createElement("div");
            group.className = "form-group";
            const label = document.createElement("label");
            label.className = "form-label";
            label.textContent = field.label;
            const control = document.createElement(field.type === "select" ? "select" : "input");
            control.className = field.type === "select" ? "form-select" : "form-input";
            control.name = field.name;
            control.required = Boolean(field.required);
            if (field.type === "select") {
                field.options.forEach((value) => {
                    const option = document.createElement("option");
                    option.value = value;
                    option.textContent = value;
                    control.appendChild(option);
                });
            } else {
                control.type = field.type || "text";
                if (field.min != null) control.min = field.min;
                if (field.step != null) control.step = field.step;
            }
            if (field.value != null) control.value = field.value;
            label.htmlFor = `campus-form-${field.name}`;
            control.id = label.htmlFor;
            group.append(label, control);
            form.appendChild(group);
            controls.set(field.name, control);
        });

        const actions = document.createElement("div");
        actions.className = "form-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "btn btn-secondary";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => dialog.close());
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.className = "btn btn-primary";
        submit.textContent = "Save";
        actions.append(cancel, submit);
        form.appendChild(actions);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const values = Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
            dialog.close();
            resolve(values);
        });
        dialog.addEventListener("close", () => {
            dialog.remove();
            resolve(null);
        }, { once: true });
        dialog.appendChild(form);
        document.body.appendChild(dialog);
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
    });
}

// ─── Expose as global namespace ───────────────────────────────────────────────
window.CampusUtils = {
    showToast,
    formatDate,
    formatDateTime,
    timeAgo,
    scoreClass,
    readinessCategory,
    readinessBadgeClass,
    setText,
    show,
    hide,
    setButtonLoading,
    formatCTC,
    titleCase,
    getInitials,
    studentAvatarMarkup,
    hydrateStudentAvatars,
    openStudentResume,
    escapeHtml, 
    setActiveSidebarLink,
    requestForm,
};

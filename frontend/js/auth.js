/**
 * CampusLink — auth.js
 * Authentication state management.
 * Session storage scopes bearer tokens to a browser tab.
 *
 * Phase 1 will implement the full login/register flow.
 * This file provides the shared auth foundation for all pages.
 */

"use strict";

const TOKEN_KEY = "campuslink_token";
const USER_KEY  = "campuslink_user";

// ─── Token helpers ────────────────────────────────────────────────────────────

function saveToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
}

function getStoredToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

function removeToken() {
    sessionStorage.removeItem(TOKEN_KEY);
}

// ─── User helpers ─────────────────────────────────────────────────────────────

function saveUser(user) {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function getStoredUser() {
    try {
        const raw = sessionStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function removeUser() {
    sessionStorage.removeItem(USER_KEY);
}

// ─── Session state ────────────────────────────────────────────────────────────

/** Returns true if the user has a stored token (not validated server-side). */
function isLoggedIn() {
    return Boolean(getStoredToken());
}

/** Returns the stored user object, or null. */
function getCurrentUser() {
    return getStoredUser();
}

/** Returns the user's role ('student' | 'recruiter' | 'placement' | null). */
function getCurrentRole() {
    const user = getStoredUser();
    return user?.role || null;
}

// ─── Login / Logout ───────────────────────────────────────────────────────────

/**
 * Saves auth data after a successful login API response.
 * Called by the Phase 1 login handler.
 * @param {{ token: string, user: Object }} authData
 */
function handleLoginSuccess(authData) {
    saveToken(authData.token);
    saveUser(authData.user);
    window.dispatchEvent(new Event("campuslink:account-changed"));
}

/**
 * Clears session and redirects to login page.
 */
function logout() {
    removeToken();
    removeUser();
    window.dispatchEvent(new Event("campuslink:account-changed"));
    window.location.href = "/index.html";
}

// ─── Route guard ──────────────────────────────────────────────────────────────

/**
 * Checks if the current user is authenticated.
 * If not, redirects to the login page.
 * Call this at the top of each dashboard page script.
 */
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.href = "index.html";
        return false;
    }
    return true;
}

/**
 * Checks if the current user has the required role.
 * If not, redirects to their correct dashboard.
 * @param {string} requiredRole - 'student' | 'recruiter' | 'placement'
 */
function requireRole(requiredRole) {
    if (!requireAuth()) return false;

    const role = getCurrentRole();
    if (role !== requiredRole) {
        // Redirect to the correct dashboard
        const dashboards = {
            student:   "student.html",
            recruiter: "recruiter.html",
            placement: "placement.html",
        };
        const redirect = dashboards[role];
        if (redirect) {
            window.location.href = redirect;
        } else {
            logout();
        }
        return false;
    }
    return true;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Populates the sidebar user info from stored session.
 * Called by each dashboard page on load.
 */
function populateSidebarUser() {
    const user = getStoredUser();
    if (!user) return;

    const nameEl   = document.getElementById("user-name");
    const avatarEl = document.getElementById("user-avatar");

    if (nameEl)   nameEl.textContent   = user.name || "User";
    if (avatarEl) avatarEl.textContent = window.CampusUtils
        ? window.CampusUtils.getInitials(user.name)
        : (user.name?.[0]?.toUpperCase() || "U");
}

/**
 * Attaches logout handler to the logout button.
 */
function attachLogoutHandler() {
    const btn = document.getElementById("logout-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            logout();
        });
    }
}

// ─── Expose as global namespace ───────────────────────────────────────────────
window.CampusAuth = {
    saveToken,
    getStoredToken,
    saveUser,
    getCurrentUser,
    getCurrentRole,
    isLoggedIn,
    handleLoginSuccess,
    logout,
    requireAuth,
    requireRole,
    populateSidebarUser,
    attachLogoutHandler,
};

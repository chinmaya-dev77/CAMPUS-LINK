(() => {
    'use strict';

    const BASE_KEY = 'campuslink:appearance';
    const accents = ['purple', 'blue', 'cyan', 'green', 'rose', 'indigo', 'teal', 'orange', 'amber', 'magenta'];
    const themes = ['light', 'midnight', 'black'];
    const root = document.documentElement;
    let appearanceChannel = null;
    let scope = 'anonymous';
    let THEME_KEY;
    let ACCENT_KEY;

    function accountScope() {
        let user = null;
        try { user = window.CampusAuth?.getCurrentUser?.() || JSON.parse(window.sessionStorage.getItem('campuslink_user') || 'null'); } catch (_) {}
        const identity = user?.id || user?._id || user?.email;
        const role = user?.role || 'anonymous';
        return identity ? `${String(role).toLowerCase()}:${String(identity).toLowerCase()}` : 'anonymous';
    }

    function configureScope() {
        const next = accountScope();
        if (next === scope && THEME_KEY) return;
        appearanceChannel?.close?.();
        scope = next;
        const encoded = encodeURIComponent(scope);
        THEME_KEY = `${BASE_KEY}:${encoded}:theme`;
        ACCENT_KEY = `${BASE_KEY}:${encoded}:accent`;
        try {
            if (typeof window.BroadcastChannel === 'function') {
                appearanceChannel = new window.BroadcastChannel(`${BASE_KEY}:${encoded}`);
                appearanceChannel.addEventListener('message', ({ data }) => {
                    if (data?.key === 'theme') setTheme(data.value, false);
                    else if (data?.key === 'accent') setAccent(data.value, false);
                });
            }
        } catch (_) { appearanceChannel = null; }
    }

    function readPreference(key, allowed, fallback) {
        try {
            const value = window.localStorage.getItem(key);
            return allowed.includes(value) ? value : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function savePreference(key, value) {
        try { window.localStorage.setItem(key, value); } catch (_) { /* Private browsing may block storage. */ }
    }

    function setTheme(theme, persist = true) {
        const value = theme === 'dark' ? 'black' : (themes.includes(theme) ? theme : 'black');
        const dark = value !== 'light';
        root.dataset.theme = dark ? 'dark' : 'light';
        root.dataset.themeVariant = value;
        const picker = document.querySelector('[data-campuslink-theme-picker]');
        if (picker) picker.value = value;
        if (persist) {
            savePreference(THEME_KEY, value);
            appearanceChannel?.postMessage({ key: 'theme', value });
        }
    }

    function setAccent(accent, persist = true) {
        const value = accents.includes(accent) ? accent : 'purple';
        root.dataset.accent = value;
        const picker = document.querySelector('[data-campuslink-accent]');
        if (picker) picker.value = value;
        if (persist) {
            savePreference(ACCENT_KEY, value);
            appearanceChannel?.postMessage({ key: 'accent', value });
        }
    }

    function buildControls() {
        if (document.querySelector('.appearance-controls')) return;
        const controls = document.createElement('div');
        controls.className = 'appearance-controls';
        controls.setAttribute('aria-label', 'Appearance settings');
        controls.innerHTML = `
            <label class="appearance-theme-control"><span>Theme</span>
                <select data-campuslink-theme-picker aria-label="Color theme">
                    <option value="light">Light</option><option value="midnight">Midnight</option><option value="black">Deep Black</option>
                </select>
            </label>
            <label class="appearance-accent-control"><span>Accent</span>
                <select data-campuslink-accent aria-label="Accent color">
                    <option value="purple">Purple</option><option value="blue">Blue</option>
                    <option value="cyan">Cyan</option><option value="green">Green</option><option value="rose">Rose</option>
                    <option value="indigo">Indigo</option><option value="teal">Teal</option>
                    <option value="orange">Orange</option><option value="amber">Amber</option><option value="magenta">Magenta</option>
                </select>
            </label>`;

        const actions = document.querySelector('.topbar-actions');
        if (actions) actions.prepend(controls);
        else {
            const authCard = document.querySelector('.auth-page .auth-card');
            if (authCard) {
                document.body.classList.add('auth-appearance');
                authCard.prepend(controls);
            } else document.body.prepend(controls);
        }

        controls.querySelector('[data-campuslink-theme-picker]').addEventListener('change', (event) => setTheme(event.target.value));
        controls.querySelector('[data-campuslink-accent]').addEventListener('change', (event) => setAccent(event.target.value));
    }

    function buildPersonalGreeting() {
        const actions = document.querySelector('.topbar-actions');
        if (!actions || actions.querySelector('.topbar-greeting')) return;
        let user = null;
        try { user = window.CampusAuth?.getCurrentUser?.() || JSON.parse(window.sessionStorage.getItem('campuslink_user') || 'null'); } catch (_) {}
        if (!user) return;

        const name = String(user.name || user.fullName || user.email?.split('@')[0] || 'there').trim();
        const role = String(user.role || '').toLowerCase();
        const roleLabel = role === 'placement' ? 'Placement Admin' : role === 'recruiter' ? 'Recruiter' : role === 'student' ? 'Student' : 'CampusLink';
        const greeting = document.createElement('div');
        greeting.className = 'topbar-greeting';
        greeting.setAttribute('aria-label', `Hi, ${name}. ${roleLabel} portal.`);
        const greetingText = document.createElement('span');
        greetingText.textContent = 'Hi,';
        const greetingName = document.createElement('strong');
        greetingName.textContent = name;
        const greetingEmoji = document.createElement('span');
        greetingEmoji.className = 'topbar-greeting-emoji';
        greetingEmoji.setAttribute('aria-hidden', 'true');
        greetingEmoji.textContent = '👋';
        const greetingRole = document.createElement('small');
        greetingRole.textContent = roleLabel;
        greeting.append(greetingText, greetingName, greetingEmoji, greetingRole);
        actions.prepend(greeting);
    }

    function setupMobileSidebar() {
        const topbar = document.querySelector('.topbar');
        const title = topbar?.querySelector('.topbar-title');
        const sidebar = document.querySelector('.sidebar');
        if (!topbar || !title || !sidebar || topbar.querySelector('.sidebar-menu-toggle')) return;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sidebar-menu-toggle';
        toggle.setAttribute('aria-label', 'Open navigation menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', sidebar.id || 'sidebar');
        toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
        topbar.insertBefore(toggle, title);

        const close = () => {
            document.body.classList.remove('sidebar-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open navigation menu');
        };
        const links = [...sidebar.querySelectorAll('.sidebar-link')];
        links.forEach((link) => {
            if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
            link.addEventListener('click', () => {
                links.forEach((item) => item.removeAttribute('aria-current'));
                if (link.dataset.section !== 'assistant') link.setAttribute('aria-current', 'page');
            });
        });
        toggle.addEventListener('click', () => {
            const open = document.body.classList.toggle('sidebar-open');
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        });
        document.addEventListener('click', (event) => {
            if (document.body.classList.contains('sidebar-open')
                && !sidebar.contains(event.target) && !toggle.contains(event.target)) close();
        });
        links.forEach((link) => link.addEventListener('click', close));
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    }

    function setupDashboardActions() {
        document.querySelectorAll('[data-dashboard-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.getAttribute('data-dashboard-action');
                [...document.querySelectorAll('.sidebar-link[data-section]')]
                    .find((link) => link.dataset.section === target)?.click();
            });
        });
    }

    root.dataset.theme = 'dark';
    root.dataset.themeVariant = 'black';
    root.dataset.accent = 'purple';

    const initialize = () => {
        configureScope();
        buildControls();
        buildPersonalGreeting();
        // Re-read preferences in case another workspace tab changed them while
        // this page was still loading.
        setTheme(readPreference(THEME_KEY, [...themes, 'dark'], 'black'), false);
        setAccent(readPreference(ACCENT_KEY, accents, 'purple'), false);
        setupMobileSidebar();
        setupDashboardActions();
    };
    // Preferences are keyed to the authenticated account, so portal choices do not leak between accounts.
    window.addEventListener('storage', (event) => {
        if (!THEME_KEY) configureScope();
        if (event.key === THEME_KEY) setTheme(event.newValue, false);
        else if (event.key === ACCENT_KEY) setAccent(event.newValue, false);
    });
    window.addEventListener('campuslink:account-changed', () => {
        configureScope();
        setTheme(readPreference(THEME_KEY, [...themes, 'dark'], 'black'), false);
        setAccent(readPreference(ACCENT_KEY, accents, 'purple'), false);
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})();

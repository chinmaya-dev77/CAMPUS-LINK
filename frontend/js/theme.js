(() => {
    'use strict';

    const BASE_KEY = 'campuslink:appearance';
    const accents = ['purple', 'blue', 'cyan', 'green', 'rose', 'indigo', 'teal', 'orange', 'amber', 'magenta'];
    const themes = ['light', 'midnight', 'black'];
    const accentColors = {
        purple: '#694bd1', blue: '#376dd2', cyan: '#087f91', green: '#26835b', rose: '#b84668',
        indigo: '#4f46e5', teal: '#0f8a83', orange: '#c25a12', amber: '#a16207', magenta: '#b83280'
    };
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
        updateLoginAppearanceControls();
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
        updateLoginAppearanceControls();
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
        const authCard = document.querySelector('.auth-page .auth-card');
        if (authCard) {
            controls.classList.add('auth-login-appearance');
            const quickAccents = ['blue', 'green', 'rose'];
            const additionalAccents = accents.filter((accent) => !quickAccents.includes(accent));
            const swatch = (accent) => `<button type="button" class="auth-accent-swatch" data-campuslink-accent-choice="${accent}" style="--swatch:${accentColors[accent]}" aria-label="${accent} accent" title="${accent}" aria-pressed="false"></button>`;
            controls.innerHTML = `
                <div class="auth-accent-picker" role="group" aria-label="Accent color">
                    ${quickAccents.map(swatch).join('')}
                    <div class="auth-more-accents">
                        <button type="button" class="auth-more-accents-toggle" aria-label="More accent colors" aria-haspopup="true" aria-expanded="false" title="More accent colors">+</button>
                        <div class="auth-more-accents-menu" role="group" aria-label="More accent colors" hidden>${additionalAccents.map(swatch).join('')}</div>
                    </div>
                </div>
                <button type="button" class="auth-theme-toggle" data-campuslink-theme-toggle aria-label="Switch theme" title="Switch theme">
                    <svg class="auth-theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.5A9 9 0 0 1 10.5 3a9 9 0 1 0 10 10.5Z"/></svg>
                    <svg class="auth-theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
                </button>`;
        } else controls.innerHTML = `
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
            if (authCard) {
                document.body.classList.add('auth-appearance');
                authCard.prepend(controls);
            } else document.body.prepend(controls);
        }

        if (authCard) {
            controls.querySelectorAll('[data-campuslink-accent-choice]').forEach((button) => {
                button.addEventListener('click', () => {
                    setAccent(button.dataset.campuslinkAccentChoice);
                    controls.querySelector('.auth-more-accents-menu').hidden = true;
                    controls.querySelector('.auth-more-accents-toggle').setAttribute('aria-expanded', 'false');
                });
            });
            controls.querySelector('[data-campuslink-theme-toggle]').addEventListener('click', () => {
                const currentIndex = themes.indexOf(root.dataset.themeVariant);
                setTheme(themes[(currentIndex + 1 + themes.length) % themes.length]);
            });
            const moreToggle = controls.querySelector('.auth-more-accents-toggle');
            const moreMenu = controls.querySelector('.auth-more-accents-menu');
            moreToggle.addEventListener('click', () => {
                moreMenu.hidden = !moreMenu.hidden;
                moreToggle.setAttribute('aria-expanded', String(!moreMenu.hidden));
            });
            document.addEventListener('click', (event) => {
                if (!controls.contains(event.target)) {
                    moreMenu.hidden = true;
                    moreToggle.setAttribute('aria-expanded', 'false');
                }
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !moreMenu.hidden) {
                    moreMenu.hidden = true;
                    moreToggle.setAttribute('aria-expanded', 'false');
                    moreToggle.focus();
                }
            });
        } else {
            controls.querySelector('[data-campuslink-theme-picker]').addEventListener('change', (event) => setTheme(event.target.value));
            controls.querySelector('[data-campuslink-accent]').addEventListener('change', (event) => setAccent(event.target.value));
        }
        updateLoginAppearanceControls();
    }

    function updateLoginAppearanceControls() {
        const controls = document.querySelector('.auth-login-appearance');
        if (!controls) return;
        const accent = root.dataset.accent;
        controls.querySelectorAll('[data-campuslink-accent-choice]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.campuslinkAccentChoice === accent));
        });
        const dark = root.dataset.theme !== 'light';
        const toggle = controls.querySelector('[data-campuslink-theme-toggle]');
        const nextTheme = themes[(themes.indexOf(root.dataset.themeVariant) + 1 + themes.length) % themes.length];
        toggle.setAttribute('aria-label', `Switch to ${nextTheme === 'black' ? 'Deep Black' : nextTheme} mode`);
        toggle.setAttribute('title', `Switch to ${nextTheme === 'black' ? 'Deep Black' : nextTheme} mode`);
        toggle.setAttribute('aria-pressed', String(dark));
        controls.classList.toggle('is-dark', dark);
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

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'sidebar-drawer-close';
        closeButton.setAttribute('aria-label', 'Close navigation menu');
        closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg><span>Close menu</span>';
        sidebar.insertBefore(closeButton, sidebar.firstChild);

        const mobile = window.matchMedia('(max-width: 860px)');
        const setOpen = (open, returnFocus = false) => {
            document.body.classList.toggle('sidebar-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
            if (mobile.matches) {
                sidebar.inert = !open;
                sidebar.setAttribute('aria-hidden', String(!open));
            }
            if (open) closeButton.focus();
            else if (returnFocus) toggle.focus();
        };
        const syncViewport = () => {
            if (!mobile.matches) {
                document.body.classList.remove('sidebar-open');
                sidebar.inert = false;
                sidebar.removeAttribute('aria-hidden');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Open navigation menu');
                return;
            }
            if (!document.body.classList.contains('sidebar-open')) {
                sidebar.inert = true;
                sidebar.setAttribute('aria-hidden', 'true');
            }
        };
        const links = [...sidebar.querySelectorAll('.sidebar-link')];
        links.forEach((link) => {
            if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
            link.addEventListener('click', () => {
                links.forEach((item) => item.removeAttribute('aria-current'));
                if (link.dataset.section !== 'assistant') link.setAttribute('aria-current', 'page');
            });
        });
        toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('sidebar-open')));
        closeButton.addEventListener('click', () => setOpen(false, true));
        document.addEventListener('click', (event) => {
            if (document.body.classList.contains('sidebar-open')
                && !sidebar.contains(event.target) && !toggle.contains(event.target)) setOpen(false, true);
        });
        links.forEach((link) => link.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', (event) => {
            if (!document.body.classList.contains('sidebar-open')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false, true);
            } else if (event.key === 'Tab') {
                const focusable = [closeButton, ...sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
                    .filter((element, index, all) => all.indexOf(element) === index && !element.hidden);
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
                    event.preventDefault(); last?.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
                    event.preventDefault(); first?.focus();
                }
            }
        });
        mobile.addEventListener?.('change', syncViewport);
        syncViewport();
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

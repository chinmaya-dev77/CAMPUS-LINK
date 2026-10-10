/* Add responsive labels to portal tables so narrow screens can use stacked rows. */
(() => {
    "use strict";

    const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

    function labelTable(table, tableIndex) {
        const headers = [...table.querySelectorAll("thead tr:last-child th")];
        if (!headers.length) return;

        headers.forEach((header, index) => {
            if (!header.id) header.id = `mobile-table-${tableIndex}-column-${index + 1}`;
        });

        table.querySelectorAll("tbody tr").forEach((row) => {
            const cells = [...row.children].filter((cell) => cell.matches("td, th"));
            if (cells.length === 1 && cells[0].hasAttribute("colspan")) return;

            cells.forEach((cell, index) => {
                const header = headers[index];
                const label = normalize(header?.textContent) || `Details ${index + 1}`;
                cell.dataset.label = label;
                if (header?.id && !cell.hasAttribute("headers")) cell.setAttribute("headers", header.id);
            });
        });
    }

    function prepare() {
        const tables = [...document.querySelectorAll(".table-container table, .table-responsive table, .table-wrapper table")];
        tables.forEach((table, index) => {
            labelTable(table, index + 1);
            const body = table.tBodies[0];
            if (!body || body.dataset.mobileLabelsReady) return;
            body.dataset.mobileLabelsReady = "true";
            new MutationObserver(() => labelTable(table, index + 1)).observe(body, {
                childList: true,
                subtree: true
            });
        });

        const mobile = window.matchMedia("(max-width: 700px)");
        const syncTableAccess = () => {
            if (!mobile.matches) return;
            document.querySelectorAll(".table-container, .table-responsive, .table-wrapper").forEach((container) => {
                container.tabIndex = -1;
                container.classList.remove("has-horizontal-overflow");
                const hint = container.parentElement?.querySelector(":scope > .table-scroll-hint");
                if (hint) hint.classList.remove("is-visible");
                if (container.getAttribute("aria-label")?.toLowerCase().includes("scroll horizontally")) {
                    container.removeAttribute("aria-label");
                }
            });
        };
        syncTableAccess();
        mobile.addEventListener?.("change", syncTableAccess);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", prepare, { once: true });
    } else {
        prepare();
    }
})();

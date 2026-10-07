/* Shared, data-driven affordances for long workspace lists. */
(() => {
    "use strict";

    function getList(toolbar) {
        let node = toolbar.nextElementSibling;
        while (node) {
            if (node.matches(".table-container, .pipeline-board, .candidate-list, .job-list")) return node;
            if (node.matches(".workspace-toolbar")) break;
            node = node.nextElementSibling;
        }
        return toolbar.parentElement?.querySelector(".table-container") || null;
    }

    function setupToolbar(toolbar) {
        if (toolbar.dataset.workspaceUxReady) return;
        toolbar.dataset.workspaceUxReady = "true";
        const list = getList(toolbar);
        const count = toolbar.querySelector(".workspace-result-count") || document.createElement("span");
        count.className = "workspace-result-count";
        count.setAttribute("aria-live", "polite");
        if (!count.isConnected) toolbar.append(count);

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "btn btn-secondary btn-sm workspace-clear-filters";
        clear.textContent = "Clear filters";
        clear.hidden = true;
        clear.setAttribute("aria-label", "Clear search and filters");
        toolbar.append(clear);

        const controls = () => [...toolbar.querySelectorAll('input[type="search"], select')];
        const isFiltered = () => controls().some((control) => {
            if (control.tagName === "INPUT") return Boolean(control.value.trim());
            return !/sort/i.test(control.id) && control.selectedIndex > 0 && Boolean(control.value);
        });
        const updateCount = () => {
            if (list) {
                const body = list.querySelector("tbody");
                const rows = body ? [...body.querySelectorAll("tr")] : [];
                const loading = list.textContent?.match(/loading[^\n]*/i)?.[0];
                if (loading && rows.some((row) => /loading/i.test(row.textContent))) count.textContent = loading.trim();
                else if (body) {
                    const visibleRows = rows.filter((row) => !row.querySelector(".empty-state") && !row.querySelector("td[colspan]"));
                    count.textContent = `${visibleRows.length} ${visibleRows.length === 1 ? "result" : "results"}`;
                } else {
                    const cards = list.querySelectorAll(".recruiter-dashboard-match-row, .pipeline-card, .candidate-card").length;
                    count.textContent = `${cards} ${cards === 1 ? "result" : "results"}`;
                }
            }
            clear.hidden = !isFiltered();
        };

        clear.addEventListener("click", () => {
            controls().forEach((control) => {
                if (control.tagName === "INPUT") control.value = "";
                else if (!/sort/i.test(control.id)) control.selectedIndex = 0;
                control.dispatchEvent(new Event(control.tagName === "INPUT" ? "input" : "change", { bubbles: true }));
            });
            requestAnimationFrame(updateCount);
        });
        toolbar.addEventListener("input", updateCount);
        toolbar.addEventListener("change", updateCount);
        if (list) new MutationObserver(updateCount).observe(list, { childList: true, subtree: true, characterData: true });
        updateCount();
    }

    function prepareTables() {
        document.querySelectorAll(".workspace-toolbar").forEach(setupToolbar);
        document.querySelectorAll(".table-container").forEach((container) => {
            const table = container.querySelector("table");
            if (!table) return;
            const hint = document.createElement("p");
            hint.className = "table-scroll-hint";
            hint.setAttribute("aria-hidden", "true");
            hint.textContent = "Scroll sideways to see more columns →";
            container.parentElement?.insertBefore(hint, container);
            const updateScrollAccess = () => {
                const overflows = container.scrollWidth > container.clientWidth + 2;
                container.tabIndex = overflows ? 0 : -1;
                container.classList.toggle("has-horizontal-overflow", overflows);
                hint.classList.toggle("is-visible", overflows);
                if (overflows && !container.hasAttribute("aria-label")) {
                    const heading = container.closest("section, .placement-view, .content-section")?.querySelector("h2, h3");
                    container.setAttribute("aria-label", `${heading?.textContent?.trim() || "Data"} table. Scroll horizontally to see all columns.`);
                }
            };
            updateScrollAccess();
            if ("ResizeObserver" in window) new ResizeObserver(updateScrollAccess).observe(container);
            else window.addEventListener("resize", updateScrollAccess, { passive: true });
            new MutationObserver(updateScrollAccess).observe(table, { childList: true, subtree: true });
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", prepareTables, { once: true });
    else prepareTables();
})();

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const section = document.getElementById("placement-analytics");
    if (!section) return;
    const escape = CampusUtils.escapeHtml;
    const money = (value) => value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const card = (label, value, note = "") => `<article class="stat-card"><div class="stat-label">${escape(label)}</div><div class="stat-value">${escape(String(value))}</div>${note ? `<div class="stat-sub">${escape(note)}</div>` : ""}</article>`;
    const fillCards = (id, items) => { document.getElementById(id).innerHTML = items.map((item) => card(...item)).join(""); };
    const fillBars = (id, rows) => {
        const target = document.getElementById(id);
        if (!rows.length) { target.innerHTML = '<p class="analytics-empty">No structured skill data yet.</p>'; return; }
        const max = Math.max(...rows.map((row) => row.count), 1);
        target.innerHTML = rows.map((row) => `<div class="analytics-bar-row"><span>${escape(row.name)}</span><div class="analytics-bar-track"><i style="width:${Math.max(4, row.count / max * 100)}%"></i></div><b>${row.count}</b></div>`).join("");
    };
    async function loadAnalytics() {
        const message = document.getElementById("analytics-message");
        message.textContent = "Loading analytics…";
        try {
            const { data } = await CampusAPI.get("/analytics/placement");
            const p = data.placement, r = data.recruiters, s = data.skills, c = data.compensation, d = data.drives;
            fillCards("placement-kpis", [["Total Students", p.totalStudents], ["Eligible Students", p.eligibleStudents], ["Applications", p.applications], ["Shortlisted", p.shortlisted], ["Selected", p.selected], ["Placed", p.placed], ["Placement Rate", `${p.placementRate.toFixed(1)}%`, `of ${p.placementRateDenominator}`]]);
            fillCards("recruiter-kpis", [["Active Recruiters", r.activeRecruiters], ["Open Jobs", r.openJobs], ["Candidates Shortlisted", r.candidatesShortlisted], ["Selection Rate", `${r.selectionRate.toFixed(1)}%`], ["Offers", r.offers]]);
            fillCards("compensation-kpis", [["Average CTC", money(c.averageCtc)], ["Median CTC", money(c.medianCtc)], ["Highest CTC", money(c.highestCtc)]]);
            fillCards("drive-kpis", [["Active", d.active], ["Upcoming", d.upcoming], ["Completed", d.completed], ["Conflicts", d.conflicts]]);
            fillBars("demand-chart", s.mostDemanded);
            fillBars("gap-chart", s.gaps);
            const branchSkills = new Map(s.branchSkills.map((item) => [item.branch, item.skills]));
            document.getElementById("branch-table").innerHTML = s.branchDistribution.length ? s.branchDistribution.map((row) => `<tr><td>${escape(row.name)}</td><td>${row.count}</td><td>${escape((branchSkills.get(row.name) || []).join(", ") || "—")}</td></tr>`).join("") : '<tr><td colspan="3">No student branch data yet.</td></tr>';
            document.getElementById("role-ctc-table").innerHTML = c.roleWise.length ? c.roleWise.map((row) => `<tr><td>${escape(row.role)}</td><td>${money(row.averageCtc)}</td><td>${row.offers}</td></tr>`).join("") : '<tr><td colspan="3">No valid offer compensation data yet.</td></tr>';
            message.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}.`;
        } catch (error) { message.textContent = error.message || "Could not load analytics."; }
    }
    document.querySelectorAll('.sidebar-link').forEach((link) => link.addEventListener('click', () => {
        const showDashboard = link.dataset.section !== "offers";
        section.style.display = showDashboard ? "block" : "none";
        if (showDashboard && link.dataset.section === "dashboard") loadAnalytics();
    }));
    document.getElementById("refresh-analytics")?.addEventListener("click", loadAnalytics);
    loadAnalytics();
});

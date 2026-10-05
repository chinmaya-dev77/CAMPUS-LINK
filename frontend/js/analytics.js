"use strict";

document.addEventListener("DOMContentLoaded", () => {
    if (!document.getElementById("placement-kpis")) return;
    const escape = CampusUtils.escapeHtml;
    const money = (value) => value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const card = (label, value, note = "", tone = "") => `<article class="stat-card ${tone ? `analytics-tone-${tone}` : ""}"><div class="stat-label">${escape(label)}</div><div class="stat-value">${escape(String(value ?? "—"))}</div>${note ? `<div class="stat-sub">${escape(note)}</div>` : ""}</article>`;
    const fillCards = (id, items) => { const target = document.getElementById(id); if (target) target.innerHTML = items.map((item) => card(...item)).join(""); };
    const fillBars = (id, rows) => {
        const target = document.getElementById(id);
        if (!target) return;
        if (!rows?.length) { target.innerHTML = '<p class="analytics-empty">No structured data available yet.</p>'; return; }
        const max = Math.max(...rows.map((row) => row.count || 0), 1);
        target.innerHTML = rows.map((row) => `<div class="analytics-bar-row"><span>${escape(row.name)}</span><div class="analytics-bar-track"><i style="width:${Math.max(4, (row.count || 0) / max * 100)}%"></i></div><b>${Number(row.count) || 0}</b></div>`).join("");
    };
    const renderPlacementFunnel = (placement) => {
        const target = document.getElementById("placement-hiring-funnel");
        if (!target) return;
        const stages = [
            ["Applications", Number(placement.applications) || 0, "application"],
            ["Shortlisted", Number(placement.shortlisted) || 0, "shortlisted"],
            ["Selected", Number(placement.selected) || 0, "selected"],
            ["Placed", Number(placement.placed) || 0, "placed"]
        ];
        const max = Math.max(stages[0][1], 1);
        target.innerHTML = stages.map(([label, count, tone]) => `<article class="placement-funnel-stage is-${tone}"><div class="placement-funnel-stage-copy"><span>${escape(label)}</span><strong>${count}</strong></div><div class="placement-funnel-track" aria-label="${escape(label)}: ${count}"><i style="width:${Math.max(count ? 5 : 0, count / max * 100)}%"></i></div></article>`).join("");
    };
    const renderRecentlyPlaced = (students) => {
        const target = document.getElementById("placement-latest-list");
        if (!target) return;
        const rows = (students || []).slice(0, 6);
        target.innerHTML = rows.length ? rows.map((student) => {
            const initials = String(student.name || "S").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            const detail = [student.companyName, student.role, student.branch].filter(Boolean).join(" · ");
            const ctc = student.ctc == null ? "Placed" : money(student.ctc);
            return `<article class="placement-latest-student"><span class="placement-latest-avatar" aria-hidden="true">${escape(initials || "S")}</span><span class="placement-latest-copy"><strong>${escape(student.name || "Student")}</strong><small>${escape(detail || "Joining confirmed")}</small></span><span class="placement-latest-ctc">${escape(ctc)}</span></article>`;
        }).join("") : '<p class="analytics-empty">No students have completed joining yet.</p>';
    };
    let pending;
    let riskPending;
    async function loadRisk() {
        if (riskPending) return riskPending;
        const message = document.getElementById('risk-message');
        const body = document.getElementById('risk-students-list');
        if (!body) return;
        if (message) message.textContent = 'Loading risk signals…';
        riskPending = (async () => {
            try {
                const { data } = await CampusAPI.get('/analytics/risk');
                window.CampusRiskData = data;
                const counts = data.counts || {};
                fillCards('risk-kpis', [['High risk', counts.high || 0, '', 'high'], ['Medium risk', counts.medium || 0, '', 'medium'], ['Low risk', counts.low || 0, '', 'low'], ['Insufficient data', counts.insufficientData || 0, '', 'neutral']]);
                const rows = data.students || [];
                body.innerHTML = rows.length ? rows.map((student) => {
                    const factors = (student.factors || []).map((factor) => `<span class="risk-factor-chip">${escape(factor.name)} <strong>${escape(factor.value)}</strong></span>`).join('');
                    const riskLevel = student.riskLevel || 'Insufficient data';
                    const riskClass = student.riskLevel ? `risk-${escape(student.riskLevel.toLowerCase())}` : 'status-neutral';
                    const score = Number.isFinite(student.riskScore) ? ` · ${student.riskScore}/100` : '';
                    return `<tr><td><button type="button" class="btn btn-secondary btn-sm" data-student-detail="${escape(student.studentId)}">${escape(student.name || 'Student')}</button></td><td><span class="status-badge ${riskClass}">${escape(riskLevel)}${score}</span></td><td><div class="risk-factor-list">${factors || '<span class="text-muted">No contributing factors available</span>'}</div></td></tr>`;
                }).join('') : '<tr><td colspan="3">No student risk signals are available.</td></tr>';
                if (message) message.textContent = `${data.disclaimer || 'Prototype predictive signal based on available placement data.'} Updated ${new Date(data.generatedAt).toLocaleString()}.`;
            } catch (error) {
                body.innerHTML = `<tr><td colspan="3">${escape(error.message || 'Could not load risk signals.')}</td></tr>`;
                if (message) message.textContent = 'Risk prediction is unavailable until the Python ML service responds.';
            }
        })().finally(() => { riskPending = null; });
        return riskPending;
    }
    async function loadAnalytics() {
        if (pending) return pending;
        const message = document.getElementById("analytics-message");
        if (message) message.textContent = "Loading analytics…";
        pending = (async () => {
            try {
                const { data } = await CampusAPI.get("/analytics/placement");
                const p = data.placement, r = data.recruiters, s = data.skills, c = data.compensation, d = data.drives;
                renderPlacementFunnel(p);
                renderRecentlyPlaced(p.recentlyPlaced);
                fillCards("placement-kpis", [["Total students", p.totalStudents, '', 'blue'], ["Eligible students", p.eligibleStudents, '', 'cyan'], ["Applications", p.applications, '', 'blue'], ["Shortlisted", p.shortlisted, '', 'purple'], ["Selected", p.selected, '', 'green'], ["Placed", p.placed, '', 'green'], ["Placement rate", `${Number(p.placementRate || 0).toFixed(1)}%`, `of ${p.placementRateDenominator}`, 'purple']]);
                fillCards("recruiter-kpis", [["Active recruiters", r.activeRecruiters, '', 'blue'], ["Open jobs", r.openJobs, '', 'cyan'], ["Candidates shortlisted", r.candidatesShortlisted, '', 'purple'], ["Selection rate", `${Number(r.selectionRate || 0).toFixed(1)}%`, '', 'green'], ["Offers", r.offers, '', 'green']]);
                fillCards("compensation-kpis", [["Average CTC", money(c.averageCtc), '', 'blue'], ["Median CTC", money(c.medianCtc), '', 'cyan'], ["Highest CTC", money(c.highestCtc), '', 'green']]);
                fillCards("drive-kpis", [["Active", d.active, '', 'green'], ["Upcoming", d.upcoming, '', 'blue'], ["Completed", d.completed, '', 'purple'], ["Conflicts", d.conflicts, '', 'high']]);
                fillBars("demand-chart", s.mostDemanded);
                fillBars("gap-chart", s.gaps);
                const branchSkills = new Map((s.branchSkills || []).map((item) => [item.branch, item.skills]));
                const branchTable = document.getElementById("branch-table");
                if (branchTable) branchTable.innerHTML = s.branchDistribution?.length ? s.branchDistribution.map((row) => { const skills = branchSkills.get(row.name) || []; return `<tr><td>${escape(row.name)}</td><td><span class="analytics-count-pill">${Number(row.count) || 0}</span></td><td title="${escape(skills.join(", "))}">${skills.length ? `<span class="analytics-skill-count">${skills.length} skills</span>` : '—'}</td></tr>`; }).join("") : '<tr><td colspan="3">No student branch data yet.</td></tr>';
                const roles = document.getElementById("role-ctc-table");
                if (roles) roles.innerHTML = c.roleWise?.length ? c.roleWise.map((row) => `<tr><td>${escape(row.role)}</td><td>${money(row.averageCtc)}</td><td>${Number(row.offers) || 0}</td></tr>`).join("") : '<tr><td colspan="3">No compensation data yet.</td></tr>';
                if (message) message.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()}.`;
            } catch (error) { if (message) message.textContent = error.message || "Could not load analytics."; }
        })().finally(() => { pending = null; });
        return pending;
    }
    document.getElementById("refresh-analytics")?.addEventListener("click", loadAnalytics);
    document.getElementById("refresh-risk")?.addEventListener("click", loadRisk);
    window.CampusAnalytics = { load: loadAnalytics };
    loadAnalytics();
    loadRisk();
});

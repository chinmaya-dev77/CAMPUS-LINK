"use strict";

document.addEventListener("DOMContentLoaded", () => {
    if (!CampusAuth.requireRole("placement")) return;
    CampusAuth.populateSidebarUser();
    CampusAuth.attachLogoutHandler();

    const state = {
        students: [], recruiters: [], jobs: [], drives: [], applications: [], offers: [],
        applicationCtc: new Map(), driveConflicts: new Map(), loading: new Set()
    };
    const esc = CampusUtils.escapeHtml;
    const refId = (ref) => String(ref?._id || ref?.id || ref || "");
    const text = (value, fallback = "—") => value == null || value === "" ? fallback : String(value);
    const badge = (value) => `<span class="status-badge ${CampusUtils.statusBadgeClass(value)}">${esc(text(value))}</span>`;
    const setBody = (id, html) => { const target = document.getElementById(id); if (target) target.innerHTML = html; };
    const showError = (id, colspan, error) => setBody(id, `<tr><td colspan="${colspan}"><div class="empty-state workspace-error-state"><h3>Could not load records</h3><p>${esc(error?.message || "Please try again.")}</p><button type="button" class="btn btn-primary btn-sm" data-placement-retry="${esc(id)}">Retry</button></div></td></tr>`);

    function showView(view) {
        const target = document.querySelector(`[data-view="${view}"]`);
        if (!target) return;
        document.querySelectorAll(".placement-view").forEach((section) => section.classList.toggle("hidden", section !== target));
        CampusUtils.setActiveSidebarLink(view);
        document.getElementById("page-title").textContent = ({ dashboard: "Dashboard", students: "Students", recruiters: "Recruiters", jobs: "Jobs", drives: "Drives", applications: "Applications", offers: "Offers", analytics: "Analytics" })[view] || "Placement";
        const loaders = { students: loadStudents, recruiters: loadRecruiters, jobs: loadJobs, drives: loadDrives, applications: loadApplications, offers: loadOfferManagement };
        if (loaders[view]) loaders[view]();
        if (["dashboard", "analytics"].includes(view)) window.CampusAnalytics?.load();
    }

    document.getElementById("placement-latest-all")?.addEventListener("click", () => showView("students"));

    document.querySelectorAll(".sidebar-link[data-section]").forEach((link) => link.addEventListener("click", (event) => {
        event.preventDefault();
        if (link.dataset.section === "assistant") {
            document.querySelector(".assistant-launcher")?.click();
            return;
        }
        showView(link.dataset.section);
    }));

    function placementStatus(student) {
        if ((student.offerStatuses || {})["Joining Confirmed"]) return "Placed";
        const apps = student.applicationStatuses || {};
        const offers = student.offerStatuses || {};
        if (["Selected", "Offer Generated", "Offer Sent", "Pending", "Accepted", "Documentation Pending", "Documents Verified"].some((status) => offers[status])) return "Offer in progress";
        if (["Selected", "Shortlisted", "Interview", "Offer"].some((status) => apps[status])) return "In process";
        if (["Applied", "Eligible", "Ineligible"].some((status) => apps[status])) return "Applications active";
        return student.applicationCount || student.offerCount ? "Closed" : "No activity";
    }

    function renderStudents() {
        const query = document.getElementById("students-search").value.trim().toLowerCase();
        const branch = document.getElementById("students-branch-filter").value;
        const status = document.getElementById("students-status-filter").value;
        const sort = document.getElementById("students-sort").value;
        const rows = state.students.filter((student) => {
            const placement = placementStatus(student);
            return (!query || `${student.name} ${student.branch || ""}`.toLowerCase().includes(query)) && (!branch || student.branch === branch) && (!status || placement === status);
        });
        const sorters = {
            name: (a, b) => a.name.localeCompare(b.name),
            "readiness-desc": (a, b) => (b.readiness?.score ?? -1) - (a.readiness?.score ?? -1),
            "applications-desc": (a, b) => b.applicationCount - a.applicationCount,
            "cgpa-desc": (a, b) => (b.cgpa ?? -1) - (a.cgpa ?? -1)
        };
        rows.sort(sorters[sort] || sorters.name);
        if (!rows.length) {
            const emptyState = state.students.length
                ? '<h3>No students match these filters</h3><p>Try a different search or clear the selected filters.</p><button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="students">Clear filters</button>'
                : '<h3>No student profiles found</h3><p>Student profiles will appear here as candidates register.</p><button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="jobs">Review open jobs</button>';
            return setBody("placement-students-list", `<tr><td colspan="8"><div class="empty-state">${emptyState}</div></td></tr>`);
        }
        setBody("placement-students-list", rows.map((student) => {
            const readiness = student.readiness;
            const readinessLabel = readiness?.category ? `${readiness.category}${readiness.score == null ? "" : ` · ${readiness.score}`}` : "Not assessed";
            return `<tr><td>${CampusUtils.studentAvatarMarkup(student.name, student.userId)}<strong>${esc(student.name)}</strong></td><td>${esc(text(student.branch))}</td><td>${esc(text(student.cgpa))}</td><td>${readiness?.score == null ? "—" : `<span class="score-badge ${CampusUtils.scoreClass(readiness.score)}">${esc(readinessLabel)}</span>`}</td><td>${student.applicationCount}</td><td>${student.offerCount}</td><td>${badge(placementStatus(student))}</td><td><button class="btn btn-secondary btn-sm" data-student-detail="${esc(student.userId)}">View profile</button>${student.hasProfilePicture ? "" : ""}</td></tr>`;
        }).join("") );
        CampusUtils.hydrateStudentAvatars(document.getElementById("placement-students-list"));
    }

    async function loadStudents() {
        const body = document.getElementById("placement-students-list");
        if (!body || state.loading.has("students")) return;
        state.loading.add("students");
        body.innerHTML = '<tr><td colspan="8" class="text-center">Loading students…</td></tr>';
        try {
            const response = await CampusAPI.get("/students");
            state.students = response.data || [];
            const branches = [...new Set(state.students.map((item) => item.branch).filter(Boolean))].sort();
            const select = document.getElementById("students-branch-filter");
            const selected = select.value;
            select.innerHTML = '<option value="">All branches</option>' + branches.map((branch) => `<option value="${esc(branch)}">${esc(branch)}</option>`).join("");
            if (branches.includes(selected)) select.value = selected;
            renderStudents();
        } catch (error) { showError("placement-students-list", 8, error); }
        finally { state.loading.delete("students"); }
    }

    function recruiterDetails(recruiter) {
        openDetails("Company", recruiter.companyName, [
            ["Recruiter", recruiter.recruiterName], ["Email", recruiter.email], ["Industry", recruiter.industry], ["Website", recruiter.website],
            ["Active jobs", recruiter.activeJobs], ["Total jobs", recruiter.jobCount], ["Drives", recruiter.driveCount], ["Applications", recruiter.applicationCount], ["Offers", recruiter.offerCount], ["About", recruiter.companyDescription]
        ]);
    }

    function renderRecruiters() {
        const query = document.getElementById("recruiters-search").value.trim().toLowerCase();
        const filter = document.getElementById("recruiters-activity-filter").value;
        const sort = document.getElementById("recruiters-sort").value;
        const rows = state.recruiters.filter((item) => (!query || `${item.companyName} ${item.recruiterName} ${item.email} ${item.industry || ""}`.toLowerCase().includes(query)) && (filter !== "active" || item.activeJobs > 0) && (filter !== "drives" || item.driveCount > 0));
        const sorters = { company: (a, b) => a.companyName.localeCompare(b.companyName), "jobs-desc": (a, b) => b.activeJobs - a.activeJobs, "applications-desc": (a, b) => b.applicationCount - a.applicationCount };
        rows.sort(sorters[sort] || sorters.company);
        if (!rows.length) {
            const emptyState = state.recruiters.length
                ? '<h3>No recruiters match these filters</h3><p>Try a different search or clear the selected filters.</p><button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="recruiters">Clear filters</button>'
                : '<h3>No recruiter profiles found</h3><p>Recruiter workspaces will appear as companies join CampusLink.</p><button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="jobs">Review jobs</button>';
            return setBody("placement-recruiters-list", `<tr><td colspan="8"><div class="empty-state">${emptyState}</div></td></tr>`);
        }
        setBody("placement-recruiters-list", rows.map((item) => `<tr><td><div class="placement-company-cell"><span class="placement-company-avatar" aria-hidden="true">${esc((item.companyName || "C").trim().charAt(0).toUpperCase())}</span><span><strong>${esc(item.companyName)}</strong><span class="table-meta">${esc(text(item.industry, "Industry not provided"))}</span></span></div></td><td>${esc(item.recruiterName)}</td><td><a href="mailto:${esc(item.email)}">${esc(item.email)}</a></td><td><span class="placement-metric is-blue">${Number(item.activeJobs) || 0}</span></td><td><span class="placement-metric is-purple">${Number(item.driveCount) || 0}</span></td><td><span class="placement-metric is-cyan">${Number(item.applicationCount) || 0}</span></td><td><span class="placement-metric is-green">${Number(item.offerCount) || 0}</span></td><td><button class="btn btn-secondary btn-sm" data-recruiter-detail="${esc(item.userId)}">View details</button></td></tr>`).join(""));
    }

    async function loadRecruiters() {
        if (!document.getElementById("placement-recruiters-list") || state.loading.has("recruiters")) return;
        state.loading.add("recruiters");
        setBody("placement-recruiters-list", '<tr><td colspan="8" class="text-center">Loading recruiters…</td></tr>');
        try { state.recruiters = (await CampusAPI.get("/recruiters")).data || []; renderRecruiters(); }
        catch (error) { showError("placement-recruiters-list", 8, error); }
        finally { state.loading.delete("recruiters"); }
    }

    async function loadJobs() {
        if (!document.getElementById("placement-jobs-list") || state.loading.has("jobs")) return;
        state.loading.add("jobs");
        setBody("placement-jobs-list", '<tr><td colspan="8" class="text-center">Loading jobs…</td></tr>');
        try {
            const [jobsRes, appsRes, drivesRes, recruitersRes] = await Promise.all([CampusAPI.get("/jobs"), CampusAPI.get("/applications"), CampusAPI.get("/drives"), CampusAPI.get("/recruiters")]);
            state.jobs = jobsRes.data || [];
            state.recruiters = recruitersRes.data || state.recruiters;
            const companyById = new Map(state.recruiters.map((item) => [refId(item.userId), item.companyName]));
            const counts = new Map();
            (appsRes.data || []).forEach((app) => {
                const key = refId(app.jobId);
                const current = counts.get(key) || { total: 0, shortlisted: 0 };
                current.total += 1;
                if (app.status === "Shortlisted") current.shortlisted += 1;
                counts.set(key, current);
            });
            const driveByJob = new Map((drivesRes.data || []).map((drive) => [refId(drive.jobId), drive]));
            state.jobs = state.jobs.map((job) => ({ ...job, companyName: companyById.get(refId(job.recruiterId)) || "—", ...(counts.get(refId(job._id)) || { total: 0, shortlisted: 0 }), drive: driveByJob.get(refId(job._id)) }));
            renderJobs();
        } catch (error) { showError("placement-jobs-list", 8, error); }
        finally { state.loading.delete("jobs"); }
    }

    function renderJobs() {
        const query = document.getElementById("jobs-search").value.trim().toLowerCase();
        const status = document.getElementById("jobs-status-filter").value;
        const sort = document.getElementById("jobs-sort").value;
        const rows = state.jobs.filter((job) => (!query || `${job.title} ${job.companyName} ${job.requirements?.role || ""}`.toLowerCase().includes(query)) && (!status || job.status === status));
        const sorters = { title: (a, b) => a.title.localeCompare(b.title), "applications-desc": (a, b) => b.total - a.total, "created-desc": (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) };
        rows.sort(sorters[sort] || sorters.title);
        if (!rows.length) return setBody("placement-jobs-list", `<tr><td colspan="8"><div class="empty-state"><h3>${state.jobs.length ? "No jobs match these filters" : "No jobs found"}</h3><p>${state.jobs.length ? "Try another search or clear the selected filters." : "Jobs from recruiter workspaces will appear here."}</p>${state.jobs.length ? '<button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="jobs">Clear filters</button>' : '<button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="recruiters">Review recruiters</button>'}</div></td></tr>`);
        setBody("placement-jobs-list", rows.map((job) => {
            const req = job.requirements || {};
            const eligibility = [req.minimumCGPA != null ? `CGPA ${req.minimumCGPA}+` : "", req.eligibleBranches?.length ? req.eligibleBranches.join(", ") : ""].filter(Boolean).join(" · ") || "Requirements not specified";
            const drive = job.drive;
            return `<tr><td><strong class="placement-job-title">${esc(job.title)}</strong><div class="table-meta">${esc(text(req.role, "Role not specified"))}</div></td><td>${esc(job.companyName)}</td><td class="placement-eligibility-cell" title="${esc(eligibility)}">${esc(eligibility)}</td><td><span class="placement-metric is-blue">${Number(job.total) || 0}</span></td><td><span class="placement-metric is-purple">${Number(job.shortlisted) || 0}</span></td><td>${badge(job.status)}</td><td>${drive ? `<span class="placement-drive-status">${badge(drive.status)}<small>${CampusUtils.formatDate(drive.date)}</small></span>` : '<span class="table-meta">No drive scheduled</span>'}</td><td><button class="btn btn-secondary btn-sm" data-job-detail="${esc(job._id)}">Details</button></td></tr>`;
        }).join(""));
    }

    async function loadDrives() {
        if (!document.getElementById("placement-drives-list") || state.loading.has("drives")) return;
        state.loading.add("drives");
        const checkAllButton = document.getElementById("check-drive-conflicts");
        if (checkAllButton) checkAllButton.disabled = true;
        setBody("placement-drives-list", '<tr><td colspan="7" class="text-center">Loading drives…</td></tr>');
        try {
            const [driveResponse, applicationResponse, studentResponse] = await Promise.all([CampusAPI.get("/drives"), CampusAPI.get("/applications"), CampusAPI.get("/students")]);
            const applications = applicationResponse.data || [];
            const profiles = new Map((studentResponse.data || []).map((student) => [refId(student.userId), student]));
            const appsByJobAndStudent = new Map(applications.map((app) => [`${refId(app.jobId)}:${refId(app.studentId)}`, app]));
            state.drives = (driveResponse.data || []).map((drive) => {
                const roster = new Map();
                (drive.addedCandidates || []).forEach((candidate) => roster.set(refId(candidate), { candidate, added: true }));
                (drive.shortlistedCandidates || []).forEach((candidate) => roster.set(refId(candidate), { ...(roster.get(refId(candidate)) || {}), candidate, shortlisted: true }));
                return {
                    ...drive,
                    candidateRows: [...roster.entries()].map(([id, entry]) => {
                        const app = appsByJobAndStudent.get(`${refId(drive.jobId)}:${id}`);
                        return { id, name: entry.candidate?.name || app?.studentId?.name || "Student", profile: profiles.get(id), status: app?.status || (entry.shortlisted ? "Shortlisted" : "Added") };
                    })
                };
            });
            renderDrives();
            CampusUtils.hydrateStudentAvatars(document.getElementById("placement-drives-list"));
        }
        catch (error) { showError("placement-drives-list", 7, error); }
        finally { state.loading.delete("drives"); if (checkAllButton) checkAllButton.disabled = false; }
    }

    function renderDrives() {
        const query = document.getElementById("drives-search").value.trim().toLowerCase();
        const status = document.getElementById("drives-status-filter").value;
        const sort = document.getElementById("drives-sort").value;
        const rows = state.drives.filter((drive) => (!query || `${drive.companyName} ${drive.role} ${drive.jobId?.title || ""} ${drive.venue || ""}`.toLowerCase().includes(query)) && (!status || drive.status === status));
        const sorters = { "date-asc": (a, b) => new Date(a.date) - new Date(b.date), "date-desc": (a, b) => new Date(b.date) - new Date(a.date), company: (a, b) => a.companyName.localeCompare(b.companyName) };
        rows.sort(sorters[sort] || sorters["date-asc"]);
        if (!rows.length) return setBody("placement-drives-list", `<tr><td colspan="7"><div class="empty-state"><h3>${state.drives.length ? "No drives match these filters" : "No drives found"}</h3><p>${state.drives.length ? "Try another search or clear the selected filters." : "Scheduled placement drives will appear here."}</p>${state.drives.length ? '<button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="drives">Clear filters</button>' : '<button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="recruiters">Review recruiters</button>'}</div></td></tr>`);
        setBody("placement-drives-list", rows.map((drive) => {
            const result = state.driveConflicts.get(refId(drive._id));
            const conflictCell = result ? (result.conflicts.length ? `<button class="conflict-count" data-drive-check="${esc(drive._id)}">${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"}</button>` : `<button class="conflict-clear" data-drive-check="${esc(drive._id)}">No conflicts</button>`) : `<button class="btn btn-secondary btn-sm" data-drive-check="${esc(drive._id)}">Check</button>`;
            const candidateRows = drive.candidateRows || [];
            const shortlistedCount = drive.shortlistedCandidates?.length || 0;
            const roster = candidateRows.length ? `<details class="placement-drive-roster"><summary>${candidateRows.length} candidates · ${shortlistedCount} shortlisted ▾</summary><ul>${candidateRows.map((candidate) => `<li>${CampusUtils.studentAvatarMarkup(candidate.name, candidate.id)} <span><strong>${esc(candidate.name)}</strong><small>${esc(text(candidate.profile?.branch))} · CGPA ${esc(text(candidate.profile?.cgpa))} · ${esc(candidate.status)}</small></span></li>`).join("")}</ul></details>` : `<span>0 candidates · 0 shortlisted</span>`;
            return `<tr><td><strong>${esc(text(drive.companyName))}</strong><div class="table-meta">${esc(text(drive.role))}</div></td><td>${esc(text(drive.jobId?.title))}</td><td>${CampusUtils.formatDate(drive.date)}<div class="table-meta">${esc(text(drive.startTime))}–${esc(text(drive.endTime))}</div></td><td>${esc(text(drive.venue, "Online"))}<div class="table-meta">${esc(text(drive.mode))}</div></td><td>${badge(drive.status)}</td><td>${roster}</td><td>${conflictCell}</td></tr>`;
        }).join(""));
    }

    async function checkDrive(driveId) {
        try {
            const response = await CampusAPI.post(`/drives/${encodeURIComponent(driveId)}/check-conflicts`, {});
            state.driveConflicts.set(driveId, response.data || { conflicts: [] });
            renderDrives();
            return response.data?.conflicts || [];
        } catch (error) { CampusUtils.showToast(error.message || "Could not check drive conflicts.", "error"); throw error; }
    }

    function describeConflict(conflict) {
        const time = (drive) => `${drive?.startTime || "—"}–${drive?.endTime || "—"}`;
        if (conflict.type === "drive_time_overlap") {
            const existing = conflict.existingDrive || conflict.conflictingDrive || {};
            const requested = conflict.requestedDrive || {};
            return `Drive conflict: ${text(existing.role || existing.company)} (${text(existing.date)} ${time(existing)}) overlaps ${text(requested.role)} (${text(requested.date)} ${time(requested)}). Overlap: ${time(conflict.overlap)}.`;
        }
        if (conflict.type === "venue_time_overlap") {
            return `Venue conflict: ${text(conflict.currentDrive?.role)} and ${text(conflict.conflictingDrive?.role)} overlap at ${text(conflict.currentDrive?.venue)} on ${text(conflict.overlap?.date)} (${time(conflict.overlap)}).`;
        }
        return `Candidate conflict: ${text(conflict.student?.name, "Candidate")} has overlapping drives ${text(conflict.currentDrive?.role)} and ${text(conflict.conflictingDrive?.role)} on ${text(conflict.overlap?.date)} (${time(conflict.overlap)}).`;
    }

    function showConflictDetails(conflicts, driveId) {
        const results = document.getElementById("scheduling-conflict-results");
        if (!conflicts.length) {
            if (results) results.textContent = "No scheduling conflicts found for this drive.";
            CampusUtils.showToast("No scheduling conflicts found.", "success");
            return;
        }
        const details = conflicts.map(describeConflict).join(" ");
        if (results) results.textContent = details;
        CampusUtils.showToast(`${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} found${driveId ? ` for drive ${driveId}` : ""}. Review the conflict details above the drives list.`, "warning", 6500);
    }

    document.getElementById("check-drive-conflicts")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        if (!state.drives.length) await loadDrives();
        button.disabled = true;
        const results = document.getElementById("scheduling-conflict-results");
        results.textContent = "Checking each drive with the CampusLink conflict service…";
        try {
            const responses = await Promise.all(state.drives.map((drive) => checkDrive(refId(drive._id))));
            const conflicts = responses.flat();
            const count = conflicts.length;
            results.textContent = count ? conflicts.map(describeConflict).join(" ") : "No scheduling conflicts found.";
        } catch { results.textContent = "Some drive checks could not be completed. Retry the affected checks in the list."; }
        finally { button.disabled = false; }
    });

    async function loadApplications() {
        if (!document.getElementById("placement-applications-list") || state.loading.has("applications")) return;
        state.loading.add("applications");
        setBody("placement-applications-list", '<tr><td colspan="9" class="text-center">Loading applications…</td></tr>');
        try {
            const [applicationsResponse, offersResponse] = await Promise.all([
                CampusAPI.get("/applications"),
                CampusAPI.get("/offers").catch(() => ({ data: [] }))
            ]);
            state.applications = applicationsResponse.data || [];
            state.applicationCtc = new Map((offersResponse.data || [])
                .filter((offer) => offer.applicationId && Number.isFinite(Number(offer.ctc)))
                .map((offer) => [refId(offer.applicationId), Number(offer.ctc)]));
            const statuses = [...new Set(state.applications.map((item) => item.status).filter(Boolean))].sort();
            const select = document.getElementById("applications-status-filter");
            const current = select.value;
            select.innerHTML = '<option value="">All statuses</option>' + statuses.map((value) => `<option>${esc(value)}</option>`).join("");
            if (statuses.includes(current)) select.value = current;
            renderApplications();
        } catch (error) { showError("placement-applications-list", 9, error); }
        finally { state.loading.delete("applications"); }
    }

    function renderApplications() {
        const query = document.getElementById("applications-search").value.trim().toLowerCase();
        const status = document.getElementById("applications-status-filter").value;
        const sort = document.getElementById("applications-sort").value;
        const rows = state.applications.filter((app) => {
            const student = app.studentId || {}, job = app.jobId || {};
            return (!query || `${student.name || ""} ${app.companyName || ""} ${job.title || ""}`.toLowerCase().includes(query)) && (!status || app.status === status);
        });
        const sorters = { "date-desc": (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt), "date-asc": (a, b) => new Date(a.appliedAt) - new Date(b.appliedAt), "match-desc": (a, b) => (b.matching?.finalScore ?? -1) - (a.matching?.finalScore ?? -1) };
        rows.sort(sorters[sort] || sorters["date-desc"]);
        if (!rows.length) return setBody("placement-applications-list", `<tr><td colspan="9"><div class="empty-state"><h3>${state.applications.length ? "No applications match these filters" : "No applications found"}</h3><p>${state.applications.length ? "Try another search or clear the selected filters." : "Applications submitted to CampusLink jobs will appear here."}</p>${state.applications.length ? '<button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="applications">Clear filters</button>' : '<button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="jobs">Review open jobs</button>'}</div></td></tr>`);
        setBody("placement-applications-list", rows.map((app) => {
            const student = app.studentId || {}, profile = app.studentProfile || {}, job = app.jobId || {}, score = app.matching?.finalScore;
            const eligibility = app.eligibility?.isEligible === true ? "Eligible" : app.eligibility?.isEligible === false ? "Ineligible" : "Unknown";
            const ctc = state.applicationCtc.get(refId(app._id));
            const packageCell = ctc == null
                ? `<span class="placement-compensation is-pending"><small>Package</small><strong>${app.status === "Selected" ? "Awaiting offer" : "Not set"}</strong></span>`
                : `<span class="placement-compensation"><small>Package / CTC</small><strong>₹${ctc.toLocaleString("en-IN")}</strong></span>`;
            return `<tr><td>${CampusUtils.studentAvatarMarkup(student.name, student._id)}<strong>${esc(text(student.name))}</strong><div class="table-meta">${esc(text(profile.branch))} · CGPA ${esc(text(profile.cgpa))}</div></td><td><strong>${esc(text(job.title))}</strong><div class="table-meta">${esc(text(app.companyName))}</div></td><td>${packageCell}</td><td>${score == null ? "—" : `<span class="score-badge ${CampusUtils.scoreClass(score)}">${esc(score)}/100</span>`}</td><td>${badge(eligibility)}</td><td>${CampusUtils.formatDate(app.appliedAt)}</td><td>${badge(app.status)}</td><td>${app.driveId ? `${esc(text(app.driveId.companyName))}<div class="table-meta">${CampusUtils.formatDate(app.driveId.date)}</div>` : "—"}</td><td><button class="btn btn-secondary btn-sm" data-resume-student="${esc(refId(student._id))}" ${student._id ? "" : "disabled"}>Resume</button></td></tr>`;
        }).join(""));
        CampusUtils.hydrateStudentAvatars(document.getElementById("placement-applications-list"));
    }

    async function loadOfferManagement() {
        if (!document.getElementById("selected-candidates-list") || state.loading.has("offers")) return;
        state.loading.add("offers");
        const candidateBody = document.getElementById("selected-candidates-list"), offerBody = document.getElementById("placement-offers-list");
        candidateBody.innerHTML = '<tr><td colspan="4" class="text-center">Loading selected candidates…</td></tr>';
        offerBody.innerHTML = '<tr><td colspan="7" class="text-center">Loading offers…</td></tr>';
        try {
            const [jobsResponse, offersResponse, recruitersResponse, applicationsResponse] = await Promise.all([CampusAPI.get("/jobs"), CampusAPI.get("/offers"), CampusAPI.get("/recruiters"), CampusAPI.get("/applications")]);
            const companyById = new Map((recruitersResponse.data || []).map((item) => [refId(item.userId), item.companyName]));
            const jobs = (jobsResponse.data || []).map((job) => ({ ...job, companyName: companyById.get(refId(job.recruiterId)) || "—" }));
            const offers = offersResponse.data || [];
            const offeredApplications = new Set(offers.map((offer) => refId(offer.applicationId)));
            const jobsById = new Map(jobs.map((job) => [refId(job._id), job]));
            const selected = (applicationsResponse.data || []).filter((app) => app.status === "Selected" && !offeredApplications.has(refId(app._id)) && jobsById.has(refId(app.jobId?._id || app.jobId))).map((app) => ({ ...app, _job: jobsById.get(refId(app.jobId?._id || app.jobId)) }));
            candidateBody.innerHTML = selected.length ? selected.map((app) => `<tr><td>${CampusUtils.studentAvatarMarkup(app.studentId?.name, app.studentId?._id)}<strong>${esc(text(app.studentId?.name, "Student"))}</strong></td><td>${esc(text(app._job.companyName))}</td><td>${esc(app._job.requirements?.role || app._job.title)}</td><td>${badge('Selected · awaiting recruiter offer')}</td></tr>`).join("") : '<tr><td colspan="4"><div class="empty-state"><h3>No selected candidates are waiting for an offer</h3><p>Selected applications without an offer will appear here.</p></div></td></tr>';
            CampusUtils.hydrateStudentAvatars(candidateBody);
            state.offers = offers;
            const statusSelect = document.getElementById("offers-status-filter"), oldStatus = statusSelect.value;
            const offerStatuses = [...new Set(offers.map((offer) => offer.offerStatus).filter(Boolean))].sort();
            statusSelect.innerHTML = '<option value="">All offer statuses</option>' + offerStatuses.map((item) => `<option>${esc(item)}</option>`).join("");
            if (offerStatuses.includes(oldStatus)) statusSelect.value = oldStatus;
            renderOffers();
        } catch (error) { showError("selected-candidates-list", 4, error); showError("placement-offers-list", 7, error); }
        finally { state.loading.delete("offers"); }
    }

    function renderOffers() {
        const query = document.getElementById("offers-search").value.trim().toLowerCase();
        const status = document.getElementById("offers-status-filter").value;
        const offers = state.offers.filter((offer) => (!query || `${offer.studentId?.name || ""} ${offer.companyName || ""} ${offer.role || ""}`.toLowerCase().includes(query)) && (!status || offer.offerStatus === status));
        setBody("placement-offers-list", offers.length ? offers.map((offer) => {
            const required = (offer.documents || []).filter((doc) => doc.required !== false);
            const verificationStatus = (doc) => doc.verificationStatus || (doc.status === 'Verified' ? 'VERIFIED' : doc.status === 'Rejected' ? 'REJECTED' : doc.status === 'Submitted' ? 'NEEDS_REVIEW' : 'PENDING');
            const verified = required.filter((doc) => verificationStatus(doc) === 'VERIFIED').length;
            const needsReview = required.filter((doc) => verificationStatus(doc) === 'NEEDS_REVIEW').length;
            const rejected = required.filter((doc) => verificationStatus(doc) === 'REJECTED').length;
            const progress = required.length ? `${verified === required.length ? 'VERIFIED' : needsReview ? 'MANUAL CHECKING' : rejected ? 'REJECTED' : 'PENDING'} · ${verified}/${required.length} verified${needsReview ? ` · ${needsReview} manual checking` : ''}${rejected ? ` · ${rejected} rejected` : ''}` : 'No required documents';
            const decision = offer.offerStatus === 'Joining Confirmed' ? '✓ Workflow completed' : offer.offerStatus === 'Declined' ? '✕ Offer declined' : 'Recruiter managed';
            return `<tr><td><strong>${esc(text(offer.studentId?.name, "Student"))}</strong></td><td><strong>${esc(text(offer.companyName))}</strong><div class="table-meta">${esc(text(offer.role))}</div></td><td>₹${Number(offer.ctc).toLocaleString("en-IN")}</td><td>${badge(offer.offerStatus)}</td><td>${esc(progress)}</td><td>${offer.joiningDate ? CampusUtils.formatDate(offer.joiningDate) : "—"}</td><td>${esc(decision)}</td></tr>`;
        }).join("") : `<tr><td colspan="7"><div class="empty-state"><h3>${state.offers.length ? "No offers match these filters" : "No offers yet"}</h3><p>${state.offers.length ? "Try another search or clear the selected filters." : "Offer progress will appear here after recruiters send offers."}</p>${state.offers.length ? '<button type="button" class="btn btn-secondary btn-sm" data-placement-clear-filters="offers">Clear filters</button>' : '<button type="button" class="btn btn-secondary btn-sm" data-placement-open-view="applications">Review applications</button>'}</div></td></tr>`);
    }

    async function openResume(userId) {
        try { await CampusUtils.openStudentResume(userId); }
        catch (error) { CampusUtils.showToast(error.message || "Resume is not available.", "error"); }
    }

    function openDetails(kind, title, fields) {
        document.getElementById("placement-detail-eyebrow").textContent = kind;
        document.getElementById("placement-detail-title").textContent = title || "Details";
        document.getElementById("placement-detail-body").innerHTML = `<dl class="detail-grid">${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(text(value))}</dd></div>`).join("")}</dl>`;
        document.getElementById("placement-detail-dialog").showModal();
    }

    async function showStudentDetail(userId) {
        try {
            if (!state.students.length) state.students = (await CampusAPI.get("/students")).data || [];
            const student = state.students.find((item) => refId(item.userId) === userId);
            if (!student) return;
            const profile = (await CampusAPI.get(`/students/${encodeURIComponent(userId)}`)).data || {};
            const readiness = profile.readiness || student.readiness || {};
            const risk = window.CampusRiskData?.students?.find((item) => refId(item.studentId) === userId);
            openDetails("Student profile", profile.name || student.name, [
                ["Branch", profile.branch], ["CGPA", profile.cgpa], ["Graduation year", profile.graduationYear], ["Readiness", readiness.category ? `${readiness.category}${readiness.score == null ? "" : ` · ${readiness.score}`}` : "Not assessed"],
                ...(risk?.riskLevel ? [["Placement risk", `${risk.riskLevel} · ${risk.riskScore}/100`], ["Risk factors", (risk.factors || []).map((factor) => `${factor.name}: ${factor.value}`).join(" · ")], ["Shortlisted applications", risk.shortlistedCount]] : []),
                ["Applications", student.applicationCount], ["Offer records", student.offerCount], ["Skills", (profile.skills || []).map((skill) => skill.name || skill).join(", ")], ["Projects", (profile.projects || []).map((project) => project.title).join(", ")], ["Education", (profile.education || []).map((item) => `${item.degree || ""} ${item.field || ""}`.trim()).join(", ")]
            ]);
            if (profile.resume?.storedFileName) {
                const action = document.createElement("button"); action.className = "btn btn-secondary"; action.textContent = "View resume"; action.addEventListener("click", () => openResume(userId));
                document.getElementById("placement-detail-body").append(action);
            }
            CampusUtils.hydrateStudentAvatars(document.getElementById("placement-detail-dialog"));
        } catch (error) { CampusUtils.showToast(error.message || "Could not load student details.", "error"); }
    }

    function showJobDetail(jobId) {
        const job = state.jobs.find((item) => refId(item._id) === jobId);
        if (!job) return;
        const req = job.requirements || {};
        openDetails("Job", job.title, [["Company", job.companyName], ["Status", job.status], ["Role", req.role], ["Required skills", (req.requiredSkills || []).join(", ")], ["Preferred skills", (req.preferredSkills || []).join(", ")], ["Minimum CGPA", req.minimumCGPA], ["Eligible branches", (req.eligibleBranches || []).join(", ")], ["Maximum backlogs", req.maximumBacklogs], ["Applications", job.total], ["Shortlisted", job.shortlisted], ["Description", job.description]]);
    }

    document.getElementById("close-placement-detail")?.addEventListener("click", () => document.getElementById("placement-detail-dialog").close());
    document.getElementById("placement-detail-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

    document.getElementById("placement-students-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-student-detail]"); if (button) showStudentDetail(button.dataset.studentDetail); });
    document.getElementById("risk-students-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-student-detail]"); if (button) showStudentDetail(button.dataset.studentDetail); });
    document.getElementById("placement-recruiters-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-recruiter-detail]"); if (button) { const recruiter = state.recruiters.find((item) => refId(item.userId) === button.dataset.recruiterDetail); if (recruiter) recruiterDetails(recruiter); } });
    document.getElementById("placement-jobs-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-job-detail]"); if (button) showJobDetail(button.dataset.jobDetail); });
    document.getElementById("placement-drives-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-drive-check]"); if (button) checkDrive(button.dataset.driveCheck).then((conflicts) => showConflictDetails(conflicts, button.dataset.driveCheck)); });
    document.getElementById("placement-applications-list")?.addEventListener("click", (event) => { const button = event.target.closest("[data-resume-student]"); if (button && button.dataset.resumeStudent) openResume(button.dataset.resumeStudent); });

    document.addEventListener("click", (event) => {
        const retry = event.target.closest("[data-placement-retry]");
        if (retry) {
            const loaders = {
                "placement-students-list": loadStudents,
                "placement-recruiters-list": loadRecruiters,
                "placement-jobs-list": loadJobs,
                "placement-drives-list": loadDrives,
                "placement-applications-list": loadApplications,
                "selected-candidates-list": loadOfferManagement,
                "placement-offers-list": loadOfferManagement
            };
            loaders[retry.dataset.placementRetry]?.();
            return;
        }
        const clear = event.target.closest("[data-placement-clear-filters]");
        if (clear) {
            const config = {
                students: [["students-search", "students-branch-filter", "students-status-filter", "students-sort"], renderStudents],
                recruiters: [["recruiters-search", "recruiters-activity-filter", "recruiters-sort"], renderRecruiters],
                jobs: [["jobs-search", "jobs-status-filter", "jobs-sort"], renderJobs],
                drives: [["drives-search", "drives-status-filter", "drives-sort"], renderDrives],
                applications: [["applications-search", "applications-status-filter", "applications-sort"], renderApplications],
                offers: [["offers-search", "offers-status-filter"], renderOffers]
            }[clear.dataset.placementClearFilters];
            if (!config) return;
            config[0].forEach((id) => {
                const control = document.getElementById(id);
                if (!control) return;
                if (control.tagName === "INPUT") control.value = "";
                else control.selectedIndex = 0;
            });
            config[1]();
            return;
        }
        const openView = event.target.closest("[data-placement-open-view]");
        if (openView) showView(openView.dataset.placementOpenView);
    });

    [["students-search", renderStudents], ["students-branch-filter", renderStudents], ["students-status-filter", renderStudents], ["students-sort", renderStudents], ["recruiters-search", renderRecruiters], ["recruiters-activity-filter", renderRecruiters], ["recruiters-sort", renderRecruiters], ["jobs-search", renderJobs], ["jobs-status-filter", renderJobs], ["jobs-sort", renderJobs], ["drives-search", renderDrives], ["drives-status-filter", renderDrives], ["drives-sort", renderDrives], ["applications-search", renderApplications], ["applications-status-filter", renderApplications], ["applications-sort", renderApplications], ["offers-search", renderOffers], ["offers-status-filter", renderOffers]].forEach(([id, handler]) => {
        const control = document.getElementById(id);
        control?.addEventListener(control.tagName === "INPUT" ? "input" : "change", handler);
    });
    document.getElementById("refresh-offers")?.addEventListener("click", () => { state.loading.delete("offers"); loadOfferManagement(); });
    showView("dashboard");
});

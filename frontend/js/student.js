/**
 * CampusLink — student.js
 * Student dashboard logic.
 *
 * Phase 2: profile display + edit
 * Phase 3: resume upload → AI parsing
 * Phase 4: readiness score + skill-gap display
 * Student Job Board: active jobs + job details
 * Phase 7: recommended jobs
 * Phase 8: applications tracking
 * Phase 10: offers tracking
 */

"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    CampusAuth.requireRole("student");
    CampusAuth.populateSidebarUser();
    CampusAuth.attachLogoutHandler();

    const currentUser = CampusAuth.getCurrentUser();
    let currentJobId = null;
    let loadedStudentProfile = null;
    let profileAvatarObjectUrl = null;
    let studentJobsCache = [];
    let studentApplicationsCache = [];
    let studentOffersCache = [];
    let studentNotifications = [];

    function createUploadProgress(host, label) {
        let progress = host.querySelector('.upload-progress');
        if (!progress) {
            progress = document.createElement('div');
            progress.className = 'upload-progress';
            progress.setAttribute('role', 'status');
            progress.innerHTML = `<div class="upload-progress-heading"><span>${label}</span><span class="upload-progress-value">0%</span></div><div class="upload-progress-track"><span></span></div>`;
            host.append(progress);
        }
        const fill = progress.querySelector('.upload-progress-track > span');
        const value = progress.querySelector('.upload-progress-value');
        progress.hidden = false;
        return (percent, state = 'uploading') => {
            const safe = Math.max(0, Math.min(100, Number(percent) || 0));
            progress.dataset.state = state;
            fill.style.width = `${safe}%`;
            value.textContent = state === 'processing' ? 'Processing' : `${safe}%`;
            if (state === 'done') setTimeout(() => { progress.hidden = true; }, 1800);
            if (state === 'error') setTimeout(() => { progress.hidden = true; }, 3500);
        };
    }

    async function loadNotifications() {
        const list = document.getElementById('student-notification-list');
        if (!list) return;
        try {
            const response = await CampusAPI.get('/notifications');
            studentNotifications = response.data || [];
            const unread = studentNotifications.filter((item) => !item.readAt).length;
            const count = document.getElementById('student-notification-count');
            count.textContent = String(unread);
            count.hidden = !unread;
            list.innerHTML = studentNotifications.length ? studentNotifications.map((item) => `<article class="student-notification-item ${item.readAt ? '' : 'is-unread'}"><div><p>${CampusUtils.escapeHtml(item.message)}</p><time>${CampusUtils.formatDateTime(item.createdAt)}</time></div><button type="button" class="btn btn-secondary btn-sm" data-open-notification="${CampusUtils.escapeHtml(item._id)}">${item.readAt ? 'View' : 'Mark read'}</button></article>`).join('') : '<p class="text-muted">You are all caught up.</p>';
            list.querySelectorAll('[data-open-notification]').forEach((button) => button.addEventListener('click', async () => {
                const notification = studentNotifications.find((item) => item._id === button.dataset.openNotification);
                if (notification && !notification.readAt) await CampusAPI.patch(`/notifications/${encodeURIComponent(notification._id)}/read`, {});
                const section = notification?.type === 'offer' || notification?.type === 'document' || notification?.type === 'joining' ? 'offers' : 'applications';
                document.querySelector(`[data-section="${section}"]`)?.click();
                await loadNotifications();
            }));
        } catch (error) { list.innerHTML = `<p class="text-muted">Notifications unavailable: ${CampusUtils.escapeHtml(error.message)}</p>`; }
    }
    document.getElementById('student-notification-toggle')?.addEventListener('click', () => {
        const panel = document.getElementById('student-notification-panel');
        const open = panel.classList.toggle('hidden') === false;
        document.getElementById('student-notification-toggle').setAttribute('aria-expanded', String(open));
        if (open) loadNotifications();
    });
    document.getElementById('student-notification-read-all')?.addEventListener('click', async () => {
        try { await CampusAPI.patch('/notifications/read-all', {}); await loadNotifications(); }
        catch (error) { CampusUtils.showToast(error.message, 'error'); }
    });
    loadNotifications();
    window.addEventListener('focus', loadNotifications);
    window.setInterval(loadNotifications, 60000);

    async function loadDashboardMetrics() {
        const studentId = currentUser?.id;
        const setMetric = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };
        if (!studentId) {
            ["readiness-score", "applications-count", "matched-jobs", "offers-count"].forEach((id) => setMetric(id, "Unavailable"));
            return;
        }

        const studentPath = `/students/${encodeURIComponent(studentId)}`;
        const renderReadinessSnapshot = (readiness) => {
            const score = document.getElementById("dashboard-readiness-score");
            const category = document.getElementById("dashboard-readiness-category");
            const breakdown = document.getElementById("dashboard-readiness-breakdown");
            const gaps = document.getElementById("dashboard-skill-gaps");
            if (!score || !category || !breakdown || !gaps) return;
            score.textContent = readiness?.score == null ? "—" : String(readiness.score);
            category.textContent = readiness?.category || "Complete a readiness assessment to see your profile snapshot.";
            const values = [["Technical skills", readiness?.breakdown?.technicalSkills], ["Projects", readiness?.breakdown?.projects], ["Academic", readiness?.breakdown?.academic], ["Assessment", readiness?.breakdown?.assessment], ["Interview", readiness?.breakdown?.interview]];
            breakdown.innerHTML = values.filter(([, value]) => value != null).map(([label, value]) => `<div><span>${CampusUtils.escapeHtml(label)}</span><strong>${CampusUtils.escapeHtml(String(value))}</strong><div class="dashboard-mini-track"><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></div></div>`).join("") || '<p class="text-muted">No readiness breakdown is available yet.</p>';
            const skillGaps = readiness?.skillGaps || readiness?.improvementAreas || [];
            gaps.innerHTML = skillGaps.length ? `<span class="dashboard-inline-label">Skills to strengthen</span><div>${skillGaps.slice(0, 8).map((skill) => `<span class="dashboard-skill-chip">${CampusUtils.escapeHtml(skill)}</span>`).join("")}</div>` : readiness ? '<span class="dashboard-skill-chip is-success">No skill gaps reported</span>' : '';
        };

        const renderRecentApplications = (applications) => {
            const target = document.getElementById("dashboard-recent-applications");
            if (!target) return;
            target.innerHTML = applications.length ? applications.slice().sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0)).slice(0, 4).map((application) => `<div class="dashboard-activity-row"><div><strong>${CampusUtils.escapeHtml(application.jobId?.title || "Job application")}</strong><small>${CampusUtils.escapeHtml(application.jobId?.companyName || "Company")}${application.appliedAt ? ` · ${CampusUtils.formatDate(application.appliedAt)}` : ""}</small></div><span class="status-badge ${CampusUtils.statusBadgeClass(application.status)}">${CampusUtils.escapeHtml(application.status || "Applied")}</span></div>`).join("") : '<p class="dashboard-empty-note">Your submitted applications will appear here.</p>';
        };

        const readinessTask = (async () => {
            try {
                const response = await CampusAPI.get(`${studentPath}/readiness`);
                const score = response.data?.score;
                setMetric("readiness-score", score == null ? "Not assessed" : String(score));
                renderReadinessSnapshot(response.data || null);
            } catch (error) {
                setMetric("readiness-score", error.status === 404 ? "Not assessed" : "Unavailable");
                renderReadinessSnapshot(null);
            }
        })();
        const applicationsTask = (async () => {
            try {
                const response = await CampusAPI.get(`${studentPath}/applications`);
                studentApplicationsCache = Array.isArray(response.data) ? response.data : [];
                setMetric("applications-count", String(studentApplicationsCache.length));
                renderRecentApplications(studentApplicationsCache);
            } catch { setMetric("applications-count", "Unavailable"); const target = document.getElementById("dashboard-recent-applications"); if (target) target.innerHTML = '<p class="dashboard-empty-note">Application activity is unavailable right now.</p>'; }
        })();
        const offersTask = (async () => {
            const target = document.getElementById("dashboard-offer-activity");
            try {
                const response = await CampusAPI.get(`${studentPath}/offers`);
                const offers = Array.isArray(response.data) ? response.data : [];
                setMetric("offers-count", String(offers.length));
                if (target) target.innerHTML = offers.length ? offers.slice(0, 3).map((offer) => `<div class="dashboard-activity-row"><div><strong>${CampusUtils.escapeHtml(offer.companyName || "Company")}</strong><small>${CampusUtils.escapeHtml(offer.role || "Offer")}</small></div><span class="status-badge ${CampusUtils.statusBadgeClass(offer.offerStatus)}">${CampusUtils.escapeHtml(offer.offerStatus || "Pending")}</span></div>`).join("") : '<p class="dashboard-empty-note">Offers and document progress will appear here.</p>';
            } catch { setMetric("offers-count", "Unavailable"); if (target) target.innerHTML = '<p class="dashboard-empty-note">Offer activity is unavailable right now.</p>'; }
        })();
        const matchedJobsTask = (async () => {
            const target = document.getElementById("dashboard-matched-jobs");
            try {
                const response = await CampusAPI.get("/jobs");
                if (!Array.isArray(response.data)) throw new Error("Jobs response unavailable");
                const matches = await Promise.all(response.data.map((job) =>
                    CampusAPI.post(`/jobs/${encodeURIComponent(job._id)}/match`)
                ));
                const ranked = matches.map((match, index) => ({ job: response.data[index], match: match.data || {} })).filter((item) => item.match.eligible === true).sort((a, b) => (b.match.matchScore || 0) - (a.match.matchScore || 0));
                setMetric("matched-jobs", String(ranked.length));
                if (target) target.innerHTML = ranked.length ? ranked.slice(0, 3).map(({ job, match }) => `<div class="dashboard-match-row"><div><strong>${CampusUtils.escapeHtml(job.title)}</strong><small>${CampusUtils.escapeHtml(job.companyName || "Company")}</small></div><span class="dashboard-match-score">${CampusUtils.escapeHtml(String(match.matchScore ?? "—"))}<small>/100</small></span></div>`).join("") : '<p class="dashboard-empty-note">No eligible job matches are available yet.</p>';
            } catch {
                setMetric("matched-jobs", "Unavailable");
                if (target) target.innerHTML = '<p class="dashboard-empty-note">Job matches are unavailable right now.</p>';
            }
        })();

        await Promise.all([readinessTask, applicationsTask, offersTask, matchedJobsTask]);
    }
    loadDashboardMetrics();
    loadStudentAppearance();

    // UI Elements
    const dashboardView = document.getElementById("dashboard-view");
    const profileView = document.getElementById("profile-view");
    const profileForm = document.getElementById("student-profile-form");
    const saveBtn = document.getElementById("save-profile-btn");

    // Resume UI Elements
    const resumeUploadForm = document.getElementById("resume-upload-form");
    const resumeFileInput = document.getElementById("resume-file");
    const uploadResumeBtn = document.getElementById("upload-resume-btn");
    const resumeUploadStatus = document.getElementById("resume-upload-status");
    const resumeUploadMessage = document.getElementById("resume-upload-message");
    const resumeCurrentFile = document.getElementById("resume-current-file");
    const resumeFilenameDisplay = document.getElementById("resume-filename-display");

    // Navigation
    document.querySelectorAll(".sidebar-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();

            document.querySelectorAll(".sidebar-link").forEach(l => {
                l.classList.remove("active");
            });

            e.currentTarget.classList.add("active");

            const section = e.currentTarget.getAttribute("data-section");

            const pageTitle = document.getElementById("page-title");
            if (pageTitle) pageTitle.textContent = ({ dashboard: "Dashboard", profile: "My Profile", resume: "Resume", readiness: "Readiness", assessment: "Career Practice", "mock-interview": "Career Practice", "career-practice": "Career Practice", jobs: "Jobs", applications: "Applications", drives: "Drives", offers: "Offers", assistant: "AI Assistant" })[section] || "Dashboard";
            if (section === "assistant") {
                document.querySelector(".assistant-launcher")?.click();
                return;
            }

            // Hide all views
            dashboardView.classList.add("hidden");
            profileView.classList.add("hidden");

            const readinessView = document.getElementById("readiness-view");
            const jobsView = document.getElementById("jobs-view");
            const jobDetailsView = document.getElementById("job-details-view");
            const applicationsView = document.getElementById("applications-view");
            const offersView = document.getElementById("offers-view");
            const drivesView = document.getElementById("drives-view");
            const careerPracticeView = document.getElementById("career-practice-view");

            if (readinessView) readinessView.classList.add("hidden");
            if (jobsView) jobsView.classList.add("hidden");
            if (jobDetailsView) jobDetailsView.classList.add("hidden");
            if (applicationsView) applicationsView.classList.add("hidden");
            if (offersView) offersView.classList.add("hidden");
            if (drivesView) drivesView.classList.add("hidden");
            if (careerPracticeView) careerPracticeView.classList.add("hidden");

            // Show selected section
            if (section === "dashboard") {
                dashboardView.classList.remove("hidden");
                loadDashboardMetrics();

            } else if (section === "profile") {
                profileView.classList.remove("hidden");
                loadProfile();

            } else if (section === "resume") {
                profileView.classList.remove("hidden");
                loadProfile();
                requestAnimationFrame(() => document.getElementById("resume-card")?.scrollIntoView({ behavior: "smooth", block: "start" }));

            } else if (section === "readiness") {
                if (readinessView) {
                    readinessView.classList.remove("hidden");
                }
                loadReadiness();

            } else if (section === "career-practice" || section === "assessment" || section === "mock-interview") {
                if (careerPracticeView) careerPracticeView.classList.remove("hidden");
                window.CampusCareerPractice?.open("career-practice");

            } else if (section === "applications") {
                if (applicationsView) {
                    applicationsView.classList.remove("hidden");
                    loadApplications();
                }

            } else if (section === "offers") {
                if (offersView) offersView.classList.remove("hidden");
                loadOffers();

            } else if (section === "drives") {
                if (drivesView) drivesView.classList.remove("hidden");
                loadStudentDrives();

            } else if (section === "jobs") {
                if (jobsView) {
                    jobsView.classList.remove("hidden");
                    loadJobs();
                }

            } else {
                dashboardView.classList.remove("hidden");
                CampusUtils.showToast(
                    `${section} is not implemented yet.`,
                    "info"
                );
            }
        });
    });

    // ==============================
    // PROFILE
    // ==============================

    async function loadProfile() {
        try {
            const res = await CampusAPI.get(`/students/${currentUser.id}`);
            const profile = res.data;
            loadedStudentProfile = profile;

            document.getElementById("profile-name").value =
                profile.name || "";

            document.getElementById("profile-email").value =
                profile.email || "";

            document.getElementById("profile-phone").value =
                profile.phone || "";

            const branch = String(profile.branch || "").trim().toLowerCase();
            document.getElementById("profile-branch").value = ({ cse: "computer science", cs: "computer science", it: "information technology" })[branch] || branch;

            document.getElementById("profile-graduationYear").value =
                profile.graduationYear || "";

            document.getElementById("profile-cgpa").value =
                profile.cgpa ?? "";

            document.getElementById("profile-backlogs").value =
                profile.backlogs || 0;

            if (profile.skills && Array.isArray(profile.skills)) {
                document.getElementById("profile-skills").value =
                    profile.skills.map(s => s.name).join(", ");
            }
            renderProjects(profile.projects || []);
            renderResumeNlpAnalysis(profile);
            updateProfileCompletion(profile);
            await loadStudentAppearance(profile);

            if (profile.resume && profile.resume.originalFileName) {
                resumeCurrentFile.classList.remove("hidden");
                resumeFilenameDisplay.textContent =
                    profile.resume.originalFileName;
            } else {
                resumeCurrentFile.classList.add("hidden");
            }
            renderResumeAnalysisState(profile.resume);

        } catch (err) {
            CampusUtils.showToast(
                "Failed to load profile: " + err.message,
                "error"
            );
        }
    }

    document.getElementById("resume-view-btn")?.addEventListener("click", async () => {
        try { await CampusUtils.openStudentResume(currentUser.id); }
        catch (error) { CampusUtils.showToast(error.message, "error"); }
    });
    document.getElementById("retry-resume-analysis")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const response = await CampusAPI.post(`/students/${encodeURIComponent(currentUser.id)}/resume/analyze`, {});
            await loadProfile();
            const completed = response.data?.resume?.analysisStatus === "COMPLETED";
            CampusUtils.showToast(completed ? "Resume analysis completed." : response.message || "Resume is saved; analysis still needs attention.", completed ? "success" : "warning");
        } catch (error) { CampusUtils.showToast(error.message || "Could not retry resume analysis.", "error"); }
        finally { button.disabled = false; }
    });
    document.getElementById("resume-download-btn")?.addEventListener("click", async () => {
        try { await CampusUtils.openStudentResume(currentUser.id, true); }
        catch (error) { CampusUtils.showToast(error.message, "error"); }
    });
    document.getElementById("resume-delete-btn")?.addEventListener("click", async () => {
        if (!window.confirm("Delete your current resume? You can upload another one later.")) return;
        try {
            await CampusAPI.request(`/students/${encodeURIComponent(currentUser.id)}/resume`, { method: "DELETE" });
            await loadProfile();
            CampusUtils.showToast("Resume deleted.", "success");
        } catch (error) { CampusUtils.showToast(error.message || "Could not delete resume.", "error"); }
    });

    function updateProfileCompletion(profile) {
        const checks = [
            [Boolean(profile.name), 10, "Name"], [Boolean(profile.phone), 5, "Phone"],
            [Boolean(profile.branch), 10, "Branch"], [profile.graduationYear != null, 10, "Graduation year"],
            [profile.cgpa != null, 10, "CGPA"], [Boolean(profile.skills?.length), 15, "Skills"],
            [Boolean(profile.projects?.some((project) => project.description?.trim())), 15, "Project description"],
            [Boolean(profile.resume?.storedFileName), 15, "Resume"], [Boolean(profile.profilePicture?.fileName), 10, "Profile photo"]
        ];
        const percent = checks.reduce((sum, [complete, weight]) => sum + (complete ? weight : 0), 0);
        const value = document.getElementById("profile-completion-value");
        const bar = document.getElementById("profile-completion-bar");
        const track = document.querySelector(".completion-track");
        const missing = document.getElementById("profile-completion-missing");
        if (value) value.textContent = `${percent}%`;
        if (bar) bar.style.width = `${percent}%`;
        if (track) track.setAttribute("aria-valuenow", String(percent));
        if (missing) missing.textContent = `Missing: ${checks.filter(([complete]) => !complete).map(([, , label]) => label).join(" · ") || "All key profile details are complete."}`;
    }

    function renderProjects(projects) {
        const list = document.getElementById("profile-project-list");
        if (!list) return;
        list.replaceChildren();
        if (!projects.length) {
            const empty = document.createElement("p");
            empty.className = "empty-state compact-empty";
            empty.textContent = "No projects yet. Add one here or upload a resume to extract project details.";
            list.append(empty);
            return;
        }
        projects.forEach((project) => {
            const card = document.createElement("article");
            card.className = "project-item";
            const title = document.createElement("h4");
            title.textContent = project.title || "Untitled project";
            const source = document.createElement("span");
            source.className = `status-badge ${CampusUtils.statusBadgeClass(source.textContent)}`;
            source.textContent = project.source === "resume" ? "From resume" : "Manual";
            const description = document.createElement("p");
            description.textContent = project.description || "No description provided.";
            const details = document.createElement("p");
            details.className = "form-help";
            details.textContent = [project.role, (project.technologies || []).join(", ")].filter(Boolean).join(" · ");
            const links = document.createElement("div");
            links.className = "project-links";
            [["GitHub", project.githubUrl], ["Live demo", project.demoUrl]].forEach(([label, url]) => {
                if (!url) return;
                try { const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol)) return; } catch { return; }
                const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = label; links.append(link);
            });
            const actions = document.createElement("div"); actions.className = "project-actions";
            const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-secondary btn-sm"; edit.textContent = "Edit";
            edit.addEventListener("click", () => startProjectEdit(project));
            const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn btn-secondary btn-sm"; remove.textContent = "Delete";
            remove.addEventListener("click", () => saveProjects((loadedStudentProfile.projects || []).filter((item) => String(item._id) !== String(project._id))));
            actions.append(edit, remove); card.append(title, source, description, details, links, actions); list.append(card);
        });
    }

    function renderResumeNlpAnalysis(profile) {
        const section = document.getElementById("resume-nlp-analysis");
        const counts = document.getElementById("resume-nlp-counts");
        const content = document.getElementById("resume-nlp-sections");
        if (!section || !counts || !content) return;
        const hasParsedResume = Boolean(profile.resume?.originalFileName || profile.resume?.storedFileName);
        section.classList.toggle("hidden", !hasParsedResume);
        if (!hasParsedResume) return;

        const categories = [
            ["Technical Skills", profile.skills || [], (item) => item.name],
            ["Projects", profile.projects || [], (item) => item.title],
            ["Education", profile.education || [], (item) => [item.degree, item.field, item.institution].filter(Boolean).join(" · ")],
            ["Certifications", profile.certifications || [], (item) => [item.name, item.issuer].filter(Boolean).join(" · ")],
            ["Experience", profile.experience || [], (item) => [item.role, item.company].filter(Boolean).join(" · ")]
        ];
        counts.replaceChildren();
        categories.forEach(([label, values]) => {
            const metric = document.createElement("div"); metric.className = "nlp-analysis-count";
            const number = document.createElement("strong"); number.textContent = String(values.length);
            const caption = document.createElement("span"); caption.textContent = label;
            metric.append(number, document.createElement("br"), caption); counts.append(metric);
        });
        content.replaceChildren();
        categories.forEach(([label, values, format]) => {
            const group = document.createElement("section"); group.className = "nlp-analysis-group";
            const heading = document.createElement("h4"); heading.textContent = label; group.append(heading);
            if (!values.length) {
                const empty = document.createElement("p"); empty.className = "form-help"; empty.textContent = "No information extracted."; group.append(empty);
            } else {
                const list = document.createElement(label === "Technical Skills" ? "div" : "ul");
                if (label === "Technical Skills") list.className = "nlp-skill-list";
                values.forEach((item) => {
                    const text = String(format(item) || "").trim();
                    if (!text) return;
                    const entry = document.createElement(label === "Technical Skills" ? "span" : "li");
                    entry.textContent = text;
                    if (label === "Technical Skills") entry.className = "nlp-skill-chip";
                    list.append(entry);
                    if (label === "Technical Skills") list.append(document.createTextNode(" "));
                });
                if (list.childElementCount) group.append(list);
                else { const empty = document.createElement("p"); empty.className = "form-help"; empty.textContent = "No information extracted."; group.append(empty); }
            }
            content.append(group);
        });
    }

    function renderResumeAnalysisState(resume) {
        const state = document.getElementById("resume-analysis-state");
        const retry = document.getElementById("retry-resume-analysis");
        if (!state || !retry) return;
        const status = resume?.analysisStatus;
        state.textContent = status === "COMPLETED" ? "AI Analysis: Complete" : status === "PROCESSING" ? "AI Analysis: Processing" : status === "FAILED" ? `AI Analysis: Needs retry · ${resume.analysisError || "Text could not be extracted."}` : "";
        state.classList.toggle("text-danger", status === "FAILED");
        retry.classList.toggle("hidden", status !== "FAILED");
    }

    function startProjectEdit(project) {
        document.getElementById("project-id").value = project._id || "";
        document.getElementById("project-title").value = project.title || "";
        document.getElementById("project-role").value = project.role || "";
        document.getElementById("project-technologies").value = (project.technologies || []).join(", ");
        document.getElementById("project-github").value = project.githubUrl || "";
        document.getElementById("project-demo").value = project.demoUrl || "";
        document.getElementById("project-description").value = project.description || "";
        document.getElementById("project-save-btn").textContent = "Save project";
        document.getElementById("project-cancel-btn").classList.remove("hidden");
    }

    function clearProjectEditor() {
        ["project-id", "project-title", "project-role", "project-technologies", "project-github", "project-demo", "project-description"].forEach((id) => { document.getElementById(id).value = ""; });
        document.getElementById("project-save-btn").textContent = "Add project";
        document.getElementById("project-cancel-btn").classList.add("hidden");
    }

    async function saveProjects(projects) {
        try {
            const response = await CampusAPI.patch(`/students/${currentUser.id}`, { projects });
            loadedStudentProfile = response.data;
            renderProjects(response.data.projects || []);
            updateProfileCompletion(response.data);
            CampusUtils.showToast("Projects updated.", "success");
            return response.data.projects || [];
        } catch (error) { CampusUtils.showToast(`Could not update projects: ${error.message}`, "error"); throw error; }
    }

    document.getElementById("project-save-btn")?.addEventListener("click", async () => {
        const title = document.getElementById("project-title").value.trim();
        if (!title) return CampusUtils.showToast("Add a project title first.", "error");
        const project = {
            _id: document.getElementById("project-id").value || undefined,
            title, role: document.getElementById("project-role").value.trim(),
            technologies: document.getElementById("project-technologies").value.split(",").map((value) => value.trim()).filter(Boolean),
            githubUrl: document.getElementById("project-github").value.trim(), demoUrl: document.getElementById("project-demo").value.trim(),
            description: document.getElementById("project-description").value.trim(), source: "manual"
        };
        const projects = [...(loadedStudentProfile?.projects || [])];
        const index = projects.findIndex((item) => String(item._id) === String(project._id) && project._id);
        if (index >= 0) projects[index] = project; else projects.push(project);
        try { await saveProjects(projects); clearProjectEditor(); } catch {}
    });
    document.getElementById("project-cancel-btn")?.addEventListener("click", clearProjectEditor);

    async function loadStudentAppearance(profile = null, { requirePicture = false } = {}) {
        const sidebar = document.getElementById("user-avatar");
        const preview = document.getElementById("profile-picture-preview");
        let current = profile || loadedStudentProfile;
        if (!current && currentUser?.id) {
            try { current = (await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}`)).data; loadedStudentProfile = current; }
            catch { current = null; }
        }
        const elements = [sidebar, preview].filter(Boolean);
        elements.forEach((element) => { element.textContent = CampusUtils.getInitials(currentUser?.name); });
        const removeButton = document.getElementById("profile-picture-remove");
        const hasPictureMetadata = Boolean(current?.profilePicture?.fileName || current?.profilePicture?.fileUrl || current?.profilePicture?.publicId);
        if (removeButton) removeButton.classList.toggle("hidden", !hasPictureMetadata);
        // Always ask the protected endpoint for the photo. Some older records
        // have a Cloudinary publicId but no fileName/fileUrl in profile JSON
        // (the id is intentionally select:false), so metadata must not gate display.
        const pictureUrl = current?.profilePicture?.fileUrl || `/students/${encodeURIComponent(currentUser.id)}/profile-picture`;
        try {
            const blob = await CampusAPI.blob(pictureUrl.startsWith('/api/') ? pictureUrl.slice(4) : pictureUrl);
            if (profileAvatarObjectUrl) URL.revokeObjectURL(profileAvatarObjectUrl);
            profileAvatarObjectUrl = URL.createObjectURL(blob);
            elements.forEach((element) => { const image = document.createElement("img"); image.src = profileAvatarObjectUrl; image.alt = "Profile picture"; element.replaceChildren(image); });
            removeButton?.classList.remove("hidden");
            return true;
        } catch (error) {
            removeButton?.classList.add("hidden");
            if (requirePicture) throw new Error(`The photo was uploaded, but its image could not be loaded: ${error.message}`);
            return false; // Keep the initials fallback visible when no picture can be delivered.
        }
    }

    document.getElementById("profile-picture-upload")?.addEventListener("click", async () => {
        const input = document.getElementById("profile-picture-file");
        const file = input.files?.[0];
        if (!file) return CampusUtils.showToast("Choose a photo first.", "error");
        const body = new FormData(); body.append("picture", file);
        const updateProgress = createUploadProgress(input.closest('.profile-picture-controls'), 'Uploading photo');
        const uploadButton = document.getElementById('profile-picture-upload');
        uploadButton.disabled = true;
        try {
            await CampusAPI.uploadWithProgress(`/students/${encodeURIComponent(currentUser.id)}/profile-picture`, body, (percent) => updateProgress(percent));
            updateProgress(100, 'processing');
            const refreshed = await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}`);
            loadedStudentProfile = refreshed.data;
            await loadStudentAppearance(refreshed.data, { requirePicture: true });
            input.value = ""; updateProgress(100, 'done'); CampusUtils.showToast("Profile photo updated.", "success");
        } catch (error) { updateProgress(0, 'error'); CampusUtils.showToast(error.message, "error"); }
        finally { uploadButton.disabled = false; }
    });
    document.getElementById("profile-picture-remove")?.addEventListener("click", async () => {
        try { await CampusAPI.request(`/students/${encodeURIComponent(currentUser.id)}/profile-picture`, { method: "DELETE" }); await loadProfile(); CampusUtils.showToast("Profile photo removed.", "success"); }
        catch (error) { CampusUtils.showToast(error.message, "error"); }
    });

    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!profileForm.reportValidity()) return;

            const graduationYearValue = document.getElementById("profile-graduationYear").value;
            const cgpaValue = document.getElementById("profile-cgpa").value;

            const payload = {
                name: document.getElementById("profile-name").value,
                phone: document.getElementById("profile-phone").value,
                branch: document.getElementById("profile-branch").value,

                graduationYear: graduationYearValue === "" ? null : Number(graduationYearValue),

                cgpa: cgpaValue === "" ? null : Number(cgpaValue),

                backlogs:
                    parseInt(
                        document.getElementById("profile-backlogs").value
                    ) || 0
            };

            const skillsStr =
                document.getElementById("profile-skills").value;

            if (skillsStr) {
                payload.skills = skillsStr
                    .split(",")
                    .map(s => ({
                        name: s.trim(),
                        level: "Intermediate"
                    }))
                    .filter(s => s.name !== "");
            } else {
                payload.skills = [];
            }

            try {
                CampusUtils.setButtonLoading(saveBtn, true);

                await CampusAPI.patch(
                    `/students/${currentUser.id}`,
                    payload
                );

                CampusUtils.showToast(
                    "Profile updated successfully!",
                    "success"
                );

            } catch (err) {
                CampusUtils.showToast(
                    "Failed to update profile: " + err.message,
                    "error"
                );

            } finally {
                CampusUtils.setButtonLoading(saveBtn, false);
            }
        });
    }

    // ==============================
    // RESUME UPLOAD
    // ==============================

    if (resumeUploadForm) {
        resumeUploadForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const file = resumeFileInput.files[0];

            if (!file) {
                CampusUtils.showToast(
                    "Please select a PDF or image resume first.",
                    "error"
                );
                return;
            }

            const formData = new FormData();
            formData.append("resume", file);

            try {
                CampusUtils.setButtonLoading(
                    uploadResumeBtn,
                    true
                );

                resumeUploadStatus.classList.remove("hidden");

                resumeUploadMessage.textContent =
                    "Processing resume... This may take up to 30 seconds.";

                resumeUploadMessage.style.color = "var(--cl-success)";

                const updateProgress = createUploadProgress(resumeUploadStatus, 'Uploading resume');

                const uploadResult = await CampusAPI.uploadWithProgress(
                    `/students/${currentUser.id}/resume`,
                    formData,
                    (percent) => updateProgress(percent)
                );
                updateProgress(100, 'processing');
                resumeUploadForm.reset();
                await loadProfile();
                const analysisComplete = uploadResult.data?.resume?.analysisStatus === "COMPLETED";
                resumeUploadMessage.textContent = analysisComplete
                    ? "Resume uploaded and AI analysis completed."
                    : uploadResult.data?.analysis?.message || uploadResult.message || "Resume uploaded successfully; AI analysis needs attention.";
                resumeUploadMessage.style.color = analysisComplete ? "var(--cl-success)" : "var(--cl-danger)";
                updateProgress(100, 'done');
                CampusUtils.showToast(analysisComplete ? "Resume uploaded and profile analyzed." : "Resume uploaded successfully; AI analysis needs attention.", analysisComplete ? "success" : "warning");

            } catch (err) {
                const progress = resumeUploadStatus.querySelector('.upload-progress');
                if (progress) { progress.dataset.state = 'error'; progress.querySelector('.upload-progress-value').textContent = 'Upload failed'; }
                resumeUploadMessage.textContent =
                    "Upload failed: " + err.message;

                resumeUploadMessage.style.color = "var(--cl-danger)";

                CampusUtils.showToast(
                    "Resume upload failed: " + err.message,
                    "error"
                );

            } finally {
                CampusUtils.setButtonLoading(
                    uploadResumeBtn,
                    false
                );

                setTimeout(() => {
                    if (
                        resumeUploadMessage.style.color === "rgb(21, 87, 36)" ||
                        resumeUploadMessage.style.color === "#155724" ||
                        resumeUploadMessage.style.color === "var(--cl-success)"
                    ) {
                        resumeUploadStatus.classList.add("hidden");
                    }
                }, 3000);
            }
        });
    }

    // ==============================
    // READINESS
    // ==============================

    async function displayReadiness(readiness) {
        const resultsDiv =
            document.getElementById("readiness-results");

        if (!readiness) {
            resultsDiv.classList.add("hidden");
            return;
        }

        resultsDiv.classList.remove("hidden");

        const setProgress = (id, value) => {
            const track = document.getElementById(id)?.closest(".readiness-track");
            const number = Number(value);
            const score = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
            if (track) {
                track.querySelector("span").style.width = `${score}%`;
                track.setAttribute("aria-valuenow", String(Math.round(score)));
            }
        };

        CampusUtils.setText(
            "r-total-score",
            readiness.score
        );
        setProgress("r-total-progress", readiness.score);

        const technicalScore = readiness.technicalSkillsScore || readiness.breakdown?.technicalSkills;
        CampusUtils.setText("r-tech-score", technicalScore);
        setProgress("r-tech-progress", technicalScore);

        const projectsScore = readiness.projectsScore || readiness.breakdown?.projects;
        CampusUtils.setText("r-proj-score", projectsScore);
        setProgress("r-project-progress", projectsScore);

        const academicScore = readiness.academicScore || readiness.breakdown?.academic;
        CampusUtils.setText("r-acad-score", academicScore);
        setProgress("r-academic-progress", academicScore);

        const catEl =
            document.getElementById("r-category");

        catEl.textContent = readiness.category;

        catEl.className =
            "stat-sub " +
            CampusUtils.readinessBadgeClass(readiness.score);

        CampusUtils.setText(
            "r-evidence-coverage",
            readiness.evidenceCoverage
        );
        setProgress("r-evidence-progress", readiness.evidenceCoverage);

        if (
            readiness.missingEvidence &&
            readiness.missingEvidence.length > 0
        ) {
            CampusUtils.setText(
                "r-missing-evidence",
                "Missing data: " +
                readiness.missingEvidence.join(", ")
            );
        } else {
            CampusUtils.setText(
                "r-missing-evidence",
                "All evidence available!"
            );
        }

        const recsList =
            document.getElementById("r-recommendations");

        recsList.innerHTML = "";

        if (
            readiness.recommendations &&
            readiness.recommendations.length > 0
        ) {
            readiness.recommendations.forEach(r => {
                const li =
                    document.createElement("li");

                li.textContent = r;
                recsList.appendChild(li);
            });

        } else if (readiness.improvementAreas) {
            readiness.improvementAreas.forEach(r => {
                const li =
                    document.createElement("li");

                li.textContent =
                    "Improve: " + r;

                recsList.appendChild(li);
            });
        }
    }

    async function loadReadiness() {
        try {
            const res =
                await CampusAPI.get(
                    `/students/${currentUser.id}/readiness`
                );

            displayReadiness(res.data);

        } catch (err) {
            console.error(
                "Failed to load readiness:",
                err
            );
        }
    }

    const analyzeBtn =
        document.getElementById("analyze-readiness-btn");

    if (analyzeBtn) {
        analyzeBtn.addEventListener("click", async () => {
            try {
                CampusUtils.setButtonLoading(
                    analyzeBtn,
                    true,
                    "Analyzing..."
                );

                const res =
                    await CampusAPI.post(
                        `/students/${currentUser.id}/readiness/analyze`
                    );

                displayReadiness(res.data);

                CampusUtils.showToast(
                    "Readiness analysis complete!",
                    "success"
                );

            } catch (err) {
                CampusUtils.showToast(
                    "Analysis failed: " + err.message,
                    "error"
                );

            } finally {
                CampusUtils.setButtonLoading(
                    analyzeBtn,
                    false
                );
            }
        });
    }

    // ==============================
    // JOB BOARD
    // ==============================

    async function loadJobs() {
        try {
            const res =
                await CampusAPI.get("/jobs");
            studentJobsCache = res.data || [];
            const roleFilter = document.getElementById("student-jobs-role");
            if (roleFilter) {
                const previous = roleFilter.value;
                const roles = [...new Set(studentJobsCache.map((job) => job.requirements?.role).filter(Boolean))].sort();
                roleFilter.innerHTML = '<option value="">All roles</option>' + roles.map((role) => `<option>${CampusUtils.escapeHtml(role)}</option>`).join("");
                if (roles.includes(previous)) roleFilter.value = previous;
            }
            renderStudentJobs();
        } catch (err) {
            console.error("Failed to load jobs:", err);
            const container = document.getElementById("jobs-container");
            if (container) container.innerHTML = `<div class="empty-state workspace-error-state"><h3>Could not load job opportunities</h3><p>${CampusUtils.escapeHtml(err.message || "Please try again.")}</p><button type="button" class="btn btn-primary btn-sm" data-retry-student-jobs>Retry</button></div>`;
            CampusUtils.showToast("Failed to load jobs: " + err.message, "error");
        }
    }

    function renderStudentJobs() {
        const container = document.getElementById("jobs-container");
        if (!container) return;
        const query = (document.getElementById("student-jobs-search")?.value || "").trim().toLowerCase();
        const role = document.getElementById("student-jobs-role")?.value || "";
        const sort = document.getElementById("student-jobs-sort")?.value || "title";
        const jobs = studentJobsCache.filter((job) => {
            const skills = [...(job.requirements?.requiredSkills || []), ...(job.requirements?.preferredSkills || [])].join(" ");
            return (!query || `${job.title} ${job.description || ""} ${skills}`.toLowerCase().includes(query)) && (!role || job.requirements?.role === role);
        });
        jobs.sort(sort === "cgpa-desc" ? (a, b) => (b.requirements?.minimumCGPA ?? -1) - (a.requirements?.minimumCGPA ?? -1) : (a, b) => a.title.localeCompare(b.title));
        const resultCount = document.getElementById("student-jobs-result-count");
        if (resultCount) resultCount.textContent = studentJobsCache.length ? `Showing ${jobs.length} of ${studentJobsCache.length} opportunities` : "No opportunities yet";
        if (!jobs.length) {
            container.innerHTML = `<div class="empty-state"><h3>${studentJobsCache.length ? "No jobs match these filters" : "No active job opportunities yet"}</h3><p>${studentJobsCache.length ? "Try a different search or role." : "New active roles will appear here when recruiters publish them."}</p>${studentJobsCache.length ? '<button type="button" class="btn btn-secondary btn-sm" data-clear-student-job-filters>Clear filters</button>' : ''}</div>`;
            return;
        }
        container.innerHTML = jobs.map((job) => {
            const requirements = job.requirements || {};
            const requiredSkills = Array.isArray(requirements.requiredSkills) ? requirements.requiredSkills : [];
            const preferredSkills = Array.isArray(requirements.preferredSkills) ? requirements.preferredSkills : [];
            const allSkills = [...requiredSkills, ...preferredSkills];
            const skillChips = allSkills.length ? `<div class="job-card-skills" aria-label="Job skills">${allSkills.slice(0, 6).map((skill, index) => `<span class="job-skill-chip ${index >= requiredSkills.length ? 'is-preferred' : ''}">${CampusUtils.escapeHtml(skill)}</span>`).join('')}${allSkills.length > 6 ? `<span class="job-skill-chip is-more">+${allSkills.length - 6}</span>` : ''}</div>` : '';
            const eligibility = [requirements.minimumCGPA != null ? `Min CGPA ${CampusUtils.escapeHtml(String(requirements.minimumCGPA))}` : '', requirements.eligibleBranches?.length ? CampusUtils.escapeHtml(requirements.eligibleBranches.join(', ')) : ''].filter(Boolean);
            const role = requirements.role ? `<span class="job-card-role">${CampusUtils.escapeHtml(requirements.role)}</span>` : '';
            return `<article class="job-card"><div class="job-card-heading"><div>${role}<h3>${CampusUtils.escapeHtml(job.title)}</h3><p class="job-card-company">${CampusUtils.escapeHtml(job.companyName || 'Company')}</p></div><span class="job-card-status">${CampusUtils.escapeHtml(job.status || 'active')}</span></div><p class="job-card-description">${CampusUtils.escapeHtml(job.description || '')}</p>${skillChips}${eligibility.length ? `<p class="job-card-eligibility">${eligibility.map((item) => `<span>${item}</span>`).join('')}</p>` : ''}<div class="job-card-footer"><span>Explore role details</span><button class="btn btn-primary" onclick="showJobDetails('${CampusUtils.escapeHtml(job._id)}')">View Details <span aria-hidden="true">→</span></button></div></article>`;
        }).join("");
    }

    ["student-jobs-search", "student-jobs-role", "student-jobs-sort"].forEach((id) => {
        const control = document.getElementById(id);
        control?.addEventListener(control.tagName === "INPUT" ? "input" : "change", renderStudentJobs);
    });
    document.getElementById("jobs-container")?.addEventListener("click", (event) => {
        if (event.target.closest("[data-retry-student-jobs]")) loadJobs();
        if (event.target.closest("[data-clear-student-job-filters]")) {
            document.getElementById("student-jobs-search").value = "";
            document.getElementById("student-jobs-role").value = "";
            document.getElementById("student-jobs-sort").value = "title";
            renderStudentJobs();
        }
    });

    async function showJobDetails(jobId) {
        currentJobId = jobId;

        try {
            const res =
                await CampusAPI.get(
                    `/jobs/${jobId}`
                );

            const job = res.data;

            document
                .getElementById("jobs-view")
                .classList.add("hidden");

            document
                .getElementById("job-details-view")
                .classList.remove("hidden");

            // Clear old match result
            const matchResult = document.getElementById("match-result");
            if (matchResult) {
                matchResult.innerHTML = "";
                matchResult.classList.add("hidden");
            }

            // Reset Apply button
            const applyBtn = document.getElementById("apply-job-btn");
            if (applyBtn) {
                applyBtn.style.display = "inline-block";
                applyBtn.innerHTML = "&#10003; Apply Now";
                applyBtn.disabled = false;
            }

            document.getElementById("job-title").textContent =
                job.title || "";

            document.getElementById("job-company").textContent =
                job.companyName || "Company";

            document.getElementById("job-description").textContent =
                job.description || "";

            const reqs = job.requirements || {};

            const renderSkillChips = (skills, tone) => Array.isArray(skills) && skills.length
                ? skills.map((skill, index) => `<span class="job-skill-chip ${tone} tone-${index % 4}">${CampusUtils.escapeHtml(skill)}</span>`).join("")
                : '<span class="job-detail-empty">None specified</span>';
            document.getElementById("job-required-skills").innerHTML = renderSkillChips(reqs.requiredSkills, 'is-required');
            document.getElementById("job-preferred-skills").innerHTML = renderSkillChips(reqs.preferredSkills, 'is-preferred');

            document.getElementById("job-cgpa").textContent =
                reqs.minimumCGPA ?? "Not specified";

            document.getElementById("job-branches").textContent =
                (reqs.eligibleBranches || []).join(", ") ||
                "All branches";

        } catch (err) {
            console.error(
                "Failed to load job details:",
                err
            );

            CampusUtils.showToast(
                "Failed to load job details: " + err.message,
                "error"
            );
        }
    }

    // ==============================
    // PHASE 7 MATCHING
    // ==============================

    async function checkMatch() {
        if (!currentJobId) {
            CampusUtils.showToast(
                "No job selected.",
                "error"
            );
            return;
        }

        const result =
            document.getElementById("match-result");

        const button =
            document.getElementById("check-match-btn");

        try {
            CampusUtils.setButtonLoading(
                button,
                true
            );

            const res =
                await CampusAPI.post(
                    `/jobs/${currentJobId}/match`
                );

            const m = res.data;

            result.classList.remove("hidden");

            const semantic = m.semanticSimilarity == null ? "Unavailable (no supported embedding adapter)" : `${m.semanticSimilarity}%`;
            const rawMatchScore = Number(m.matchScore);
            const matchScore = Number.isFinite(rawMatchScore) ? Math.max(0, Math.min(100, rawMatchScore)) : 0;
            const facts = (m.explanation?.facts || []).map((fact) => `<div class="match-evidence-row ${fact.passed === false ? "match-fact-failed" : fact.passed === true ? "match-fact-passed" : "match-fact-neutral"}"><span aria-hidden="true">${fact.passed === false ? "✕" : fact.passed === true ? "✓" : "•"}</span><span>${CampusUtils.escapeHtml(fact.text)}</span></div>`).join("");
            const failures = (m.explanation?.eligibilityReasons || []).map((reason) => `<li>${CampusUtils.escapeHtml(reason)}</li>`).join("");
            const skillDetail = m.skillDetail || {};
            const skillChips = (items, tone) => (items || []).length
                ? items.map((skill) => `<span class="match-skill-chip ${tone}">${CampusUtils.escapeHtml(skill)}</span>`).join("")
                : '<span class="match-skill-none">None</span>';
            result.innerHTML = `<section class="match-result-card"><header class="match-result-header"><h3>${m.eligible ? "Why this match?" : "Why not eligible?"}</h3><div class="match-result-badges"><span class="match-score-pill">${CampusUtils.escapeHtml(String(m.matchScore))}/100 · ${CampusUtils.escapeHtml(m.matchCategory || "")}</span><span class="match-eligibility-pill ${m.eligible ? "is-eligible" : "is-ineligible"}">${m.eligible ? "Eligible" : "Not Eligible"}</span></div></header><div class="match-score-track" role="progressbar" aria-label="Match score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${matchScore}"><span style="width:${matchScore}%"></span></div><h4>Match breakdown</h4><div class="match-breakdown-grid"><div class="is-skill"><span>Skill match</span><strong>${m.breakdown?.skillMatch ?? 0}%</strong></div><div class="is-project"><span>Project relevance</span><strong>${m.breakdown?.projectRelevance ?? 0}%</strong></div><div class="is-academic"><span>Academic fit</span><strong>${m.breakdown?.academicFit ?? 0}%</strong></div><div class="is-evidence"><span>Evidence coverage</span><strong>${m.breakdown?.evidenceCoverage == null ? 'Unavailable' : `${m.breakdown.evidenceCoverage}%`}</strong></div></div><div class="match-semantic"><strong>Semantic similarity</strong><span>${CampusUtils.escapeHtml(semantic)}</span></div><h4>Skill coverage</h4><div class="match-skill-grid"><div><strong>Required · matched</strong><div>${skillChips(skillDetail.matchedRequired, 'is-matched')}</div></div><div><strong>Required · missing</strong><div>${skillChips(skillDetail.missingRequired, 'is-missing')}</div></div><div><strong>Preferred · matched</strong><div>${skillChips(skillDetail.matchedPreferred, 'is-matched')}</div></div><div><strong>Preferred · missing</strong><div>${skillChips(skillDetail.missingPreferred, 'is-warning')}</div></div></div>${m.eligible ? "" : `<h4>Eligibility requirements not met</h4><ul>${failures || "<li>No eligibility failure was returned.</li>"}</ul>`}<h4>Evidence</h4><div class="match-evidence-list">${facts || '<p class="text-muted">No evidence details are available.</p>'}</div></section>`;

        } catch (err) {
            CampusUtils.showToast(
                "Match failed: " + err.message,
                "error"
            );

        } finally {
            CampusUtils.setButtonLoading(
                button,
                false
            );
        }
    }

    const checkMatchBtn =
        document.getElementById("check-match-btn");

    if (checkMatchBtn) {
        checkMatchBtn.addEventListener(
            "click",
            checkMatch
        );
    }

    window.showJobDetails = showJobDetails;
    window.checkMatch = checkMatch;

    window.closeJobDetails = function () {
        document
            .getElementById("job-details-view")
            .classList.add("hidden");

        document
            .getElementById("jobs-view")
            .classList.remove("hidden");

        // Re-fetch from server so deleted jobs don't persist in the list
        loadJobs();
    };

    // ==============================
    // PHASE 8 — APPLICATIONS
    // ==============================

    async function loadApplications() {
        const tbody = document.getElementById("applications-list");
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;

        try {
            const res = await CampusAPI.get(`/students/${currentUser.id}/applications`);
            studentApplicationsCache = res.data || [];
            const statusSelect = document.getElementById("student-applications-status");
            const statuses = [...new Set(studentApplicationsCache.map((app) => app.status).filter(Boolean))].sort();
            if (statusSelect) {
                const previous = statusSelect.value;
                statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map((status) => `<option>${CampusUtils.escapeHtml(status)}</option>`).join("");
                if (statuses.includes(previous)) statusSelect.value = previous;
            }
            renderStudentApplications();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">Failed to load applications: ${CampusUtils.escapeHtml(err.message)}</td></tr>`;
            CampusUtils.showToast("Failed to load applications: " + err.message, "error");
        }
    }

    function renderStudentApplications() {
        const tbody = document.getElementById("applications-list");
        if (!tbody) return;
        const query = (document.getElementById("student-applications-search")?.value || "").trim().toLowerCase();
        const statusFilter = document.getElementById("student-applications-status")?.value || "";
        const sort = document.getElementById("student-applications-sort")?.value || "date-desc";
        const apps = studentApplicationsCache.filter((app) => (!statusFilter || app.status === statusFilter) && (!query || `${app.jobId?.title || ""} ${app.jobId?.companyName || ""}`.toLowerCase().includes(query)));
        apps.sort(sort === "date-asc" ? (a, b) => new Date(a.appliedAt) - new Date(b.appliedAt) : sort === "match-desc" ? (a, b) => (b.matching?.finalScore ?? -1) - (a.matching?.finalScore ?? -1) : (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
        if (!apps.length) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>${studentApplicationsCache.length ? "No applications match these filters" : "No applications yet"}</h3><p>${studentApplicationsCache.length ? "Try another search or status." : "Applications you submit to campus opportunities will appear here."}</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = apps.map(app => {
                const title = CampusUtils.escapeHtml(app.jobId?.title || "Unknown Job");
                const company = CampusUtils.escapeHtml(app.jobId?.companyName || "Company information unavailable");
                const status = CampusUtils.escapeHtml(app.status || "Applied");
                const eligible = app.eligibility?.isEligible === true ? 'Eligible' : app.eligibility?.isEligible === false ? 'Ineligible' : 'Not assessed';
                const appliedOn = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : "—";
                const score = (app.matching && app.matching.finalScore != null) ? app.matching.finalScore + "/100" : "—";
                const drive = app.driveId ? `${CampusUtils.formatDate(app.driveId.date)} · ${CampusUtils.escapeHtml([app.driveId.startTime, app.driveId.endTime].filter(Boolean).join('–') || 'Time not set')}${app.driveId.venue ? ` · ${CampusUtils.escapeHtml(app.driveId.venue)}` : ''}` : 'No interview schedule yet';
                return `
                    <tr>
                        <td>${title}</td>
                        <td>${company}</td>
                        <td><span class="status-badge ${CampusUtils.statusBadgeClass(app.status || 'Applied')} ${app.status === 'Offer' ? 'status-offer' : ''}">${status}</span></td>
                        <td><span class="status-badge ${eligible === 'Eligible' ? 'status-success' : eligible === 'Ineligible' ? 'status-danger' : 'status-neutral'}">${eligible}</span></td>
                        <td>${score}</td>
                        <td>${appliedOn}</td>
                        <td>${drive}</td>
                    </tr>`;
            }).join("");
    }

    async function loadStudentDrives() {
        const tbody = document.getElementById("student-drives-list");
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading drives…</td></tr>';
        try {
            const response = await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}/applications`);
            const drives = new Map();
            (response.data || []).filter((application) => application.driveId).forEach((application) => {
                const drive = application.driveId;
                const id = String(drive._id || drive.id || drive);
                if (!drives.has(id)) drives.set(id, { drive, job: application.jobId, status: application.status });
            });
            const rows = [...drives.values()];
            tbody.innerHTML = rows.length ? rows.map(({ drive, job, status }) => `<tr><td>${CampusUtils.escapeHtml(job?.title || "Campus drive")}</td><td>${CampusUtils.formatDate(drive.date)}</td><td>${CampusUtils.escapeHtml([drive.startTime, drive.endTime].filter(Boolean).join("–") || "—")}</td><td>${CampusUtils.escapeHtml(drive.venue || "—")}</td><td>${CampusUtils.escapeHtml(drive.mode || "—")}</td><td><span class="status-badge ${CampusUtils.statusBadgeClass(status || 'Applied')} ${status === 'Offer' ? 'status-offer' : ''}">${CampusUtils.escapeHtml(status || "Applied")}</span></td></tr>`).join("") : '<tr><td colspan="6"><div class="empty-state"><h3>No drives linked to your applications yet</h3><p>Drive schedules for jobs you have applied to will appear here.</p></div></td></tr>';
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Could not load your drives: ${CampusUtils.escapeHtml(error.message)}</td></tr>`;
        }
    }

    async function loadOffers() {
        const tbody = document.getElementById("offers-list");
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading offers...</td></tr>';
        try {
            const response = await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}/offers`);
            const offers = response.data || [];
            studentOffersCache = offers;
            document.getElementById("offers-count").textContent = offers.length;
            const statusSelect = document.getElementById("student-offers-status");
            const statuses = [...new Set(offers.map((offer) => offer.offerStatus).filter(Boolean))].sort();
            if (statusSelect) {
                const previous = statusSelect.value;
                statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map((status) => `<option>${CampusUtils.escapeHtml(status)}</option>`).join("");
                if (statuses.includes(previous)) statusSelect.value = previous;
            }
            renderStudentOffers();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">Could not load offers: ${CampusUtils.escapeHtml(err.message)}</td></tr>`;
        }
    }

    function renderStudentOffers() {
        const tbody = document.getElementById("offers-list");
        if (!tbody) return;
        const query = (document.getElementById("student-offers-search")?.value || "").trim().toLowerCase();
        const statusFilter = document.getElementById("student-offers-status")?.value || "";
        const offers = studentOffersCache.filter((offer) => (!statusFilter || offer.offerStatus === statusFilter) && (!query || `${offer.companyName || ""} ${offer.role || ""}`.toLowerCase().includes(query)));
        if (!offers.length) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>${studentOffersCache.length ? "No offers match these filters" : "No offers yet"}</h3><p>${studentOffersCache.length ? "Try another search or status." : "Offers appear here once a recruiter sends them."}</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = offers.map((offer) => {
                const date = offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString() : "—";
                const ctc = `₹${Number(offer.ctc).toLocaleString("en-IN")}`;
                const required = (offer.documents || []).map((item, index) => ({ ...item, documentIndex: index })).filter((item) => item.required !== false);
                const verificationStatus = (doc) => doc.verificationStatus || (doc.status === 'Verified' ? 'VERIFIED' : doc.status === 'Rejected' ? 'REJECTED' : doc.status === 'Submitted' ? 'NEEDS_REVIEW' : 'PENDING');
                const verified = required.filter((item) => verificationStatus(item) === 'VERIFIED').length;
                const documentProgress = required.length ? `${verified}/${required.length} verified` : 'No required documents';
                const documents = required.length ? `<div class="student-document-list">${required.map((doc) => { const state = verificationStatus(doc); const verification = doc.verification; const checks = verification?.checks?.map((check) => `${check.passed ? '✓' : '✕'} ${CampusUtils.escapeHtml(check.label)}${check.reason && !check.passed ? `: ${CampusUtils.escapeHtml(check.reason)}` : ''}`).join('<br>'); const verificationLabel = state === 'VERIFIED' ? (doc.verificationMethod === 'AI' ? 'AI Verified' : doc.verificationMethod === 'MANUAL' ? 'Manually verified' : 'Verified') : state === 'NEEDS_REVIEW' ? 'Manual checking required' : state; const report = verification || state !== 'PENDING' ? `<small class="document-verification"><strong>Verification · ${CampusUtils.escapeHtml(verificationLabel)}</strong>${checks ? `<br>${checks}` : ''}${verification?.reason ? `<br>${CampusUtils.escapeHtml(verification.reason)}` : ''}${verification?.confidence != null ? `<br>Confidence: ${Number(verification.confidence)}%` : ''}</small>` : ''; const canChange = ['Accepted', 'Documentation Pending'].includes(offer.offerStatus) && state !== 'VERIFIED'; return `<div class="student-document-row ${state === 'NEEDS_REVIEW' ? 'is-needs-review' : state === 'REJECTED' ? 'is-rejected' : state === 'VERIFIED' ? 'is-verified' : ''}"><span><strong>${CampusUtils.escapeHtml(doc.name)}</strong><small>${CampusUtils.escapeHtml(doc.status || 'Pending')}${doc.originalFileName ? ` · ${CampusUtils.escapeHtml(doc.originalFileName)}` : ''}${doc.rejectionReason ? ` · Reason: ${CampusUtils.escapeHtml(doc.rejectionReason)}` : ''}</small>${report}</span>${doc.hasFile ? `<button class="btn btn-secondary btn-sm" data-document-view="${offer._id}" data-document-index="${doc.documentIndex}">Preview</button><button class="btn btn-secondary btn-sm" data-document-download="${offer._id}" data-document-index="${doc.documentIndex}" data-file-name="${CampusUtils.escapeHtml(doc.originalFileName || doc.name)}">Download</button>` : ''}${canChange ? `<label class="btn btn-secondary btn-sm upload-document-label">${state === 'REJECTED' ? 'Resubmit' : doc.hasFile ? 'Replace' : 'Upload'}<input type="file" accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" data-document-upload="${offer._id}" data-document-index="${doc.documentIndex}" aria-label="Upload ${CampusUtils.escapeHtml(doc.name)} as PDF or image"></label>` : ''}${canChange && doc.hasFile ? `<button class="btn btn-secondary btn-sm" data-document-delete="${offer._id}" data-document-index="${doc.documentIndex}">Delete</button>` : ''}</div>`; }).join('')}</div>` : '<span class="text-muted">No required documents</span>';
                const canDecide = ['Offer Sent', 'Pending'].includes(offer.offerStatus);
                const actions = canDecide ? `<button class="btn btn-primary btn-sm" data-offer-decision="${offer._id}" data-status="Accepted">Accept</button> <button class="btn btn-secondary btn-sm" data-offer-decision="${offer._id}" data-status="Declined">Decline</button>` : ['Declined', 'Joining Confirmed'].includes(offer.offerStatus) ? (offer.offerStatus === 'Declined' ? '✕ Declined · Application closed' : '✓ Joining confirmed · Workflow completed') : '—';
                return `<tr><td>${CampusUtils.escapeHtml(offer.companyName)}</td><td>${CampusUtils.escapeHtml(offer.role)}</td><td>${ctc}</td><td><span class="status-badge ${CampusUtils.statusBadgeClass(offer.offerStatus)}">${CampusUtils.escapeHtml(offer.offerStatus)}</span></td><td>${date}</td><td><div>${documentProgress}</div>${documents}</td><td>${actions}</td></tr>`;
            }).join("");
        tbody.querySelectorAll('[data-offer-decision]').forEach((button) => button.addEventListener('click', async () => {
            if (button.dataset.status === 'Declined' && !window.confirm('Decline this offer? This decision is final.')) return;
            try { await CampusAPI.patch(`/offers/${encodeURIComponent(button.dataset.offerDecision)}/status`, { status: button.dataset.status }); await loadOffers(); await loadNotifications(); }
            catch (error) { CampusUtils.showToast(error.message, 'error'); }
        }));
        tbody.querySelectorAll('[data-document-upload]').forEach((input) => input.addEventListener('change', async () => {
            const file = input.files?.[0]; if (!file) return;
            if (!['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) { CampusUtils.showToast('Upload a PDF, JPG, JPEG, PNG, or WebP document.', 'error'); input.value = ''; return; }
            const body = new FormData(); body.append('document', file);
            const host = input.closest('.student-document-row');
            const updateProgress = createUploadProgress(host, 'Uploading document');
            input.disabled = true;
            try { await CampusAPI.uploadWithProgress(`/offers/${encodeURIComponent(input.dataset.documentUpload)}/documents/${input.dataset.documentIndex}/upload`, body, (percent) => updateProgress(percent)); updateProgress(100, 'processing'); CampusUtils.showToast('Document submitted for review.', 'success'); updateProgress(100, 'done'); await loadOffers(); }
            catch (error) { updateProgress(0, 'error'); CampusUtils.showToast(error.message, 'error'); input.value = ''; }
            finally { input.disabled = false; }
        }));
        const openDocumentFile = async (button, download) => {
            try {
                const suffix = download ? '?download=1' : '';
                const offerId = button.dataset.documentView || button.dataset.documentDownload;
                const blob = await CampusAPI.blob(`/offers/${encodeURIComponent(offerId)}/documents/${button.dataset.documentIndex}/file${suffix}`);
                const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.rel = 'noopener';
                if (download) link.download = button.dataset.fileName || 'document'; else link.target = '_blank';
                document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
            } catch (error) { CampusUtils.showToast(error.message, 'error'); }
        };
        tbody.querySelectorAll('[data-document-view]').forEach((button) => button.addEventListener('click', () => openDocumentFile(button, false)));
        tbody.querySelectorAll('[data-document-download]').forEach((button) => button.addEventListener('click', () => openDocumentFile(button, true)));
        tbody.querySelectorAll('[data-document-delete]').forEach((button) => button.addEventListener('click', async () => {
            if (!window.confirm('Delete this submitted document? You can upload it again while documentation is open.')) return;
            try { await CampusAPI.request(`/offers/${encodeURIComponent(button.dataset.documentDelete)}/documents/${button.dataset.documentIndex}`, { method: 'DELETE' }); CampusUtils.showToast('Document removed.', 'success'); await loadOffers(); }
            catch (error) { CampusUtils.showToast(error.message || 'Could not remove document.', 'error'); }
        }));
    }

    [["student-applications-search", renderStudentApplications], ["student-applications-status", renderStudentApplications], ["student-applications-sort", renderStudentApplications], ["student-offers-search", renderStudentOffers], ["student-offers-status", renderStudentOffers]].forEach(([id, handler]) => {
        const control = document.getElementById(id);
        control?.addEventListener(control.tagName === "INPUT" ? "input" : "change", handler);
    });

    async function applyToJob() {
        if (!currentJobId) return;
        const button = document.getElementById("apply-job-btn");
        try {
            if (button) CampusUtils.setButtonLoading(button, true);
            await CampusAPI.post("/applications", { jobId: currentJobId });
            CampusUtils.showToast("Successfully applied!", "success");
            loadNotifications();
            if (button) {
                button.textContent = "Applied";
                button.disabled = true;
            }
        } catch (err) {
            if (err.code === "ALREADY_APPLIED") {
                CampusUtils.showToast("You have already applied to this job.", "info");
                if (button) {
                    button.textContent = "Already Applied";
                    button.disabled = true;
                }
            } else {
                CampusUtils.showToast("Failed to apply: " + err.message, "error");
            }
        } finally {
            if (button && !button.disabled) CampusUtils.setButtonLoading(button, false);
        }
    }

    const applyJobBtn = document.getElementById("apply-job-btn");
    if (applyJobBtn) {
        applyJobBtn.addEventListener("click", applyToJob);
    }

    console.log(
        "[Student] Dashboard initialized (Phase 4 + Job Board + Phase 7 Matching + Phase 8 Applications)."
    );
});

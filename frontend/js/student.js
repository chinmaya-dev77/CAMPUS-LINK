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
        const loadCount = async (endpoint, id) => {
            try {
                const response = await CampusAPI.get(endpoint);
                setMetric(id, Array.isArray(response.data) ? String(response.data.length) : "Unavailable");
            } catch {
                setMetric(id, "Unavailable");
            }
        };

        const readinessTask = (async () => {
            try {
                const response = await CampusAPI.get(`${studentPath}/readiness`);
                const score = response.data?.score;
                setMetric("readiness-score", score == null ? "Not assessed" : String(score));
            } catch (error) {
                setMetric("readiness-score", error.status === 404 ? "Not assessed" : "Unavailable");
            }
        })();
        const applicationsTask = loadCount(`${studentPath}/applications`, "applications-count");
        const offersTask = loadCount(`${studentPath}/offers`, "offers-count");
        const matchedJobsTask = (async () => {
            try {
                const response = await CampusAPI.get("/jobs");
                if (!Array.isArray(response.data)) throw new Error("Jobs response unavailable");
                const matches = await Promise.all(response.data.map((job) =>
                    CampusAPI.post(`/jobs/${encodeURIComponent(job._id)}/match`)
                ));
                setMetric("matched-jobs", String(matches.filter((match) => match.data?.eligible === true).length));
            } catch {
                setMetric("matched-jobs", "Unavailable");
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

            // Hide all views
            dashboardView.classList.add("hidden");
            profileView.classList.add("hidden");

            const readinessView = document.getElementById("readiness-view");
            const jobsView = document.getElementById("jobs-view");
            const jobDetailsView = document.getElementById("job-details-view");
            const applicationsView = document.getElementById("applications-view");
            const offersView = document.getElementById("offers-view");

            if (readinessView) readinessView.classList.add("hidden");
            if (jobsView) jobsView.classList.add("hidden");
            if (jobDetailsView) jobDetailsView.classList.add("hidden");
            if (applicationsView) applicationsView.classList.add("hidden");
            if (offersView) offersView.classList.add("hidden");

            // Show selected section
            if (section === "dashboard") {
                dashboardView.classList.remove("hidden");
                loadDashboardMetrics();

            } else if (section === "profile") {
                profileView.classList.remove("hidden");
                loadProfile();

            } else if (section === "readiness") {
                if (readinessView) {
                    readinessView.classList.remove("hidden");
                }
                loadReadiness();

            } else if (section === "applications") {
                if (applicationsView) {
                    applicationsView.classList.remove("hidden");
                    loadApplications();
                }

            } else if (section === "offers") {
                if (offersView) offersView.classList.remove("hidden");
                loadOffers();

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
                profile.cgpa || "";

            document.getElementById("profile-backlogs").value =
                profile.backlogs || 0;

            if (profile.skills && Array.isArray(profile.skills)) {
                document.getElementById("profile-skills").value =
                    profile.skills.map(s => s.name).join(", ");
            }
            renderProjects(profile.projects || []);
            updateProfileCompletion(profile);
            await loadStudentAppearance(profile);

            if (profile.resume && profile.resume.originalFileName) {
                resumeCurrentFile.classList.remove("hidden");
                resumeFilenameDisplay.textContent =
                    profile.resume.originalFileName;
            } else {
                resumeCurrentFile.classList.add("hidden");
            }

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
    document.getElementById("resume-download-btn")?.addEventListener("click", async () => {
        try { await CampusUtils.openStudentResume(currentUser.id, true); }
        catch (error) { CampusUtils.showToast(error.message, "error"); }
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
            source.className = "status-badge";
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

    async function loadStudentAppearance(profile = null) {
        const sidebar = document.getElementById("user-avatar");
        const preview = document.getElementById("profile-picture-preview");
        let current = profile || loadedStudentProfile;
        if (!current && currentUser?.id) {
            try { current = (await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}`)).data; loadedStudentProfile = current; }
            catch { current = null; }
        }
        const elements = [sidebar, preview].filter(Boolean);
        elements.forEach((element) => { element.textContent = CampusUtils.getInitials(currentUser?.name); });
        if (document.getElementById("profile-picture-remove")) document.getElementById("profile-picture-remove").classList.toggle("hidden", !current?.profilePicture?.fileName);
        if (!current?.profilePicture?.fileName) return;
        try {
            const blob = await CampusAPI.blob(`/students/${encodeURIComponent(currentUser.id)}/profile-picture`);
            if (profileAvatarObjectUrl) URL.revokeObjectURL(profileAvatarObjectUrl);
            profileAvatarObjectUrl = URL.createObjectURL(blob);
            elements.forEach((element) => { const image = document.createElement("img"); image.src = profileAvatarObjectUrl; image.alt = "Profile picture"; element.replaceChildren(image); });
        } catch { /* The initials fallback remains visible if the image is unavailable. */ }
    }

    document.getElementById("profile-picture-upload")?.addEventListener("click", async () => {
        const input = document.getElementById("profile-picture-file");
        const file = input.files?.[0];
        if (!file) return CampusUtils.showToast("Choose a photo first.", "error");
        const body = new FormData(); body.append("picture", file);
        try {
            await CampusAPI.upload(`/students/${encodeURIComponent(currentUser.id)}/profile-picture`, body);
            await loadProfile(); input.value = ""; CampusUtils.showToast("Profile photo updated.", "success");
        } catch (error) { CampusUtils.showToast(error.message, "error"); }
    });
    document.getElementById("profile-picture-remove")?.addEventListener("click", async () => {
        try { await CampusAPI.request(`/students/${encodeURIComponent(currentUser.id)}/profile-picture`, { method: "DELETE" }); await loadProfile(); CampusUtils.showToast("Profile photo removed.", "success"); }
        catch (error) { CampusUtils.showToast(error.message, "error"); }
    });

    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const payload = {
                name: document.getElementById("profile-name").value,
                phone: document.getElementById("profile-phone").value,
                branch: document.getElementById("profile-branch").value,

                graduationYear:
                    parseInt(
                        document.getElementById("profile-graduationYear").value
                    ) || null,

                cgpa:
                    parseFloat(
                        document.getElementById("profile-cgpa").value
                    ) || null,

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
                    "Please select a PDF file first.",
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

                resumeUploadMessage.style.color = "#155724";

                await CampusAPI.upload(
                    `/students/${currentUser.id}/resume`,
                    formData
                );

                CampusUtils.showToast(
                    "Resume parsed and profile updated successfully!",
                    "success"
                );

                resumeUploadForm.reset();
                await loadProfile();

            } catch (err) {
                resumeUploadMessage.textContent =
                    "Error: " + err.message;

                resumeUploadMessage.style.color = "#721c24";

                CampusUtils.showToast(
                    "Failed to process resume: " + err.message,
                    "error"
                );

            } finally {
                CampusUtils.setButtonLoading(
                    uploadResumeBtn,
                    false
                );

                setTimeout(() => {
                    if (
                        resumeUploadMessage.style.color ===
                            "rgb(21, 87, 36)" ||
                        resumeUploadMessage.style.color === "#155724"
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

        CampusUtils.setText(
            "r-total-score",
            readiness.score
        );

        CampusUtils.setText(
            "r-tech-score",
            readiness.technicalSkillsScore ||
            readiness.breakdown?.technicalSkills
        );

        CampusUtils.setText(
            "r-proj-score",
            readiness.projectsScore ||
            readiness.breakdown?.projects
        );

        CampusUtils.setText(
            "r-acad-score",
            readiness.academicScore ||
            readiness.breakdown?.academic
        );

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

            const jobs = res.data;

            const container =
                document.getElementById("jobs-container");

            if (!container) return;

            if (!jobs || jobs.length === 0) {
                container.innerHTML =
                    "<p>No active job opportunities available.</p>";
                return;
            }

            container.innerHTML = jobs.map(job => `
                <div class="job-card">
                    <h3>
                        ${CampusUtils.escapeHtml(job.title)}
                    </h3>

                    <p>
                        <strong>Company:</strong>
                        ${CampusUtils.escapeHtml(
                            job.companyName || "Company"
                        )}
                    </p>

                    <p>
                        ${CampusUtils.escapeHtml(
                            job.description || ""
                        )}
                    </p>

                    <button
                        class="btn btn-primary"
                        onclick="showJobDetails('${job._id}')">
                        View Details
                    </button>
                </div>
            `).join("");

        } catch (err) {
            console.error(
                "Failed to load jobs:",
                err
            );

            CampusUtils.showToast(
                "Failed to load jobs: " + err.message,
                "error"
            );
        }
    }

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

            document.getElementById("job-required-skills").textContent =
                (reqs.requiredSkills || []).join(", ") ||
                "None specified";

            document.getElementById("job-preferred-skills").textContent =
                (reqs.preferredSkills || []).join(", ") ||
                "None specified";

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

            result.innerHTML = `
                <h3>Match Result</h3>

                <p>
                    <strong>Score:</strong>
                    ${m.matchScore}/100
                </p>

                <p>
                    <strong>Category:</strong>
                    ${CampusUtils.escapeHtml(
                        m.matchCategory || ""
                    )}
                </p>

                <p>
                    <strong>Eligibility:</strong>
                    ${m.eligible ? "Eligible" : "Not Eligible"}
                </p>

                <p>
                    <strong>Matched Required Skills:</strong>
                    ${CampusUtils.escapeHtml(
                        (m.skillDetail?.matchedRequired || []).join(", ") ||
                        "None"
                    )}
                </p>

                <p>
                    <strong>Missing Required Skills:</strong>
                    ${CampusUtils.escapeHtml(
                        (m.skillDetail?.missingRequired || []).join(", ") ||
                        "None"
                    )}
                </p>
            `;

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
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">Loading...</td></tr>`;

        try {
            const res = await CampusAPI.get(`/students/${currentUser.id}/applications`);
            const apps = res.data;

            if (!apps || apps.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center">No applications yet. Browse Jobs to apply.</td></tr>`;
                return;
            }

            tbody.innerHTML = apps.map(app => {
                const title = CampusUtils.escapeHtml(app.jobId?.title || "Unknown Job");
                const company = CampusUtils.escapeHtml(app.jobId?.companyName || "—");
                const status = CampusUtils.escapeHtml(app.status || "Applied");
                const appliedOn = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : "—";
                const score = (app.matching && app.matching.finalScore != null) ? app.matching.finalScore + "/100" : "—";
                return `
                    <tr>
                        <td>${title}</td>
                        <td>${company}</td>
                        <td><span class="badge">${status}</span></td>
                        <td>${score}</td>
                        <td>${appliedOn}</td>
                    </tr>`;
            }).join("");

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">Failed to load applications.</td></tr>`;
            CampusUtils.showToast("Failed to load applications: " + err.message, "error");
        }
    }

    async function loadOffers() {
        const tbody = document.getElementById("offers-list");
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading offers...</td></tr>';
        try {
            const response = await CampusAPI.get(`/students/${encodeURIComponent(currentUser.id)}/offers`);
            const offers = response.data || [];
            document.getElementById("offers-count").textContent = offers.length;
            if (!offers.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No offers yet. Offers appear here after selection.</td></tr>';
                return;
            }
            tbody.innerHTML = offers.map((offer) => {
                const date = offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString() : "—";
                const ctc = `₹${Number(offer.ctc).toLocaleString("en-IN")}`;
                return `<tr><td>${CampusUtils.escapeHtml(offer.companyName)}</td><td>${CampusUtils.escapeHtml(offer.role)}</td><td>${ctc}</td><td><span class="badge">${CampusUtils.escapeHtml(offer.offerStatus)}</span></td><td>${date}</td><td>${CampusUtils.escapeHtml(offer.documentStatus || "Pending")}</td></tr>`;
            }).join("");
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Could not load offers: ${CampusUtils.escapeHtml(err.message)}</td></tr>`;
        }
    }

    async function applyToJob() {
        if (!currentJobId) return;
        const button = document.getElementById("apply-job-btn");
        try {
            if (button) CampusUtils.setButtonLoading(button, true);
            await CampusAPI.post("/applications", { jobId: currentJobId });
            CampusUtils.showToast("Successfully applied!", "success");
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

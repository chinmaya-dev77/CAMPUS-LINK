/**
 * CampusLink — recruiter.js
 * Recruiter dashboard logic.
 * Phase 5: Recruiter + Job CRUD
 * Phase 6: JD AI analysis
 * Phase 7: Candidate matching
 * Phase 8: Applications per job + Drive create/view + Shortlisting
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    CampusAuth.requireRole("recruiter");
    CampusAuth.populateSidebarUser();
    CampusAuth.attachLogoutHandler();

    // Navigation logic
    const links = document.querySelectorAll('.sidebar-link');
    const sections = document.querySelectorAll('.content-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-section');

            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            sections.forEach(sec => sec.style.display = 'none');
            const sec = document.getElementById('section-' + target);
            if (sec) sec.style.display = 'block';

            document.getElementById('page-title').textContent = link.textContent.trim();

            if (target === 'profile') loadProfile();
            if (target === 'jobs') loadJobs();
            if (target === 'dashboard') loadDashboard();
            if (target === 'drives') loadDrives();
            if (target === 'offers') loadRecruiterOffers();
        });
    });

    document.getElementById('recruiter-refresh-offers')?.addEventListener('click', loadRecruiterOffers);

    async function loadRecruiterOffers() {
        const selectedBody = document.getElementById('recruiter-selected-list');
        const offerBody = document.getElementById('recruiter-offers-list');
        if (!selectedBody || !offerBody) return;
        selectedBody.innerHTML = '<tr><td colspan="4">Loading selected candidates...</td></tr>';
        offerBody.innerHTML = '<tr><td colspan="7">Loading offers...</td></tr>';
        try {
            const user = CampusAuth.getCurrentUser();
            const [jobsResponse, offersResponse] = await Promise.all([CampusAPI.get(`/jobs?recruiterId=${encodeURIComponent(user.id)}`), CampusAPI.get('/offers')]);
            const offers = offersResponse.data || [];
            const existing = new Set(offers.map((offer) => offer.applicationId?._id || offer.applicationId));
            const selected = (await Promise.all((jobsResponse.data || []).map(async (job) => {
                const response = await CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/applications`);
                return (response.data || []).filter((app) => app.status === 'Selected').map((app) => ({ ...app, job }));
            }))).flat();
            const pending = selected.filter((app) => !existing.has(app._id));
            selectedBody.innerHTML = pending.length ? pending.map((app) => `<tr><td>${CampusUtils.studentAvatarMarkup(app.studentId?.name, app.studentId?._id)} ${CampusUtils.escapeHtml(app.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(app.job.requirements?.role || app.job.title)}</td><td><span class="status-badge status-success">Selected</span></td><td><button class="btn btn-primary btn-sm" data-create-offer="${app._id}">Create offer</button></td></tr>`).join('') : '<tr><td colspan="4">No selected candidates awaiting offers.</td></tr>';
            CampusUtils.hydrateStudentAvatars(selectedBody);
            selectedBody.querySelectorAll('[data-create-offer]').forEach((button) => button.addEventListener('click', async () => {
                const values = await CampusUtils.requestForm('Create Offer', [
                    { name: 'ctc', label: 'Annual CTC/package in rupees', type: 'number', min: '0', step: 'any', required: true },
                    { name: 'joiningDate', label: 'Joining date (optional)', type: 'date' }
                ]);
                if (!values) return;
                try { await CampusAPI.post('/offers', { applicationId: button.dataset.createOffer, ctc: Number(values.ctc), ...(values.joiningDate ? { joiningDate: values.joiningDate } : {}) }); CampusUtils.showToast('Offer created.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            const nextStatusesByCurrentStatus = {
                'Selected': ['Offer Generated'],
                'Offer Generated': ['Offer Sent'],
                'Offer Sent': ['Pending', 'Accepted', 'Declined'],
                'Pending': ['Accepted', 'Declined'],
                'Accepted': ['Documentation Pending'],
                'Documentation Pending': ['Documents Verified'],
                'Documents Verified': ['Joining Confirmed'],
                'Declined': [],
                'Joining Confirmed': []
            };
            offerBody.innerHTML = offers.length ? offers.map((offer) => {
                const nextStatuses = nextStatusesByCurrentStatus[offer.offerStatus] || [];
                const documentAction = ['Accepted', 'Documentation Pending'].includes(offer.offerStatus)
                    ? `<button class="btn btn-secondary btn-sm" data-docs="${offer._id}">Update documents</button> `
                    : '';
                const statusControl = nextStatuses.length
                    ? `<select data-status="${offer._id}"><option value="">Update status…</option>${nextStatuses.map((status) => `<option>${status}</option>`).join('')}</select>`
                    : '';
                const joiningDateAction = `<button class="btn btn-secondary btn-sm" data-joining-date="${offer._id}">${offer.joiningDate ? 'Edit' : 'Set'} joining date</button> `;
                return `<tr><td>${CampusUtils.studentAvatarMarkup(offer.studentId?.name, offer.studentId?._id)} ${CampusUtils.escapeHtml(offer.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(offer.companyName)} / ${CampusUtils.escapeHtml(offer.role)}</td><td>₹${Number(offer.ctc).toLocaleString('en-IN')}</td><td><span class="status-badge">${CampusUtils.escapeHtml(offer.offerStatus)}</span></td><td>${CampusUtils.escapeHtml(offer.documentStatus || 'Pending')}</td><td>${offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString() : '—'}</td><td><button class="btn btn-secondary btn-sm" data-offer-resume="${offer.studentId?._id || ''}">Resume</button> ${documentAction}${joiningDateAction}${statusControl}</td></tr>`;
            }).join('') : '<tr><td colspan="7">No offers yet.</td></tr>';
            offerBody.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', async () => {
                if (!select.value) return;
                try { await CampusAPI.patch(`/offers/${select.dataset.status}/status`, { status: select.value }); CampusUtils.showToast('Offer status updated.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); select.value = ''; }
            }));
            CampusUtils.hydrateStudentAvatars(offerBody);
            offerBody.querySelectorAll('[data-offer-resume]').forEach((button) => button.addEventListener('click', async () => {
                try { await CampusUtils.openStudentResume(button.dataset.offerResume); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.querySelectorAll('[data-joining-date]').forEach((button) => button.addEventListener('click', async () => {
                const offer = offers.find((item) => item._id === button.dataset.joiningDate);
                const currentDate = offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '';
                const values = await CampusUtils.requestForm('Joining Date', [
                    { name: 'joiningDate', label: 'Joining date', type: 'date', value: currentDate, required: true }
                ]);
                if (!values) return;
                try { await CampusAPI.patch(`/offers/${offer._id}/joining-date`, { joiningDate: values.joiningDate }); CampusUtils.showToast('Joining date updated.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.querySelectorAll('[data-docs]').forEach((button) => button.addEventListener('click', async () => {
                const offer = offers.find((item) => item._id === button.dataset.docs);
                const values = await CampusUtils.requestForm('Update Document', [
                    { name: 'name', label: 'Document name', type: 'text', value: offer.documents?.[0]?.name || 'Identity Proof', required: true },
                    { name: 'status', label: 'Document status', type: 'select', options: ['Pending', 'Submitted', 'Verified', 'Rejected'], value: offer.documents?.[0]?.status || 'Submitted', required: true }
                ]);
                if (!values) return;
                try { await CampusAPI.patch(`/offers/${offer._id}/documents`, { documents: [{ name: values.name, status: values.status }] }); CampusUtils.showToast('Document status updated.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
        } catch (error) {
            selectedBody.innerHTML = `<tr><td colspan="4">${CampusUtils.escapeHtml(error.message)}</td></tr>`;
            offerBody.innerHTML = '<tr><td colspan="7">Could not load offers.</td></tr>';
        }
    }

    // ==============================
    // PROFILE FORM
    // ==============================
    document.getElementById('recruiter-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            companyName: document.getElementById('prof-companyName').value,
            recruiterName: document.getElementById('prof-recruiterName').value,
            industry: document.getElementById('prof-industry').value,
            phone: document.getElementById('prof-phone').value,
            website: document.getElementById('prof-website').value,
            companyDescription: document.getElementById('prof-companyDescription').value
        };

        const user = CampusAuth.getCurrentUser();

        try {
            const res = await CampusAPI.patch(`/recruiters/${user.id}`, payload);
            if (res.success) {
                CampusUtils.showToast("Profile saved successfully!", "success");
            }
        } catch (err) {
            CampusUtils.showToast(err.message, "error");
        }
    });

    // ==============================
    // CREATE JOB FORM
    // ==============================
    document.getElementById('create-job-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const reqSkills = document.getElementById('job-req-skills').value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        const prefSkills = document.getElementById('job-pref-skills').value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        const branches = document.getElementById('job-branches').value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        const payload = {
            title: document.getElementById('job-title').value,
            description: document.getElementById('job-description').value,
            requirements: {
                requiredSkills: reqSkills,
                preferredSkills: prefSkills,
                minimumCGPA: parseFloat(document.getElementById('job-cgpa').value) || null,
                maximumBacklogs: parseInt(document.getElementById('job-backlogs').value) || null,
                eligibleBranches: branches,
                experience: document.getElementById('job-experience').value
            },
            status: 'active'
        };

        try {
            const res = await CampusAPI.post('/jobs', payload);
            if (res.success) {
                CampusUtils.showToast("Job created successfully!", "success");
                document.getElementById('create-job-form').reset();
                document.querySelector('[data-section="jobs"]').click();
            }
        } catch (err) {
            CampusUtils.showToast(err.message, "error");
        }
    });

    // ==============================
    // CREATE DRIVE FORM
    // ==============================
    const createDriveForm = document.getElementById('create-drive-form');
    if (createDriveForm) {
        createDriveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const jobId = document.getElementById('drive-job-id').value;
            if (!jobId) {
                CampusUtils.showToast("Please select a job for this drive.", "error");
                return;
            }

            const payload = {
                jobId: jobId,
                date: document.getElementById('drive-date').value,
                startTime: document.getElementById('drive-start').value,
                endTime: document.getElementById('drive-end').value,
                venue: document.getElementById('drive-venue').value,
                mode: document.getElementById('drive-mode').value
            };

            try {
                const res = await CampusAPI.post('/drives', payload);
                if (res.success) {
                    CampusUtils.showToast("Drive created successfully!", "success");
                    createDriveForm.reset();
                    loadDrives();
                }
            } catch (err) {
                CampusUtils.showToast("Failed to create drive: " + err.message, "error");
            }
        });
    }

    // Initial load
    loadDashboard();
});

// ==============================
// PROFILE
// ==============================
async function loadProfile() {
    const user = CampusAuth.getCurrentUser();

    try {
        const res = await CampusAPI.get(`/recruiters/${user.id}`);

        if (res.success && res.data) {
            document.getElementById('prof-companyName').value = res.data.companyName || '';
            document.getElementById('prof-recruiterName').value = res.data.recruiterName || '';
            document.getElementById('prof-industry').value = res.data.industry || '';
            document.getElementById('prof-phone').value = res.data.phone || '';
            document.getElementById('prof-website').value = res.data.website || '';
            document.getElementById('prof-companyDescription').value = res.data.companyDescription || '';
        }
    } catch (err) {
        console.warn("Could not load profile", err);
    }
}

// ==============================
// JOBS
// ==============================
async function loadJobs() {
    const user = CampusAuth.getCurrentUser();

    try {
        const res = await CampusAPI.get(`/jobs?recruiterId=${user.id}`);

        if (res.success) {
            const tbody = document.getElementById('jobs-list');
            tbody.innerHTML = '';

            if (res.data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center">No jobs found.</td></tr>`;
                return;
            }

            res.data.forEach(job => {
                const tr = document.createElement('tr');

                tr.innerHTML = `
                    <td>${CampusUtils.escapeHtml(job.title)}</td>
                    <td>
                        <span class="badge ${job.status === 'active' ? 'badge-success' : 'badge-neutral'}">
                            ${job.status}
                        </span>
                    </td>
                    <td>${new Date(job.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button
                            class="btn btn-sm btn-primary"
                            onclick="analyzeJd('${job._id}')">
                            Analyze JD
                        </button>
                        <button
                            class="btn btn-sm btn-secondary candidates-button">
                            Candidates
                        </button>
                        <button
                            class="btn btn-sm btn-secondary applications-button">
                            Applications
                        </button>
                        <button
                            class="btn btn-sm btn-secondary"
                            onclick="deleteJob('${job._id}')">
                            Delete
                        </button>
                    </td>
                `;

                tr.querySelector('.candidates-button').addEventListener('click', () => {
                    viewCandidates(job._id, job.title);
                });
                tr.querySelector('.applications-button').addEventListener('click', () => {
                    viewJobApplications(job._id, job.title);
                });

                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

// ==============================
// CANDIDATES (Phase 7 — unchanged)
// ==============================
async function viewCandidates(jobId, jobTitle) {
    try {
        const res = await CampusAPI.get(`/jobs/${jobId}/candidates?includeIneligible=true`);
        const candidates = res.data || [];

        document.getElementById('section-jobs').style.display = 'none';
        document.getElementById('section-candidates').style.display = 'block';
        document.getElementById('candidates-job-title').textContent = `Candidates for: ${jobTitle}`;

        const tbody = document.getElementById('candidates-list');
        tbody.innerHTML = '';

        if (candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No student profiles found.</td></tr>';
            return;
        }

        candidates.forEach((c, i) => {
            const elig = c.eligible ? '✅ Yes' : '❌ No';
            const issues = (!c.eligible && c.eligibilityIssues && c.eligibilityIssues.length > 0)
                ? c.eligibilityIssues.join(', ') : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${CampusUtils.studentAvatarMarkup(c.studentName, c.studentId)} ${CampusUtils.escapeHtml(c.studentName)}</td>
                <td><span class="score-badge ${CampusUtils.scoreClass(c.matchScore)}">${c.matchScore}/100</span></td>
                <td>${CampusUtils.escapeHtml(c.matchCategory)}</td>
                <td><span class="status-badge ${c.eligible ? 'status-success' : 'status-danger'}">${elig}</span></td>
                <td><details class="match-explanation"><summary>Why this match?</summary><p>Skill match: ${c.breakdown?.skillMatch ?? 0}% · Project relevance: ${c.breakdown?.projectRelevance ?? 0}% · Academic fit: ${c.breakdown?.academicFit ?? 0}% · Evidence: ${c.breakdown?.evidenceCoverage ?? 0}%</p><p>Missing required skills: ${CampusUtils.escapeHtml((c.skillDetail?.missingRequired || []).join(', ') || 'None')}</p><p>${CampusUtils.escapeHtml(issues)}</p></details></td>
            `;
            tbody.appendChild(tr);
        });
        CampusUtils.hydrateStudentAvatars(tbody);
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

window.closeCandidates = function() {
    document.getElementById('section-candidates').style.display = 'none';
    document.getElementById('section-jobs').style.display = 'block';
};

// ==============================
// APPLICATIONS PER JOB (Phase 8)
// ==============================
async function viewJobApplications(jobId, jobTitle) {
    try {
        const res = await CampusAPI.get(`/jobs/${jobId}/applications`);
        const apps = res.data || [];

        document.getElementById('section-jobs').style.display = 'none';
        document.getElementById('section-applications').style.display = 'block';
        document.getElementById('applications-job-title').textContent = `Applications for: ${jobTitle}`;

        const tbody = document.getElementById('applications-list');
        tbody.innerHTML = '';

        if (apps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9">No applications yet for this job.</td></tr>';
            return;
        }

        apps.forEach((app, i) => {
            const student = app.studentId || {};
            const score = app.matching?.finalScore ?? '—';
            const status = CampusUtils.escapeHtml(app.status || 'Applied');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${CampusUtils.studentAvatarMarkup(student.name, student._id || student.id)} ${CampusUtils.escapeHtml(student.name || '—')}</td>
                <td>${CampusUtils.escapeHtml(student.branch || '—')}</td>
                <td>${student.cgpa ?? '—'}</td>
                <td>${score}/100</td>
                <td>${CampusUtils.formatDate(app.appliedAt)}</td>
                <td><span class="badge">${status}</span></td>
                <td><button class="btn btn-secondary btn-sm" data-resume-student="${CampusUtils.escapeHtml(student._id || student.id || '')}">View resume</button></td>
                <td>
                    <select onchange="updateApplicationStatus('${app._id}', this.value)">
                        <option value="">Change status...</option>
                        <option value="Shortlisted">Shortlist</option>
                        <option value="Interview">Interview</option>
                        <option value="Selected">Select</option>
                        <option value="Rejected">Reject</option>
                    </select>
                </td>
            `;
            tbody.appendChild(tr);
        });
        CampusUtils.hydrateStudentAvatars(tbody);
        tbody.querySelectorAll('[data-resume-student]').forEach((button) => button.addEventListener('click', async () => {
            try { await CampusUtils.openStudentResume(button.dataset.resumeStudent); }
            catch (error) { CampusUtils.showToast(error.message, 'error'); }
        }));
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

window.closeApplications = function() {
    document.getElementById('section-applications').style.display = 'none';
    document.getElementById('section-jobs').style.display = 'block';
};

async function updateApplicationStatus(appId, newStatus) {
    if (!newStatus) return;
    try {
        await CampusAPI.patch(`/applications/${appId}/status`, { status: newStatus });
        CampusUtils.showToast(`Application status updated to ${newStatus}.`, "success");
    } catch (err) {
        CampusUtils.showToast("Failed to update status: " + err.message, "error");
    }
}

// ==============================
// DRIVES (Phase 8)
// ==============================
async function loadDrives() {
    const user = CampusAuth.getCurrentUser();

    // Populate job dropdown in Create Drive form
    try {
        const jobsRes = await CampusAPI.get(`/jobs?recruiterId=${user.id}`);
        const sel = document.getElementById('drive-job-id');
        if (sel && jobsRes.success) {
            const oldVal = sel.value;
            sel.innerHTML = '<option value="">Select a job...</option>';
            jobsRes.data.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j._id;
                opt.textContent = j.title;
                if (j._id === oldVal) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    } catch (_) {}

    // Load drives list
    try {
        const res = await CampusAPI.get('/drives');
        const tbody = document.getElementById('drives-list');
        if (!tbody) return;
        tbody.innerHTML = '';

        const drives = res.data || [];
        if (drives.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No drives created yet.</td></tr>';
            return;
        }

        drives.forEach(drive => {
            const jobTitle = drive.jobId?.title || '—';
            const date = drive.date ? new Date(drive.date).toLocaleDateString() : '—';
            const time = `${drive.startTime} – ${drive.endTime}`;
            const mode = CampusUtils.escapeHtml(drive.mode || '—');
            const status = CampusUtils.escapeHtml(drive.status || 'Scheduled');
            const shortlisted = (drive.shortlistedCandidates || []).length;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${CampusUtils.escapeHtml(jobTitle)}</td>
                <td>${date}</td>
                <td>${time}</td>
                <td>${mode}</td>
                <td><span class="badge">${status}</span></td>
                <td>${shortlisted}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        CampusUtils.showToast("Failed to load drives: " + err.message, "error");
    }
}

// ==============================
// JD ANALYSIS (Phase 6 — unchanged)
// ==============================
async function analyzeJd(jobId) {
    try {
        CampusUtils.showToast("Analyzing JD with AI...", "info");
        const res = await CampusAPI.post(`/jobs/${jobId}/analyze`);

        if (res.success) {
            CampusUtils.showToast("JD analyzed successfully!", "success");
            const reqs = res.data.requirements;
            const message = `
Extracted Role: ${reqs.role || 'N/A'}
Required Skills: ${reqs.requiredSkills ? reqs.requiredSkills.join(', ') : 'None'}
Preferred Skills: ${reqs.preferredSkills ? reqs.preferredSkills.join(', ') : 'None'}
Experience: ${reqs.experience || 'N/A'}
Education: ${reqs.education || 'N/A'}
Responsibilities: ${reqs.responsibilities ? reqs.responsibilities.length + ' items' : 'None'}
            `.trim();
            alert(message);
        }
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

// ==============================
// DASHBOARD
// ==============================
async function loadDashboard() {
    const user = CampusAuth.getCurrentUser();

    try {
        const res = await CampusAPI.get(`/jobs?recruiterId=${user.id}`);

        if (res.success) {
            const jobs = res.data;
            const active = jobs.filter(j => j.status === 'active').length;
            document.getElementById('stat-active-jobs').textContent = active;
            document.getElementById('stat-total-jobs').textContent = jobs.length;
        }
    } catch (err) {
        console.warn("Could not load dashboard stats", err);
    }
}

// ==============================
// DELETE JOB (Phase 5 — unchanged)
// ==============================
async function deleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
        const res = await CampusAPI.delete(`/jobs/${jobId}`);

        if (res.success) {
            CampusUtils.showToast("Job deleted.", "success");
            loadJobs();
            loadDashboard();
        }
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

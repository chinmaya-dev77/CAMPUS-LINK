/**
 * CampusLink — recruiter.js
 * Recruiter dashboard logic.
 * Phase 5: Recruiter + Job CRUD
 * Phase 6: JD AI analysis
 * Phase 7: Candidate matching
 * Phase 8: Applications per job + Drive create/view + Shortlisting
 */

"use strict";

let editingRecruiterJobId = null;
let editingRecruiterJobStatus = null;
let pendingDriveCreation = null;
let recruiterJobsReturnScroll = 0;

function rememberRecruiterJobsPosition() {
    recruiterJobsReturnScroll = document.getElementById('page-content')?.scrollTop || 0;
}

async function returnToRecruiterJobs() {
    document.querySelectorAll('.content-section').forEach((section) => { section.style.display = 'none'; });
    document.getElementById('section-jobs').style.display = 'block';
    document.querySelectorAll('.sidebar-link').forEach((link) => {
        const active = link.dataset.section === 'jobs';
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    document.getElementById('page-title').textContent = 'My Jobs';
    await loadJobs();
    requestAnimationFrame(() => {
        const page = document.getElementById('page-content');
        if (page) page.scrollTop = recruiterJobsReturnScroll;
    });
}

function updateDriveApplicationContext() {
    const context = document.getElementById('drive-application-context');
    const jobSelect = document.getElementById('drive-job-id');
    if (!context || !jobSelect) return;
    const selectedJob = jobSelect.selectedOptions?.[0]?.textContent || '';
    const changed = pendingDriveCreation && jobSelect.value !== pendingDriveCreation.jobId;
    context.classList.toggle('hidden', !changed);
    context.textContent = changed
        ? `This candidate applied for ${pendingDriveCreation.title}. A ${selectedJob || 'different-job'} drive will not include this candidate.` : '';
}

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

            if (target === 'assistant') {
                document.querySelector('.assistant-launcher')?.click();
                return;
            }

            if (target === 'create-job') resetJobEditor();

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
            if (target === 'pipeline') loadCandidatePipeline();
        });
    });

    document.getElementById('recruiter-refresh-offers')?.addEventListener('click', loadRecruiterOffers);
    document.getElementById('recruiter-offer-candidate-status')?.addEventListener('change', (event) => {
        recruiterOfferCandidateStage = event.target.value;
        renderRecruiterOfferCandidates(recruiterOfferCandidateStage);
    });

    async function loadRecruiterOffers() {
        const selectedBody = document.getElementById('recruiter-selected-list');
        const offerBody = document.getElementById('recruiter-offers-list');
        const manualBody = document.getElementById('recruiter-manual-checking-list');
        if (!selectedBody || !offerBody) return;
        selectedBody.innerHTML = '<tr><td colspan="4">Loading selected candidates...</td></tr>';
        offerBody.innerHTML = '<tr><td colspan="7">Loading offers...</td></tr>';
        if (manualBody) manualBody.innerHTML = '<tr><td colspan="4">Loading manual checks...</td></tr>';
        try {
            const user = CampusAuth.getCurrentUser();
            const [jobsResponse, offersResponse] = await Promise.all([CampusAPI.get(`/jobs?recruiterId=${encodeURIComponent(user.id)}`), CampusAPI.get('/offers')]);
            const offers = offersResponse.data || [];
            const statusOf = (doc) => doc.verificationStatus || (doc.status === 'Verified' ? 'VERIFIED' : doc.status === 'Rejected' ? 'REJECTED' : doc.status === 'Submitted' ? 'NEEDS_REVIEW' : 'PENDING');
            const manualOffers = offers.map((offer) => ({ ...offer, manualDocs: (offer.documents || []).map((doc, index) => ({ ...doc, index })).filter((doc) => doc.required !== false && (statusOf(doc) === 'NEEDS_REVIEW' || (statusOf(doc) === 'REJECTED' && doc.verificationMethod === 'AI'))) })).filter((offer) => offer.manualDocs.length);
            if (manualBody) manualBody.innerHTML = manualOffers.length ? manualOffers.map((offer) => `<tr><td>${CampusUtils.escapeHtml(offer.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(offer.companyName)} / ${CampusUtils.escapeHtml(offer.role)}</td><td>${offer.manualDocs.map((doc) => CampusUtils.escapeHtml(doc.name)).join(', ')}</td><td><button class="btn btn-secondary btn-sm" data-manual-review="${offer._id}">Review documents</button></td></tr>`).join('') : '<tr><td colspan="4">No documents need manual checking.</td></tr>';
            manualBody?.querySelectorAll('[data-manual-review]').forEach((button) => button.addEventListener('click', () => {
                const offer = manualOffers.find((item) => String(item._id) === button.dataset.manualReview);
                if (offer) showDocumentReview(offer, loadRecruiterOffers);
            }));
            const existing = new Set(offers.map((offer) => offer.applicationId?._id || offer.applicationId));
            const selected = (await Promise.all((jobsResponse.data || []).map(async (job) => {
                const response = await CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/applications`);
                return (response.data || []).filter((app) => app.status === 'Selected').map((app) => ({ ...app, job }));
            }))).flat();
            const pending = selected.filter((app) => !existing.has(app._id));
            selectedBody.innerHTML = pending.length ? pending.map((app) => `<tr><td>${CampusUtils.studentAvatarMarkup(app.studentId?.name, app.studentId?._id)} ${CampusUtils.escapeHtml(app.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(app.job.requirements?.role || app.job.title)}</td><td><span class="status-badge status-success">Selected</span></td><td><button class="btn btn-primary btn-sm" data-create-offer="${app._id}">Create offer</button></td></tr>`).join('') : '<tr><td colspan="4">No selected candidates awaiting offers.</td></tr>';
            CampusUtils.hydrateStudentAvatars(selectedBody);
            selectedBody.querySelectorAll('[data-create-offer]').forEach((button) => button.addEventListener('click', async () => {
                const values = await showOfferSetupDialog();
                if (!values) return;
                try { await CampusAPI.post('/offers', { applicationId: button.dataset.createOffer, ctc: Number(values.ctc), documents: values.documents, ...(values.joiningDate ? { joiningDate: values.joiningDate } : {}), ...(values.documentDeadline ? { documentDeadline: values.documentDeadline } : {}) }); CampusUtils.showToast('Offer created.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            const nextStatusesByCurrentStatus = { 'Selected': ['Offer Generated'], 'Offer Generated': ['Offer Sent'], 'Documents Verified': ['Joining Confirmed'] };
            offerBody.innerHTML = offers.length ? offers.map((offer) => {
                const nextStatuses = nextStatusesByCurrentStatus[offer.offerStatus] || [];
                const required = (offer.documents || []).filter((doc) => doc.required !== false);
                const verificationStatus = statusOf;
                const verified = required.filter((doc) => verificationStatus(doc) === 'VERIFIED').length;
                const needsReview = required.filter((doc) => verificationStatus(doc) === 'NEEDS_REVIEW').length;
                const rejected = required.filter((doc) => verificationStatus(doc) === 'REJECTED').length;
                const allVerified = required.length > 0 && verified === required.length;
                const documentAction = ['Selected', 'Offer Generated'].includes(offer.offerStatus) ? `<button class="btn btn-secondary btn-sm" data-docs="${offer._id}">Required documents</button>` : needsReview && ['Accepted', 'Documentation Pending'].includes(offer.offerStatus) ? `<button class="btn btn-secondary btn-sm" data-docs="${offer._id}">Review documents</button>` : '';
                const canAdvance = nextStatuses.length && (offer.offerStatus !== 'Documents Verified' || offer.joiningDate) && !(offer.offerStatus === 'Offer Generated' && !required.length);
                const statusControl = canAdvance ? `<select class="form-select" data-status="${offer._id}" aria-label="Next offer action"><option value="">Next action…</option>${nextStatuses.map((status) => `<option value="${status}">${status === 'Offer Generated' ? 'Generate offer' : status === 'Offer Sent' ? 'Send offer' : 'Confirm joining'}</option>`).join('')}</select>` : '';
                const terminal = offer.offerStatus === 'Declined' ? '<span class="workflow-terminal">✕ Declined · Application closed</span>' : offer.offerStatus === 'Joining Confirmed' ? '<span class="workflow-terminal is-complete">✓ Joining confirmed · Workflow completed</span>' : '';
                const canSetDate = ['Accepted', 'Documentation Pending', 'Documents Verified'].includes(offer.offerStatus);
                const joiningDateAction = canSetDate && offer.offerStatus !== 'Joining Confirmed' ? `<button class="btn btn-secondary btn-sm" data-joining-date="${offer._id}">${offer.joiningDate ? 'Edit' : 'Set'} joining date</button>` : '';
                const documentProgress = required.length ? `${allVerified ? 'VERIFIED' : needsReview ? 'NEEDS_REVIEW' : rejected ? 'REJECTED' : 'PENDING'} · ${verified}/${required.length} verified${needsReview ? ` · ${needsReview} needs review` : ''}${rejected ? ` · ${rejected} rejected` : ''}` : 'No requirements';
                const editCtc = ['Selected', 'Offer Generated'].includes(offer.offerStatus) ? `<button class="btn btn-secondary btn-sm" data-edit-ctc="${offer._id}">Edit CTC</button>` : '';
                return `<tr><td>${CampusUtils.studentAvatarMarkup(offer.studentId?.name, offer.studentId?._id)} ${CampusUtils.escapeHtml(offer.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(offer.companyName)} / ${CampusUtils.escapeHtml(offer.role)}</td><td>₹${Number(offer.ctc).toLocaleString('en-IN')}</td><td><span class="status-badge ${CampusUtils.statusBadgeClass(offer.offerStatus)}">${CampusUtils.escapeHtml(offer.offerStatus)}</span>${terminal}</td><td>${documentProgress}</td><td>${offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString() : '—'}</td><td><button class="btn btn-secondary btn-sm" data-offer-resume="${offer.studentId?._id || ''}">Resume</button> ${editCtc} ${documentAction} ${joiningDateAction} ${statusControl}</td></tr>`;
            }).join('') : '<tr><td colspan="7">No offers yet.</td></tr>';
            offerBody.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', async () => {
                if (!select.value) return;
                try { await CampusAPI.patch(`/offers/${select.dataset.status}/status`, { status: select.value }); CampusUtils.showToast('Offer status updated.', 'success'); loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); select.value = ''; }
            }));
            CampusUtils.hydrateStudentAvatars(offerBody);
            offerBody.querySelectorAll('[data-edit-ctc]').forEach((button) => button.addEventListener('click', async () => {
                const offer = offers.find((item) => String(item._id) === button.dataset.editCtc);
                const values = await CampusUtils.requestForm('Edit offer CTC', [{ name: 'ctc', label: 'Annual CTC / package (₹)', type: 'number', min: '0', step: 'any', value: offer?.ctc, required: true }]);
                if (!values) return;
                const ctc = Number(values.ctc);
                if (!Number.isFinite(ctc) || ctc < 0) return CampusUtils.showToast('Enter a valid non-negative CTC.', 'error');
                try { await CampusAPI.patch(`/offers/${encodeURIComponent(offer._id)}/ctc`, { ctc }); CampusUtils.showToast('CTC updated.', 'success'); await loadRecruiterOffers(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
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
                if (['Selected', 'Offer Generated'].includes(offer.offerStatus)) {
                    const values = await showOfferSetupDialog(offer);
                    if (!values) return;
                    try { await CampusAPI.patch(`/offers/${offer._id}/documents`, { documents: values.documents }); CampusUtils.showToast('Required documents saved.', 'success'); loadRecruiterOffers(); }
                    catch (error) { CampusUtils.showToast(error.message, 'error'); }
                } else showDocumentReview(offer, loadRecruiterOffers);
            }));
            await loadCandidatePipeline();
            renderRecruiterOfferCandidates(recruiterOfferCandidateStage);
        } catch (error) {
            selectedBody.innerHTML = `<tr><td colspan="4">${CampusUtils.escapeHtml(error.message)}</td></tr>`;
            offerBody.innerHTML = '<tr><td colspan="7">Could not load offers.</td></tr>';
        }
    }

    function showOfferSetupDialog(existingOffer = null) {
        const commonTypes = ['Government ID', 'PAN', 'Resume', 'Passport photo', 'Degree certificate', 'Marksheet', 'Provisional certificate', 'Experience certificate', 'Bank details', 'Address proof'];
        const selected = new Set((existingOffer?.documents || []).filter((doc) => doc.required !== false).map((doc) => doc.name.toLowerCase()));
        const dialog = document.createElement('dialog'); dialog.className = 'campus-form-dialog offer-setup-dialog';
        const form = document.createElement('form'); form.className = 'campus-form-dialog__form';
        const title = document.createElement('h2'); title.textContent = existingOffer ? 'Required joining documents' : 'Create offer'; form.append(title);
        const addInput = (name, labelText, type, value, required) => {
            const group = document.createElement('div'); group.className = 'form-group';
            const label = document.createElement('label'); label.textContent = labelText; label.htmlFor = `offer-${name}`;
            const input = document.createElement('input'); input.className = 'form-input'; input.type = type; input.id = label.htmlFor; input.name = name; input.value = value || ''; input.required = Boolean(required);
            if (type === 'number') { input.min = '0'; input.step = 'any'; }
            group.append(label, input); form.append(group); return input;
        };
        const ctcInput = existingOffer ? null : addInput('ctc', 'Annual CTC / package (₹)', 'number', '', true);
        if (!existingOffer) {
            addInput('joiningDate', 'Joining date (optional)', 'date', '', false);
            addInput('documentDeadline', 'Document submission deadline (optional)', 'date', '', false);
        }
        const info = document.createElement('p'); info.className = 'form-help'; info.textContent = existingOffer ? 'Keep selected documents checked and select additional documents to add them. Uncheck a document only to remove that requirement.' : 'Select all documents required for this offer. Students can submit PDF or image files after accepting.'; form.append(info);
        const grid = document.createElement('div'); grid.className = 'document-requirement-options';
        commonTypes.forEach((name) => {
            const label = document.createElement('label'); label.className = 'document-requirement-option';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = name; checkbox.checked = selected.has(name.toLowerCase());
            const text = document.createElement('span'); text.textContent = name; label.append(checkbox, text); grid.append(label);
        });
        const customInput = document.createElement('input'); customInput.className = 'form-input'; customInput.type = 'text'; customInput.id = 'offer-custom-documents'; customInput.maxLength = 80; customInput.placeholder = 'Optional custom requirement'; customInput.setAttribute('aria-label', 'Custom document requirement');
        if (existingOffer) customInput.value = (existingOffer.documents || []).filter((doc) => doc.required !== false && !commonTypes.some((name) => name.toLowerCase() === doc.name.toLowerCase())).map((doc) => doc.name).join(', ');
        const customGroup = document.createElement('div'); customGroup.className = 'form-group'; const customLabel = document.createElement('label'); customLabel.htmlFor = customInput.id; customLabel.textContent = 'Other document requirements (comma separated)'; customGroup.append(customLabel, customInput);
        form.append(grid, customGroup);
        const actions = document.createElement('div'); actions.className = 'form-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => dialog.close());
        const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn btn-primary'; save.textContent = existingOffer ? 'Save requirements' : 'Create offer'; actions.append(cancel, save); form.append(actions);
        form.addEventListener('submit', (event) => {
            event.preventDefault(); if (!form.reportValidity()) return;
            const names = [...grid.querySelectorAll('input:checked')].map((checkbox) => checkbox.value);
            names.push(...customInput.value.split(',').map((name) => name.trim()).filter(Boolean));
            const unique = [...new Map(names.map((name) => [name.toLocaleLowerCase(), name])).values()];
            if (unique.length > 20) { CampusUtils.showToast('Choose no more than 20 document types.', 'error'); return; }
            dialog.close(); dialog.dispatchEvent(new CustomEvent('offer-setup-complete', { detail: { ctc: ctcInput?.value, joiningDate: form.elements.joiningDate?.value, documentDeadline: form.elements.documentDeadline?.value, documents: unique.map((name) => ({ name, required: true })) } }));
        });
        const result = new Promise((resolve) => dialog.addEventListener('offer-setup-complete', (event) => resolve(event.detail), { once: true }));
        dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.append(form); document.body.append(dialog); dialog.showModal(); return result;
    }

    function showDocumentReview(offer, onComplete) {
        const dialog = document.createElement('dialog'); dialog.className = 'placement-detail-dialog document-review-dialog';
        const header = document.createElement('div'); header.className = 'placement-detail-header';
        const heading = document.createElement('div'); const title = document.createElement('h2'); title.textContent = `Joining documents · ${offer.studentId?.name || 'Student'}`; heading.append(title);
        const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-secondary btn-sm'; close.textContent = 'Close'; close.addEventListener('click', () => dialog.close()); header.append(heading, close);
        const body = document.createElement('div'); body.className = 'placement-detail-body';
        const docs = (offer.documents || []).map((doc, index) => ({ ...doc, index })).filter((doc) => doc.required !== false);
        if (!docs.length) { const empty = document.createElement('p'); empty.textContent = 'No required documents were defined for this offer.'; body.append(empty); }
        docs.forEach((doc) => {
            const row = document.createElement('section'); row.className = 'document-review-row';
            const verificationStatus = doc.verificationStatus || (doc.status === 'Verified' ? 'VERIFIED' : doc.status === 'Rejected' ? 'REJECTED' : doc.status === 'Submitted' ? 'NEEDS_REVIEW' : 'PENDING');
            const visibleStatus = verificationStatus === 'VERIFIED' ? (doc.verificationMethod === 'AI' ? '✓ AI Verified' : '✓ Verified') : verificationStatus === 'NEEDS_REVIEW' ? '⚠ Manual Checking Required' : verificationStatus;
            const details = document.createElement('div'); const name = document.createElement('strong'); name.textContent = doc.name; const state = document.createElement('p'); state.textContent = `${visibleStatus}${doc.submittedAt ? ` · submitted ${new Date(doc.submittedAt).toLocaleDateString()}` : ''}${doc.rejectionReason ? ` · Reason: ${doc.rejectionReason}` : doc.verification?.reason ? ` · ${doc.verification.reason}` : ''}`; details.append(name, state); row.append(details);
            if (doc.verification?.checks?.length) {
                const checks = document.createElement('small');
                checks.textContent = doc.verification.checks.map((check) => `${check.passed ? '✓' : '✕'} ${check.label}${check.reason && !check.passed ? `: ${check.reason}` : ''}`).join(' · ');
                row.append(checks);
            }
            if (doc.hasFile) {
                const openFile = async (download) => {
                    let previewTab;
                    try {
                        // Open the tab synchronously from the click so popup blockers allow
                        // the authenticated file request to finish before displaying it.
                        if (!download) {
                            previewTab = window.open('', '_blank');
                            if (previewTab) previewTab.opener = null;
                        }
                        if (!download && !previewTab) throw new Error('Allow pop-ups to preview this document.');
                        const suffix = download ? '?download=1' : '';
                        const blob = await CampusAPI.blob(`/offers/${offer._id}/documents/${doc.index}/file${suffix}`);
                        const url = URL.createObjectURL(blob);
                        if (download) {
                            const link = document.createElement('a'); link.href = url; link.download = doc.originalFileName || doc.name;
                            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                            return;
                        }
                        previewTab.location.href = url;
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                    } catch (error) { previewTab?.close(); CampusUtils.showToast(error.message, 'error'); }
                };
                const view = document.createElement('button'); view.type = 'button'; view.className = 'btn btn-secondary btn-sm'; view.textContent = 'Preview document'; view.addEventListener('click', () => openFile(false)); row.append(view);
                const download = document.createElement('button'); download.type = 'button'; download.className = 'btn btn-secondary btn-sm'; download.textContent = 'Download'; download.addEventListener('click', () => openFile(true)); row.append(download);
            }
            if ((verificationStatus === 'NEEDS_REVIEW' || (verificationStatus === 'REJECTED' && doc.verificationMethod === 'AI')) && doc.hasFile) {
                [['Verified', 'Verify'], ['Rejected', 'Request resubmission']].forEach(([status, labelText]) => { const action = document.createElement('button'); action.type = 'button'; action.className = status === 'Verified' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'; action.textContent = labelText; action.addEventListener('click', async () => { try { let reason; if (status === 'Rejected') { const values = await CampusUtils.requestForm('Request document resubmission', [{ name: 'reason', label: `Reason for rejecting ${doc.name}`, required: true }]); if (!values) return; reason = values.reason; } await CampusAPI.patch(`/offers/${offer._id}/documents/${doc.index}/status`, { status, ...(reason ? { reason } : {}) }); dialog.close(); onComplete(); } catch (error) { CampusUtils.showToast(error.message, 'error'); } }); row.append(action); });
            }
            body.append(row);
        });
        if (docs.length && !docs.some((doc) => doc.hasFile)) {
            const note = document.createElement('p'); note.className = 'form-help'; note.textContent = 'No document files have been uploaded for this offer yet.'; body.append(note);
        }
        dialog.append(header, body); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
    }

    // Candidate Pipeline is rendered outside this DOMContentLoaded callback.
    // Export the same offer review action so its button can use the Offers flow.
    window.showDocumentReview = showDocumentReview;

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

        const optionalNumber = (value) => {
            const trimmed = String(value ?? '').trim();
            if (!trimmed) return null;
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? parsed : null;
        };

        const payload = {
            title: document.getElementById('job-title').value,
            description: document.getElementById('job-description').value,
            requirements: {
                requiredSkills: reqSkills,
                preferredSkills: prefSkills,
                minimumCGPA: optionalNumber(document.getElementById('job-cgpa').value),
                maximumBacklogs: optionalNumber(document.getElementById('job-backlogs').value),
                eligibleBranches: branches,
                experience: document.getElementById('job-experience').value
            },
            status: editingRecruiterJobStatus || 'active'
        };

        try {
            const res = editingRecruiterJobId
                ? await CampusAPI.patch(`/jobs/${encodeURIComponent(editingRecruiterJobId)}`, payload)
                : await CampusAPI.post('/jobs', payload);
            if (res.success) {
                CampusUtils.showToast(editingRecruiterJobId ? 'Job updated successfully!' : 'Job created successfully!', 'success');
                resetJobEditor();
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
    const driveMode = document.getElementById('drive-mode');
    const driveVenue = document.getElementById('drive-venue');
    const driveConflictHelp = document.getElementById('drive-conflict-help');
    const driveJobSelect = document.getElementById('drive-job-id');
    driveJobSelect?.addEventListener('change', updateDriveApplicationContext);
    const defaultDriveConflictHelp = 'CampusLink checks drive schedule and venue conflicts before creating a drive. Candidate interview overlaps are checked separately after shortlisting.';
    const setDriveModeUI = () => {
        const online = driveMode?.value === 'online';
        const label = document.getElementById('drive-venue-label');
        if (label) label.textContent = online ? 'Meeting link (optional)' : 'Venue (optional)';
        if (driveVenue) { driveVenue.type = online ? 'url' : 'text'; driveVenue.placeholder = online ? 'https://…' : 'Campus venue'; }
    };
    driveMode?.addEventListener('change', setDriveModeUI); setDriveModeUI();
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

            const startMinutes = Number(payload.startTime.slice(0, 2)) * 60 + Number(payload.startTime.slice(3, 5));
            const endMinutes = Number(payload.endTime.slice(0, 2)) * 60 + Number(payload.endTime.slice(3, 5));
            if (!payload.date || !payload.startTime || !payload.endTime || endMinutes <= startMinutes) {
                CampusUtils.showToast('Choose a date and a valid time interval.', 'error'); return;
            }

            try {
                const preflight = await CampusAPI.post('/drives/preflight', payload);
                const conflicts = preflight.data?.conflicts || [];
                if (conflicts.length) {
                    const details = conflicts.map(describeDriveConflict).join(' ');
                    if (driveConflictHelp) driveConflictHelp.textContent = details;
                    CampusUtils.showToast(details, 'error', 8000);
                    return;
                }
                const res = await CampusAPI.post('/drives', payload);
                if (res.success) {
                    CampusUtils.showToast("Drive created successfully!", "success");
                    if (driveConflictHelp) driveConflictHelp.textContent = defaultDriveConflictHelp;
                    if (pendingDriveCreation) { pendingDriveCreation = null; updateDriveApplicationContext(); }
                    createDriveForm.reset();
                    loadDrives();
                }
            } catch (err) {
                const details = (err.conflicts || []).map(describeDriveConflict).join(' ');
                const message = details || err.message || 'Could not create drive.';
                if (driveConflictHelp) driveConflictHelp.textContent = message;
                CampusUtils.showToast(message, "error", 8000);
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
            recruiterJobsCache = res.data || [];
            renderRecruiterJobs();
        }
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

let recruiterJobsCache = [];
function renderRecruiterJobs() {
    const tbody = document.getElementById('jobs-list');
    if (!tbody) return;
    const query = (document.getElementById('recruiter-jobs-search')?.value || '').trim().toLowerCase();
    const status = document.getElementById('recruiter-jobs-status')?.value || '';
    const sort = document.getElementById('recruiter-jobs-sort')?.value || 'created-desc';
    const jobs = recruiterJobsCache.filter((job) => (!query || job.title.toLowerCase().includes(query)) && (!status || job.status === status));
    jobs.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    tbody.innerHTML = '';
    if (!jobs.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><h3>${recruiterJobsCache.length ? 'No jobs match these filters' : 'No jobs yet'}</h3><p>${recruiterJobsCache.length ? 'Try a different search or status.' : 'Create a job to start receiving candidates.'}</p></div></td></tr>`;
        return;
    }
    jobs.forEach(job => {
                const tr = document.createElement('tr');

                const requirements = job.requirements || {};
                const requirementLines = [
                    ['Required skills', requirements.requiredSkills],
                    ['Preferred skills', requirements.preferredSkills],
                    ['Minimum CGPA', requirements.minimumCGPA == null ? '' : String(requirements.minimumCGPA)],
                    ['Maximum backlogs', requirements.maximumBacklogs == null ? '' : String(requirements.maximumBacklogs)],
                    ['Experience', requirements.experience],
                    ['Eligible branches', requirements.eligibleBranches]
                ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || '').trim());
                const requirementDetails = requirementLines.length
                    ? `<details class="job-requirements-details"><summary>View requirements</summary><dl>${requirementLines.map(([label, value]) => `<div><dt>${CampusUtils.escapeHtml(label)}</dt><dd>${CampusUtils.escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</dd></div>`).join('')}</dl></details>`
                    : '<span class="table-meta">No requirements provided</span>';

                tr.innerHTML = `
                    <td><strong>${CampusUtils.escapeHtml(job.title)}</strong>${requirementDetails}</td>
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
                        <button type="button" class="btn btn-sm btn-secondary edit-job-button">Edit</button>
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
                tr.querySelector('.edit-job-button').addEventListener('click', () => editRecruiterJob(job._id));

                tbody.appendChild(tr);
            });
}

function resetJobEditor() {
    editingRecruiterJobId = null;
    editingRecruiterJobStatus = null;
    document.getElementById('create-job-form')?.reset();
    const title = document.getElementById('job-form-title');
    const submit = document.getElementById('job-form-submit');
    const cancel = document.getElementById('cancel-job-edit');
    if (title) title.textContent = 'Create Job';
    if (submit) submit.textContent = 'Create Job';
    if (cancel) cancel.hidden = true;
}

async function editRecruiterJob(jobId) {
    try {
        const response = await CampusAPI.get(`/jobs/${encodeURIComponent(jobId)}`);
        const job = response.data;
        const requirements = job.requirements || {};
        editingRecruiterJobId = job._id;
        editingRecruiterJobStatus = job.status;
        document.getElementById('job-title').value = job.title || '';
        document.getElementById('job-description').value = job.description || '';
        document.getElementById('job-req-skills').value = (requirements.requiredSkills || []).join(', ');
        document.getElementById('job-pref-skills').value = (requirements.preferredSkills || []).join(', ');
        document.getElementById('job-cgpa').value = requirements.minimumCGPA ?? '';
        document.getElementById('job-backlogs').value = requirements.maximumBacklogs ?? '';
        document.getElementById('job-branches').value = (requirements.eligibleBranches || []).join(', ');
        document.getElementById('job-experience').value = requirements.experience || '';
        document.getElementById('job-form-title').textContent = `Edit ${job.title}`;
        document.getElementById('job-form-submit').textContent = 'Save changes';
        document.getElementById('cancel-job-edit').hidden = false;
        document.querySelectorAll('.content-section').forEach((section) => { section.style.display = 'none'; });
        document.getElementById('section-create-job').style.display = 'block';
        document.querySelectorAll('.sidebar-link').forEach((link) => link.classList.toggle('active', link.dataset.section === 'create-job'));
        document.getElementById('page-title').textContent = 'Edit Job';
    } catch (error) { CampusUtils.showToast(error.message || 'Could not load job for editing.', 'error'); }
}

document.getElementById('cancel-job-edit')?.addEventListener('click', resetJobEditor);

['recruiter-jobs-search', 'recruiter-jobs-status', 'recruiter-jobs-sort'].forEach((id) => {
    const control = document.getElementById(id);
    control?.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderRecruiterJobs);
});

// ==============================
// CANDIDATES (Phase 7 — unchanged)
// ==============================
async function viewCandidates(jobId, jobTitle) {
    rememberRecruiterJobsPosition();
    try {
        const res = await CampusAPI.get(`/jobs/${jobId}/candidates?includeIneligible=true`);
        const candidates = res.data || [];

        document.querySelectorAll('.content-section').forEach((section) => { section.style.display = 'none'; });
        document.getElementById('section-candidates').style.display = 'block';
        document.querySelectorAll('.sidebar-link').forEach((link) => {
            const isJobsLink = link.dataset.section === 'jobs';
            link.classList.toggle('active', isJobsLink);
            if (isJobsLink) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        document.getElementById('page-title').textContent = 'Candidates';
        document.getElementById('candidates-job-title').textContent = `Candidates for: ${jobTitle}`;

        const tbody = document.getElementById('candidates-list');
        tbody.innerHTML = '';

        if (candidates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No student profiles found.</td></tr>';
            return;
        }

        candidates.forEach((c, i) => {
            const elig = c.eligible ? '✅ Yes' : '❌ No';
            const explanation = c.explanation || {};
            const matchFacts = (explanation.facts || []).map((fact) => `<li class="${fact.passed === false ? 'match-fact-failed' : fact.passed === true ? 'match-fact-passed' : ''}">${fact.passed === false ? '✕' : fact.passed === true ? '✓' : '•'} ${CampusUtils.escapeHtml(fact.text)}</li>`).join('');
            const eligibilityReasons = (explanation.eligibilityReasons || c.eligibilityIssues || []).map((reason) => `<li>${CampusUtils.escapeHtml(reason)}</li>`).join('');
            const missingSkills = (explanation.missingRequiredSkills || c.skillDetail?.missingRequired || []).map(CampusUtils.escapeHtml).join(', ') || 'None';
            const weakSkills = (explanation.weakPreferredSkills || c.skillDetail?.missingPreferred || []).map(CampusUtils.escapeHtml).join(', ') || 'None';
            const semanticLabel = c.semanticSimilarity == null ? 'Unavailable (no supported embedding adapter)' : `${c.semanticSimilarity}%`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${CampusUtils.studentAvatarMarkup(c.studentName, c.studentId, 'sm', c.hasProfilePicture ? jobId : '')} ${CampusUtils.escapeHtml(c.studentName)}</td>
                <td><span class="score-badge ${CampusUtils.scoreClass(c.matchScore)}">${c.matchScore}/100</span></td>
                <td>${CampusUtils.escapeHtml(c.matchCategory)}</td>
                <td><span class="status-badge ${c.eligible ? 'status-success' : 'status-danger'}">${elig}</span></td>
                <td><details class="match-explanation"><summary>${c.eligible ? 'Why this match?' : 'Why not eligible?'}</summary><p><strong>Match score:</strong> ${c.matchScore}/100 · ${CampusUtils.escapeHtml(c.matchCategory)}</p><p><strong>Match breakdown:</strong> Skill ${c.breakdown?.skillMatch ?? 0}% · Projects ${c.breakdown?.projectRelevance ?? 0}% · Academic ${c.breakdown?.academicFit ?? 0}% · Evidence ${c.breakdown?.evidenceCoverage ?? 0}% · Semantic ${CampusUtils.escapeHtml(semanticLabel)}</p>${c.eligible ? `<ul>${matchFacts}</ul>` : `<ul class="match-ineligibility-reasons">${eligibilityReasons || '<li>No eligibility failure was returned.</li>'}</ul><ul>${matchFacts}</ul>`}<p><strong>Missing required skills:</strong> ${missingSkills}</p><p><strong>Weak / missing preferred skills:</strong> ${weakSkills}</p><p><strong>Skills:</strong> ${CampusUtils.escapeHtml((c.skills || []).join(', ') || 'None listed')}</p><p><strong>Projects:</strong> ${CampusUtils.escapeHtml((c.projects || []).map((project) => project.title).filter(Boolean).join(', ') || 'None listed')}</p></details></td>
            `;
            tbody.appendChild(tr);
        });
        CampusUtils.hydrateStudentAvatars(tbody);
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

window.closeCandidates = function() {
    returnToRecruiterJobs();
};

// ==============================
// APPLICATIONS PER JOB (Phase 8)
// ==============================
async function viewJobApplications(jobId, jobTitle) {
    rememberRecruiterJobsPosition();
    try {
        window.activeApplicationList = { jobId, jobTitle };
        const [res, candidateResponse] = await Promise.all([
            CampusAPI.get(`/jobs/${jobId}/applications`),
            CampusAPI.get(`/jobs/${jobId}/candidates?includeIneligible=true`)
        ]);
        const candidatesById = new Map((candidateResponse.data || []).map((candidate) => [String(candidate.studentId), candidate]));
        const apps = (res.data || []).map((application) => ({ ...application, candidateProfile: candidatesById.get(String(application.studentId?._id || application.studentId)) }));

        document.getElementById('section-jobs').style.display = 'none';
        document.getElementById('section-applications').style.display = 'block';
        document.getElementById('applications-job-title').textContent = `Applications for: ${jobTitle}`;

        const tbody = document.getElementById('applications-list');
        tbody.innerHTML = '';

        if (apps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">No applications yet for this job.</td></tr>';
            return;
        }

        apps.forEach((app, i) => {
            const student = app.studentId || {};
            const profile = app.candidateProfile || {};
            const readiness = profile.readiness;
            const skills = (profile.skills || []).slice(0, 6).join(', ');
            const projects = (profile.projects || []).slice(0, 2).map((project) => project.title).filter(Boolean).join(', ');
            const score = app.matching?.finalScore ?? '—';
            const status = CampusUtils.escapeHtml(app.status || 'Applied');
            const eligibility = app.eligibility?.isEligible === true ? 'Eligible' : app.eligibility?.isEligible === false ? 'Ineligible' : 'Not assessed';
            const matchFacts = (profile.explanation?.facts || []).map((fact) => `<li class="${fact.passed === false ? 'match-fact-failed' : fact.passed === true ? 'match-fact-passed' : ''}">${fact.passed === false ? '✕' : fact.passed === true ? '✓' : '•'} ${CampusUtils.escapeHtml(fact.text)}</li>`).join('');
            const eligibilityReasons = (profile.explanation?.eligibilityReasons || app.eligibility?.reasons || []).map((reason) => `<li>${CampusUtils.escapeHtml(reason)}</li>`).join('');
            const semanticLabel = profile.semanticSimilarity == null ? 'Unavailable (no supported embedding adapter)' : `${profile.semanticSimilarity}%`;
            const matchDetails = `<details class="match-explanation"><summary>Why ${eligibility === 'Eligible' ? 'this match' : 'not eligible'}?</summary><p>Skill ${profile.breakdown?.skillMatch ?? app.matching?.skillMatch ?? '—'}% · Projects ${profile.breakdown?.projectRelevance ?? app.matching?.projectRelevance ?? '—'}% · Academic ${profile.breakdown?.academicFit ?? app.matching?.academicFit ?? '—'}% · Evidence ${profile.breakdown?.evidenceCoverage ?? app.matching?.assessmentEvidence ?? '—'}% · Semantic ${CampusUtils.escapeHtml(semanticLabel)}</p>${eligibility === 'Ineligible' ? `<ul>${eligibilityReasons || '<li>No eligibility failure was returned.</li>'}</ul>` : ''}<ul>${matchFacts}</ul><p>Missing skills: ${CampusUtils.escapeHtml((profile.skillDetail?.missingRequired || []).join(', ') || 'None')}</p><p>Weak preferred skills: ${CampusUtils.escapeHtml((profile.skillDetail?.missingPreferred || []).join(', ') || 'None')}</p></details>`;
            const nextStatuses = APPLICATION_NEXT[app.status] || [];
            const actionControl = nextStatuses.length ? `<select class="form-select" data-app-status="${CampusUtils.escapeHtml(app._id)}" aria-label="Next application action"><option value="">Next action…</option>${nextStatuses.map((value) => `<option value="${value}">${value === 'Shortlisted' ? 'Shortlist' : value === 'Interview' ? 'Move to interview' : value === 'Selected' ? 'Select' : 'Reject'}</option>`).join('')}</select>` : app.status === 'Rejected' ? '<span class="workflow-terminal">✕ Application closed</span>' : app.status === 'Offer' ? '<span class="workflow-terminal">Offer workflow</span>' : '<span class="text-muted">No action available</span>';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i + 1}</td>
                <td>${CampusUtils.studentAvatarMarkup(student.name, student._id || student.id)} ${CampusUtils.escapeHtml(student.name || '—')}</td>
                <td>${CampusUtils.escapeHtml(profile.branch || '—')}${readiness?.score != null ? `<small class="text-muted d-block">Readiness ${CampusUtils.escapeHtml(String(readiness.score))}/100 · ${CampusUtils.escapeHtml(readiness.category || '')}</small>` : ''}</td>
                <td>${profile.cgpa ?? '—'}</td>
                <td>${score}/100${matchDetails}</td>
                <td><span class="status-badge ${eligibility === 'Eligible' ? 'status-success' : eligibility === 'Ineligible' ? 'status-danger' : 'status-neutral'}">${eligibility}</span></td>
                <td>${CampusUtils.formatDate(app.appliedAt)}</td>
                <td><span class="badge">${status}</span></td>
                <td><button class="btn btn-secondary btn-sm" data-resume-student="${CampusUtils.escapeHtml(student._id || student.id || '')}">View resume</button></td>
                <td>${actionControl}</td>
            `;
            tbody.appendChild(tr);
        });
        CampusUtils.hydrateStudentAvatars(tbody);
        tbody.querySelectorAll('[data-resume-student]').forEach((button) => button.addEventListener('click', async () => {
            try { await CampusUtils.openStudentResume(button.dataset.resumeStudent); }
            catch (error) { CampusUtils.showToast(error.message, 'error'); }
        }));
        tbody.querySelectorAll('[data-app-status]').forEach((select) => select.addEventListener('change', () => handleApplicationAction(select, apps.find((app) => String(app._id) === select.dataset.appStatus))));
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

window.closeApplications = function() {
    returnToRecruiterJobs();
};

async function updateApplicationStatus(appId, newStatus, driveId) {
    if (!newStatus) return;
    try {
        await CampusAPI.patch(`/applications/${appId}/status`, { status: newStatus, ...(driveId ? { driveId } : {}) });
        CampusUtils.showToast(`Application status updated to ${newStatus}.`, "success");
        if (window.activeApplicationList) viewJobApplications(window.activeApplicationList.jobId, window.activeApplicationList.jobTitle);
        if (document.getElementById('section-pipeline')?.style.display !== 'none') loadCandidatePipeline();
        return true;
    } catch (err) {
        CampusUtils.showToast("Failed to update status: " + err.message, "error");
        return false;
    }
}

async function handleApplicationAction(select, app) {
    if (!select.value || !app) return;
    const status = select.value;
    if (status !== 'Interview') {
        select.disabled = true;
        await updateApplicationStatus(select.dataset.appStatus, status);
        return;
    }
    await showInterviewDrivePicker(select, app);
}

function confirmAddAndMoveToInterview(candidate, job, status) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog'); dialog.className = 'campus-form-dialog';
        const content = document.createElement('div'); content.className = 'campus-form-dialog__form';
        const heading = document.createElement('h2'); heading.textContent = 'Add this candidate to the drive?';
        const details = document.createElement('p'); details.textContent = `Candidate: ${candidate}\nJob: ${job}\nCurrent status: ${status}`;
        details.style.whiteSpace = 'pre-line';
        const actions = document.createElement('div'); actions.className = 'form-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = 'Cancel';
        const add = document.createElement('button'); add.type = 'button'; add.className = 'btn btn-primary'; add.textContent = 'Add & Move to Interview';
        let decided = false;
        const finish = (accepted) => { decided = true; dialog.close(); resolve(accepted); };
        cancel.addEventListener('click', () => finish(false)); add.addEventListener('click', () => finish(true));
        actions.append(cancel, add); content.append(heading, details, actions); dialog.append(content);
        dialog.addEventListener('close', () => { dialog.remove(); if (!decided) resolve(false); }, { once: true });
        document.body.append(dialog); dialog.showModal();
    });
}

async function showInterviewDrivePicker(select, app) {
    select.value = '';
    const host = select.parentElement;
    host.querySelector('.interview-drive-picker')?.remove();
    const picker = document.createElement('div'); picker.className = 'interview-drive-picker';
    picker.setAttribute('aria-live', 'polite');
    host.append(picker);
    try {
        const response = await CampusAPI.get('/drives');
        const jobId = String(app.job?._id || app.jobId?._id || app.jobId || '');
        const drives = (response.data || []).filter((drive) => String(drive.jobId?._id || drive.jobId) === jobId && ['Scheduled', 'Ongoing'].includes(drive.status) && !driveHasEnded(drive));
        if (!drives.length) {
            const role = app.job?.requirements?.role || app.job?.title || app.jobId?.title || 'this job';
            const message = document.createElement('p'); message.textContent = `No ${role} drive has been created yet. Create a ${role} drive to continue this candidate to interview scheduling.`;
            const create = document.createElement('button'); create.type = 'button'; create.className = 'btn btn-secondary btn-sm'; create.textContent = 'Create Drive';
            create.addEventListener('click', () => {
                pendingDriveCreation = { jobId, title: role };
                document.querySelector('.sidebar-link[data-section="drives"]')?.click();
                requestAnimationFrame(() => {
                    const jobSelect = document.getElementById('drive-job-id');
                    if (jobSelect && [...jobSelect.options].some((option) => option.value === jobId)) {
                        jobSelect.value = jobId;
                        jobSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    document.getElementById('create-drive-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });
            picker.append(message, create);
            return;
        }
        const label = document.createElement('label'); label.textContent = 'Choose an interview drive';
        const driveSelect = document.createElement('select'); driveSelect.className = 'form-select';
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a drive…'; driveSelect.append(placeholder);
        drives.forEach((drive) => {
            const option = document.createElement('option'); option.value = drive._id;
            option.textContent = `${drive.jobId?.title || drive.role} · ${CampusUtils.formatDate(drive.date)} · ${drive.startTime}`;
            driveSelect.append(option);
        });
        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn btn-primary btn-sm'; confirm.textContent = 'Add & Move to Interview';
        confirm.addEventListener('click', async () => {
            if (!driveSelect.value) { CampusUtils.showToast('Select an interview drive first.', 'error'); return; }
            const candidateName = app.student?.name || app.studentId?.name || 'this candidate';
            const jobName = app.job?.title || app.job?.requirements?.role || 'this job';
            if (!await confirmAddAndMoveToInterview(candidateName, jobName, app.status || app.applicationStatus || 'Shortlisted')) return;
            confirm.disabled = true;
            try {
                await CampusAPI.post(`/drives/${encodeURIComponent(driveSelect.value)}/candidates`, { studentIds: [app.studentId?._id || app.studentId || app.student?._id] });
                CampusUtils.showToast('Candidate added to the drive and moved to Interview.', 'success');
                picker.remove(); await loadCandidatePipeline();
            } catch (error) { CampusUtils.showToast(error.message || 'Could not add candidate to the drive.', 'error'); confirm.disabled = false; }
        });
        picker.append(label, driveSelect, confirm);
    } catch (error) {
        picker.textContent = error.message || 'Could not load interview drives.';
    }
}

const PIPELINE_GROUPS = [
    { title: 'Application', statuses: ['Applied', 'Eligible', 'Ineligible'] },
    { title: 'Shortlisted', statuses: ['Shortlisted'] },
    { title: 'Interview', statuses: ['Interview'] },
    { title: 'Manual Checking', statuses: ['Manual Checking'] },
    { title: 'Selected', statuses: ['Selected'] },
    { title: 'Rejected', statuses: ['Rejected', 'Withdrawn'] }
];
const APPLICATION_NEXT = { Applied: ['Shortlisted', 'Rejected'], Eligible: ['Shortlisted', 'Rejected'], Ineligible: ['Rejected'], Shortlisted: ['Interview', 'Rejected'], Interview: ['Selected', 'Rejected'] };
let pipelineApplications = [];
let recruiterOfferCandidateStage = '';

function renderRecruiterOfferCandidates(stage = recruiterOfferCandidateStage) {
    const body = document.getElementById('recruiter-offer-candidates-list');
    if (!body) return;
    const select = document.getElementById('recruiter-offer-candidate-status');
    if (select && select.value !== stage) select.value = stage;
    const applicationStages = PIPELINE_GROUPS.find((group) => group.title === stage)?.statuses || [];
    const candidates = pipelineApplications.filter((app) => !stage || (stage === 'Application' ? applicationStages.includes(pipelineStage(app)) : pipelineStage(app) === stage));
    body.innerHTML = candidates.length ? candidates.map((app) => {
        const student = app.studentId || {};
        const profile = app.candidateProfile || {};
        const currentStage = pipelineStage(app) || 'Application';
        const eligibility = app.eligibility?.isEligible === true ? 'Eligible' : app.eligibility?.isEligible === false ? 'Ineligible' : 'Not assessed';
        const resume = student._id ? `<button class="btn btn-secondary btn-sm" data-offer-candidate-resume="${CampusUtils.escapeHtml(student._id)}">Resume</button>` : '<span class="text-muted">Unavailable</span>';
        const skillDetail = profile.skillDetail || {};
        const skillList = (items, tone) => (items || []).length
            ? items.map((skill) => `<span class="offer-insight-chip ${tone}">${CampusUtils.escapeHtml(skill)}</span>`).join('')
            : '<span class="offer-insight-muted">None</span>';
        const breakdown = [
            ['Skill match', profile.breakdown?.skillMatch],
            ['Project relevance', profile.breakdown?.projectRelevance],
            ['Academic fit', profile.breakdown?.academicFit],
            ['Evidence coverage', profile.breakdown?.evidenceCoverage]
        ].map(([label, value]) => `<div><span>${label}</span><strong>${value == null ? '—' : `${CampusUtils.escapeHtml(String(value))}%`}</strong></div>`).join('');
        const skills = (profile.skills || []).slice(0, 12);
        const projects = (profile.projects || []).slice(0, 4).map((project) => typeof project === 'string' ? project : project.title).filter(Boolean);
        const facts = (profile.explanation?.facts || []).slice(0, 5).map((fact) => `<li class="${fact.passed === false ? 'is-failed' : fact.passed === true ? 'is-passed' : ''}"><span aria-hidden="true">${fact.passed === false ? '✕' : fact.passed === true ? '✓' : '•'}</span>${CampusUtils.escapeHtml(fact.text)}</li>`).join('');
        const skillsByGroup = (matched, missing, missingTone) => `<div class="offer-skill-lines"><div><span>Matched</span>${skillList(matched, 'is-matched')}</div><div><span>Missing</span>${skillList(missing, missingTone)}</div></div>`;
        const insights = `<details class="offer-candidate-insights"><summary>Why this match?</summary><div class="offer-insights-content"><div class="offer-insight-breakdown">${breakdown}</div><div class="offer-insight-section"><strong>Required skills</strong>${skillsByGroup(skillDetail.matchedRequired, skillDetail.missingRequired, 'is-missing')}</div><div class="offer-insight-section"><strong>Preferred skills</strong>${skillsByGroup(skillDetail.matchedPreferred, skillDetail.missingPreferred, 'is-warning')}</div>${skills.length ? `<div class="offer-insight-section"><strong>Candidate skills</strong><div>${skills.map((skill) => `<span class="offer-insight-chip is-candidate-skill">${CampusUtils.escapeHtml(skill)}</span>`).join('')}</div></div>` : ''}${projects.length ? `<div class="offer-insight-section"><strong>Projects</strong><p>${projects.map(CampusUtils.escapeHtml).join(' · ')}</p></div>` : ''}${facts ? `<div class="offer-insight-section"><strong>Evidence</strong><ul>${facts}</ul></div>` : ''}</div></details>`;
        return `<tr><td>${CampusUtils.studentAvatarMarkup(student.name, student._id)} ${CampusUtils.escapeHtml(student.name || 'Student')}</td><td>${CampusUtils.escapeHtml(app.job?.requirements?.role || app.job?.title || 'Job')}</td><td><span class="pipeline-stage-badge is-${currentStage.toLowerCase().replaceAll(' ', '-')}">${CampusUtils.escapeHtml(currentStage)}</span></td><td>${app.matching?.finalScore == null ? '—' : `${app.matching.finalScore}/100`}</td><td>${CampusUtils.escapeHtml(eligibility)}</td><td>${insights}</td><td>${resume}</td></tr>`;
    }).join('') : `<tr><td colspan="7">${stage ? `No candidates in ${CampusUtils.escapeHtml(stage)}.` : 'No candidate applications found.'}</td></tr>`;
    CampusUtils.hydrateStudentAvatars(body);
    body.querySelectorAll('[data-offer-candidate-resume]').forEach((button) => button.addEventListener('click', async () => {
        try { await CampusUtils.openStudentResume(button.dataset.offerCandidateResume); }
        catch (error) { CampusUtils.showToast(error.message || 'Resume is not available.', 'error'); }
    }));
}

function pipelineVerificationStatus(doc) {
    return doc.verificationStatus || (doc.status === 'Verified' ? 'VERIFIED' : doc.status === 'Rejected' ? 'REJECTED' : doc.status === 'Submitted' ? 'NEEDS_REVIEW' : 'PENDING');
}

function pipelineStage(application) {
    if (['Rejected', 'Withdrawn'].includes(application.applicationStatus)) return 'Rejected';
    const required = (application.offer?.documents || []).filter((doc) => doc.required !== false);
    const states = required.map(pipelineVerificationStatus);
    if (states.includes('NEEDS_REVIEW') || states.includes('REJECTED')) return 'Manual Checking';
    if (required.length && states.every((state) => state === 'VERIFIED')) return 'Selected';
    return ['Selected', 'Offer', 'Hired'].includes(application.applicationStatus) ? 'Selected' : application.applicationStatus;
}

async function loadCandidatePipeline() {
    const board = document.getElementById('candidate-pipeline-board');
    if (!board) return;
    board.innerHTML = '<p class="text-muted">Loading applications…</p>';
    try {
        const user = CampusAuth.getCurrentUser();
        const jobsResponse = await CampusAPI.get(`/jobs?recruiterId=${encodeURIComponent(user.id)}`);
        const jobs = jobsResponse.data || [];
        const [applicationGroups, offerResponse] = await Promise.all([
            Promise.all(jobs.map(async (job) => {
                const [response, candidatesResponse] = await Promise.all([
                    CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/applications`),
                    CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/candidates?includeIneligible=true`)
                ]);
                const candidates = new Map((candidatesResponse.data || []).map((candidate) => [String(candidate.studentId), candidate]));
                return (response.data || []).map((application) => ({ ...application, job, candidateProfile: candidates.get(String(application.studentId?._id || application.studentId)) }));
            })),
            CampusAPI.get('/offers')
        ]);
        const offerByApplication = new Map((offerResponse.data || []).map((offer) => [String(offer.applicationId?._id || offer.applicationId), offer]));
        pipelineApplications = applicationGroups.flat().map((application) => {
            const offer = offerByApplication.get(String(application._id));
            return { ...application, status: application.status, applicationStatus: application.status, offer };
        });
        const statusSelect = document.getElementById('pipeline-status-filter');
        const selectedStatus = statusSelect.value;
        const statuses = [...new Set(pipelineApplications.map((item) => item.status))].sort();
        statusSelect.innerHTML = '<option value="">All statuses</option>' + statuses.map((status) => `<option>${CampusUtils.escapeHtml(status)}</option>`).join('');
        if (statuses.includes(selectedStatus)) statusSelect.value = selectedStatus;
        renderCandidatePipeline();
    } catch (error) {
        board.innerHTML = `<div class="empty-state"><h3>Could not load the candidate pipeline</h3><p>${CampusUtils.escapeHtml(error.message)}</p></div>`;
    }
}

function renderCandidatePipeline() {
    const board = document.getElementById('candidate-pipeline-board');
    if (!board) return;
    const query = document.getElementById('pipeline-search').value.trim().toLowerCase();
    const selectedStatus = document.getElementById('pipeline-status-filter').value;
    const filtered = pipelineApplications.filter((app) => {
        const student = app.studentId || {};
        return (!selectedStatus || app.status === selectedStatus) && (!query || `${student.name || ''} ${student.branch || ''} ${app.job?.title || ''}`.toLowerCase().includes(query));
    });
    board.innerHTML = PIPELINE_GROUPS.map((group) => {
        const items = filtered.filter((app) => group.statuses.includes(pipelineStage(app)));
        const stageClass = group.title.toLowerCase().replaceAll(' ', '-');
        return `<section class="pipeline-column ${stageClass}"><header class="pipeline-column-head"><strong>${group.title}</strong><div class="pipeline-column-tools"><span>${items.length}</span><button type="button" class="pipeline-see-all" data-pipeline-see-all="${CampusUtils.escapeHtml(group.title)}">See all</button></div></header><div class="pipeline-cards">${items.length ? items.map((app) => {
            const student = app.studentId || {};
            const statusOptions = (APPLICATION_NEXT[app.applicationStatus] || []).filter((status) => !(app.applicationStatus === 'Shortlisted' && status === 'Interview'));
            const requiredDocs = (app.offer?.documents || []).map((doc, index) => ({ ...doc, index, state: pipelineVerificationStatus(doc) })).filter((doc) => doc.required !== false);
            const verifiedDocs = requiredDocs.filter((doc) => doc.state === 'VERIFIED').length;
            const offerText = app.offer?.offerStatus ? `<p class="pipeline-offer">Offer · ${CampusUtils.escapeHtml(app.offer.offerStatus)}${requiredDocs.length ? ` · Documents ${verifiedDocs}/${requiredDocs.length} verified` : ''}</p>` : '';
            const profile = app.candidateProfile || {};
            const readiness = profile.readiness;
            const matchFacts = (profile.explanation?.facts || []).map((fact) => `<li class="${fact.passed === false ? 'is-failed' : fact.passed === true ? 'is-passed' : ''}"><span aria-hidden="true">${fact.passed === false ? '✕' : fact.passed === true ? '✓' : '•'}</span>${CampusUtils.escapeHtml(fact.text)}</li>`).join('');
            const eligibilityReasons = (profile.explanation?.eligibilityReasons || app.eligibility?.reasons || []).map((reason) => `<li>${CampusUtils.escapeHtml(reason)}</li>`).join('');
            const semanticLabel = profile.semanticSimilarity == null ? 'Unavailable (no supported embedding adapter)' : `${profile.semanticSimilarity}%`;
            const insightBreakdown = [['Skill match', profile.breakdown?.skillMatch], ['Project relevance', profile.breakdown?.projectRelevance], ['Academic fit', profile.breakdown?.academicFit], ['Evidence coverage', profile.breakdown?.evidenceCoverage]].map(([label, value]) => `<div><span>${label}</span><strong>${value == null ? '—' : `${CampusUtils.escapeHtml(String(value))}%`}</strong></div>`).join('');
            const insightSkillList = (items, tone) => (items || []).length ? items.map((skill) => `<span class="offer-insight-chip ${tone}">${CampusUtils.escapeHtml(skill)}</span>`).join('') : '<span class="offer-insight-muted">None</span>';
            const insightSkillGroup = (matched, missing, tone) => `<div class="offer-skill-lines"><div><span>Matched</span>${insightSkillList(matched, 'is-matched')}</div><div><span>Missing</span>${insightSkillList(missing, tone)}</div></div>`;
            const insightSkills = (profile.skills || []).slice(0, 10);
            const insightProjects = (profile.projects || []).slice(0, 3).map((project) => typeof project === 'string' ? project : project.title).filter(Boolean);
            const matchDetails = `<details class="offer-candidate-insights pipeline-match-insights"><summary>${app.eligibility?.isEligible === false ? 'Why not eligible?' : 'Why this match?'}</summary><div class="offer-insights-content pipeline-insights-content"><div class="offer-insight-breakdown">${insightBreakdown}</div><div class="offer-insight-section"><strong>Required skills</strong>${insightSkillGroup(profile.skillDetail?.matchedRequired, profile.skillDetail?.missingRequired, 'is-missing')}</div><div class="offer-insight-section"><strong>Preferred skills</strong>${insightSkillGroup(profile.skillDetail?.matchedPreferred, profile.skillDetail?.missingPreferred, 'is-warning')}</div>${insightSkills.length ? `<div class="offer-insight-section"><strong>Candidate skills</strong><div>${insightSkills.map((skill) => `<span class="offer-insight-chip is-candidate-skill">${CampusUtils.escapeHtml(skill)}</span>`).join('')}</div></div>` : ''}${insightProjects.length ? `<div class="offer-insight-section"><strong>Projects</strong><p>${insightProjects.map((project) => CampusUtils.escapeHtml(project)).join(' · ')}</p></div>` : ''}${app.eligibility?.isEligible === false ? `<div class="offer-insight-section"><strong>Eligibility</strong><ul>${eligibilityReasons || '<li>No eligibility failure was returned.</li>'}</ul></div>` : ''}<div class="offer-insight-section"><strong>Evidence</strong><ul>${matchFacts || '<li>Match explanation is not available.</li>'}</ul></div><p class="pipeline-semantic-note">Semantic similarity · ${CampusUtils.escapeHtml(semanticLabel)}</p></div></details>`;
            const skills = (profile.skills || []).slice(0, 6).join(', ');
            const projects = (profile.projects || []).slice(0, 2).map((project) => project.title).filter(Boolean).join(', ');
            const terminalText = app.status === 'Hired' ? '<p class="workflow-terminal is-complete">✓ Joining confirmed · Workflow completed</p>' : app.status === 'Rejected' ? '<p class="workflow-terminal">✕ Closed · Application closed</p>' : '';
            const statusTone = CampusUtils.statusBadgeClass(app.status);
            const currentStatus = `<span class="status-badge ${statusTone}">${CampusUtils.escapeHtml(app.status)}</span>${app.interviewScheduledAt ? `<small class="pipeline-interview-scheduled">Interview Scheduled · ${CampusUtils.escapeHtml(new Date(app.interviewScheduledAt).toLocaleString())}</small>` : ''}`;
            const actionMarkup = statusOptions.length ? `<select class="form-select" data-app-status="${CampusUtils.escapeHtml(app._id)}" aria-label="Next application action"><option value="">Next action…</option>${statusOptions.map((status) => `<option value="${status}">${status === 'Shortlisted' ? 'Shortlist' : status === 'Interview' ? 'Move to interview' : status === 'Selected' ? 'Select' : 'Reject'}</option>`).join('')}</select>` : '';
            const interviewAction = app.applicationStatus === 'Shortlisted' ? `<button type="button" class="btn btn-secondary btn-sm" data-pipeline-interview data-app-status="${CampusUtils.escapeHtml(app._id)}">Interview</button>` : '';
            const createOfferAction = app.applicationStatus === 'Selected' && !app.offer ? '<button class="btn btn-primary btn-sm" data-open-offers>Create offer</button>' : '';
            const resumeAction = `<button class="btn btn-secondary btn-sm" data-pipeline-resume="${CampusUtils.escapeHtml(student._id || '')}" ${student._id ? '' : 'disabled'}>Resume</button>`;
            const manualDocs = requiredDocs.filter((doc) => doc.hasFile && (doc.state === 'NEEDS_REVIEW' || (doc.state === 'REJECTED' && doc.verificationMethod === 'AI')));
            const manualInfo = group.title === 'Manual Checking' ? `<div class="pipeline-document-review">${requiredDocs.map((doc) => {
                const statusClass = doc.state === 'NEEDS_REVIEW' ? 'is-needs-review' : doc.state === 'REJECTED' ? 'is-rejected' : doc.state === 'VERIFIED' ? 'is-verified' : '';
                const statusText = doc.state === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : doc.state === 'REJECTED' ? 'DOCUMENT REJECTED · MANUAL CHECK' : doc.state.replaceAll('_', ' ');
                const failedChecks = (doc.verification?.checks || []).filter((check) => !check.passed).map((check) => `${check.label}${check.reason ? `: ${check.reason}` : ''}`);
                const reasons = [...new Set([...failedChecks, doc.verification?.reason, doc.rejectionReason].filter(Boolean))];
                return `<div class="pipeline-document-review-item ${doc.state === 'NEEDS_REVIEW' ? 'is-needs-review' : doc.state === 'REJECTED' ? 'is-rejected' : ''}"><p class="pipeline-skills pipeline-document-line"><span>${CampusUtils.escapeHtml(doc.name)}</span><span class="pipeline-document-status ${statusClass}">${CampusUtils.escapeHtml(statusText)}</span></p>${reasons.length ? `<ul class="pipeline-skills pipeline-document-reason">${reasons.map((reason) => `<li>${CampusUtils.escapeHtml(reason)}</li>`).join('')}</ul>` : '<p class="pipeline-skills pipeline-document-reason">No structured verification reason was returned.</p>'}${doc.verification?.confidence != null ? `<p class="pipeline-skills">Confidence · ${Number(doc.verification.confidence)}%</p>` : ''}</div>`;
            }).join('')}</div>` : '';
            const rejectedInfo = group.title === 'Rejected' && requiredDocs.some((doc) => doc.state === 'REJECTED') ? `<p class="workflow-terminal">✕ Document rejected · ${requiredDocs.filter((doc) => doc.state === 'REJECTED').map((doc) => `${CampusUtils.escapeHtml(doc.name)}${doc.rejectionReason ? `: ${CampusUtils.escapeHtml(doc.rejectionReason)}` : ''}`).join(' · ')}</p>` : '';
            const manualActions = group.title === 'Manual Checking' ? `<div class="pipeline-document-action-grid">${resumeAction}<button type="button" class="btn btn-secondary btn-sm pipeline-preview-action" aria-label="Preview Documents" data-pipeline-preview="${CampusUtils.escapeHtml(app.offer._id)}">Preview Docs</button>${manualDocs.map((doc) => `<div class="pipeline-document-actions"><div class="pipeline-document-action-buttons" role="group" aria-label="Review ${CampusUtils.escapeHtml(doc.name)}"><button type="button" class="btn btn-primary btn-sm pipeline-accept-action" data-pipeline-verify="${CampusUtils.escapeHtml(app.offer._id)}" data-doc-index="${doc.index}">Accept Document</button><button type="button" class="btn btn-secondary btn-sm pipeline-reject-action" data-pipeline-reject="${CampusUtils.escapeHtml(app.offer._id)}" data-doc-index="${doc.index}" data-doc-name="${CampusUtils.escapeHtml(doc.name)}">Reject Document</button></div></div>`).join('')}</div>${APPLICATION_NEXT[app.applicationStatus]?.includes('Rejected') ? `<button type="button" class="btn btn-secondary btn-sm" data-reject-candidate="${CampusUtils.escapeHtml(app._id)}">Reject Candidate</button>` : ''}` : '';
            const allRequiredVerified = requiredDocs.length > 0 && requiredDocs.every((doc) => doc.state === 'VERIFIED' && doc.hasFile);
            const canConfirmJoining = app.offer?.offerStatus === 'Documents Verified' && app.offer.joiningDate && allRequiredVerified;
            const verificationLabel = allRequiredVerified ? `<p class="pipeline-offer">✓ Documents Verified · Verification: ${requiredDocs.some((doc) => doc.verificationMethod === 'MANUAL') ? 'Manual' : 'AI Verified'}</p>` : '';
            const confirmJoiningAction = canConfirmJoining ? `<button type="button" class="btn btn-primary btn-sm" data-pipeline-confirm-joining="${CampusUtils.escapeHtml(app.offer._id)}">Confirm Joining</button>` : '';
            const eligibility = app.eligibility?.isEligible === true ? 'Eligible' : app.eligibility?.isEligible === false ? 'Ineligible' : 'Not assessed';
            return `<article class="pipeline-card"><div class="pipeline-card-title">${CampusUtils.studentAvatarMarkup(student.name, student._id)}<div><strong>${CampusUtils.escapeHtml(student.name || 'Student')}</strong><span>${CampusUtils.escapeHtml(profile.branch || 'Branch not provided')} · CGPA ${profile.cgpa ?? '—'}${readiness?.score != null ? ` · Readiness ${CampusUtils.escapeHtml(String(readiness.score))}/100` : ''}</span></div></div><p class="pipeline-job">${CampusUtils.escapeHtml(app.job?.requirements?.role || app.job?.title || 'Job')}</p><div class="pipeline-meta"><span>Match <b>${app.matching?.finalScore == null ? '—' : `${app.matching.finalScore}/100`}</b></span><span>${CampusUtils.formatDate(app.appliedAt)}</span></div>${matchDetails}${currentStatus}<span class="pipeline-eligibility">${eligibility}</span>${skills ? `<p class="pipeline-skills">Skills · ${CampusUtils.escapeHtml(skills)}</p>` : ''}${projects ? `<p class="pipeline-projects">Projects · ${CampusUtils.escapeHtml(projects)}</p>` : ''}${offerText}${verificationLabel}${manualInfo}${rejectedInfo}${terminalText}<div class="pipeline-actions">${group.title === 'Manual Checking' ? `${manualActions}${interviewAction}${actionMarkup}${createOfferAction}` : `${resumeAction}${interviewAction}${actionMarkup}${createOfferAction}`}${confirmJoiningAction}</div></article>`;
        }).join('') : '<p class="pipeline-empty">No candidates at this stage.</p>'}</div></section>`;
    }).join('');
    CampusUtils.hydrateStudentAvatars(board);
    board.querySelectorAll('[data-pipeline-resume]').forEach((button) => button.addEventListener('click', async () => {
        try { await CampusUtils.openStudentResume(button.dataset.pipelineResume); }
        catch (error) { CampusUtils.showToast(error.message || 'Resume is not available.', 'error'); }
    }));
    board.querySelectorAll('select[data-app-status]').forEach((select) => select.addEventListener('change', async () => {
        const application = pipelineApplications.find((item) => String(item._id) === select.dataset.appStatus);
        await handleApplicationAction(select, application);
    }));
    board.querySelectorAll('[data-pipeline-interview]').forEach((button) => button.addEventListener('click', () => {
        const application = pipelineApplications.find((item) => String(item._id) === button.dataset.appStatus);
        button.value = 'Interview';
        handleApplicationAction(button, application);
    }));
    board.querySelectorAll('[data-open-offers]').forEach((button) => button.addEventListener('click', () => document.querySelector('[data-section="offers"]')?.click()));
    board.querySelectorAll('[data-pipeline-see-all]').forEach((button) => button.addEventListener('click', () => {
        recruiterOfferCandidateStage = button.dataset.pipelineSeeAll;
        document.querySelector('[data-section="offers"]')?.click();
    }));
    board.querySelectorAll('[data-pipeline-preview]').forEach((button) => button.addEventListener('click', () => {
        const offer = pipelineApplications.find((app) => String(app.offer?._id) === button.dataset.pipelinePreview)?.offer;
        if (offer) window.showDocumentReview?.(offer, loadCandidatePipeline);
    }));
    board.querySelectorAll('[data-pipeline-verify], [data-pipeline-reject]').forEach((button) => button.addEventListener('click', async () => {
        const reject = button.hasAttribute('data-pipeline-reject');
        let reason;
        if (reject) {
            const values = await CampusUtils.requestForm('Reject document and request resubmission', [{ name: 'reason', label: `Reason for rejecting ${button.dataset.docName}`, required: true }]);
            if (!values) return;
            reason = values.reason;
        }
        button.disabled = true;
        try {
            await CampusAPI.patch(`/offers/${button.dataset[reject ? 'pipelineReject' : 'pipelineVerify']}/documents/${button.dataset.docIndex}/status`, { status: reject ? 'Rejected' : 'Verified', ...(reason ? { reason } : {}) });
            CampusUtils.showToast(reject ? 'Document rejected and resubmission requested.' : 'Document verified.', 'success');
            await loadCandidatePipeline();
        } catch (error) { button.disabled = false; CampusUtils.showToast(error.message, 'error'); }
    }));
    board.querySelectorAll('[data-reject-candidate]').forEach((button) => button.addEventListener('click', async () => {
        if (!window.confirm('Reject this candidate’s application? This changes the application status, not only the document status.')) return;
        button.disabled = true;
        const updated = await updateApplicationStatus(button.dataset.rejectCandidate, 'Rejected');
        if (!updated) button.disabled = false;
    }));
    board.querySelectorAll('[data-pipeline-confirm-joining]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await CampusAPI.patch(`/offers/${button.dataset.pipelineConfirmJoining}/status`, { status: 'Joining Confirmed' });
            CampusUtils.showToast('Joining confirmed.', 'success');
            await loadCandidatePipeline();
        } catch (error) { button.disabled = false; CampusUtils.showToast(error.message, 'error'); }
    }));
}

document.getElementById('pipeline-search')?.addEventListener('input', renderCandidatePipeline);
document.getElementById('pipeline-status-filter')?.addEventListener('change', renderCandidatePipeline);

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
            const oldVal = pendingDriveCreation?.jobId || sel.value;
            sel.innerHTML = '<option value="">Select a job...</option>';
            jobsRes.data.forEach(j => {
                const opt = document.createElement('option');
                opt.value = j._id;
                opt.textContent = j.title;
                if (j._id === oldVal) opt.selected = true;
                sel.appendChild(opt);
            });
            updateDriveApplicationContext();
        }
    } catch (_) {}

    // Load drives list
    try {
        const res = await CampusAPI.get('/drives');
        const drives = res.data || [];
        recruiterDrivesCache = drives;
        if (!drives.length) { recruiterDriveConflicts.clear(); renderRecruiterDrives(); return; }

        const conflictResults = await Promise.all(drives.map(async (drive) => {
            try { const result = await CampusAPI.post(`/drives/${encodeURIComponent(drive._id)}/check-conflicts`, {}); return [drive._id, result.data?.conflicts || []]; }
            catch { return [drive._id, null]; }
        }));
        recruiterDriveConflicts = new Map(conflictResults);
        renderRecruiterDrives();
    } catch (err) {
        const tbody = document.getElementById('drives-list');
        if (tbody) tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state workspace-error-state"><h3>Could not load drives</h3><p>${CampusUtils.escapeHtml(err.message || 'Please try again.')}</p><button type="button" class="btn btn-primary btn-sm" data-retry-recruiter-drives>Retry</button></div></td></tr>`;
        CampusUtils.showToast("Failed to load drives: " + err.message, "error");
    }
}

let recruiterDrivesCache = [];
let recruiterDriveConflicts = new Map();
function describeDriveConflict(conflict) {
    const date = (value) => String(value || 'date unavailable').slice(0, 10);
    if (conflict.type === 'drive_time_overlap') {
        const existing = conflict.existingDrive || conflict.conflictingDrive || {};
        const requested = conflict.requestedDrive || {};
        return `Drive cannot be created because another drive is already scheduled during this time. Existing Drive: ${existing.role || existing.company || 'Drive'} · ${date(existing.date)} · ${existing.startTime || '—'}–${existing.endTime || '—'}. Requested Drive: ${requested.role || 'Requested drive'} · ${date(requested.date)} · ${requested.startTime || '—'}–${requested.endTime || '—'}. Conflict: ${conflict.overlap?.startTime || '—'}–${conflict.overlap?.endTime || '—'}.`;
    }
    if (conflict.type === 'venue_time_overlap') return `Venue conflict with ${conflict.conflictingDrive?.role || conflict.conflictingDrive?.company || 'an existing drive'} · ${conflict.overlap?.date || 'date unavailable'} · ${conflict.overlap?.startTime || '—'}–${conflict.overlap?.endTime || '—'}.`;
    const other = conflict.conflictingDrive || {};
    return `${conflict.student?.name || 'Candidate'} has an interview conflict with ${other.role || 'another drive'} · ${other.date || 'date unavailable'} · ${conflict.overlap?.startTime || '—'}–${conflict.overlap?.endTime || '—'}.`;
}
function driveHasEnded(drive) {
    const dateKey = new Date(drive.date).toISOString().slice(0, 10);
    const time = /^\d{2}:\d{2}$/.test(drive.endTime || '') ? drive.endTime : '23:59';
    return new Date(`${dateKey}T${time}:00`) <= new Date();
}
function renderRecruiterDrives() {
        const tbody = document.getElementById('drives-list');
        if (!tbody) return;
        const query = (document.getElementById('recruiter-drive-search')?.value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('recruiter-drive-status')?.value || '';
        const sort = document.getElementById('recruiter-drive-sort')?.value || 'date-asc';
        const drives = recruiterDrivesCache.filter((drive) => (!statusFilter || drive.status === statusFilter) && (!query || `${drive.companyName || ''} ${drive.role || ''} ${drive.jobId?.title || ''} ${drive.venue || ''}`.toLowerCase().includes(query)));
        drives.sort(sort === 'date-desc' ? (a, b) => new Date(b.date) - new Date(a.date) : sort === 'company' ? (a, b) => (a.companyName || '').localeCompare(b.companyName || '') : (a, b) => new Date(a.date) - new Date(b.date));
        if (!drives.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><h3>${recruiterDrivesCache.length ? 'No drives match these filters' : 'No drives created yet'}</h3><p>${recruiterDrivesCache.length ? 'Try a different search or status.' : 'Create a drive to schedule recruitment activity.'}</p>${recruiterDrivesCache.length ? '<button type="button" class="btn btn-secondary btn-sm" data-clear-recruiter-drive-filters>Clear filters</button>' : '<button type="button" class="btn btn-primary btn-sm" data-create-first-drive>Create a drive</button>'}</div></td></tr>`; return; }
        tbody.innerHTML = drives.map((drive) => {
            const jobTitle = drive.jobId?.title || '—';
            const date = drive.date ? new Date(drive.date).toLocaleDateString() : '—';
            const time = `${drive.startTime} – ${drive.endTime}`;
            const mode = CampusUtils.escapeHtml(drive.mode || '—');
            const status = CampusUtils.escapeHtml(drive.status || 'Scheduled');
            const shortlisted = (drive.shortlistedCandidates || []).length;
            const added = (drive.addedCandidates || []).length;
            const conflicts = recruiterDriveConflicts.get(drive._id);
            const conflictCell = conflicts === null || conflicts === undefined ? '<span class="status-badge status-neutral" title="Run the conflict check to review schedule overlaps">Not checked</span>' : conflicts.length ? `<button type="button" class="status-badge status-warning drive-conflict-alert" aria-label="Review ${conflicts.length} drive conflict${conflicts.length === 1 ? '' : 's'}" data-drive-conflicts="${CampusUtils.escapeHtml(drive._id)}">⚠ ${conflicts.length} ${conflicts.length === 1 ? 'conflict' : 'conflicts'}</button>` : '<span class="status-badge status-success drive-conflict-clear">✓ No conflicts</span>';
            const location = drive.venue ? CampusUtils.escapeHtml(drive.venue) : '—';
            const company = CampusUtils.escapeHtml(drive.companyName || 'Company information unavailable');
            return `
                <tr><td><strong>${company}</strong><div class="table-meta">${CampusUtils.escapeHtml(drive.role || jobTitle)}</div></td>
                <td>${date}</td>
                <td>${time}</td>
                <td>${mode}</td>
                <td><span class="status-badge ${CampusUtils.statusBadgeClass(status)} drive-status-badge">${status}</span></td>
                <td>${added} added · ${shortlisted} shortlisted</td>
                <td>${location}</td>
                <td>${conflictCell}</td>
                <td><button type="button" class="btn btn-secondary btn-sm" data-manage-drive="${CampusUtils.escapeHtml(drive._id)}">Manage candidates</button> <button type="button" class="btn btn-secondary btn-sm" data-delete-drive="${CampusUtils.escapeHtml(drive._id)}">Delete Drive</button></td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('[data-manage-drive]').forEach((button) => button.addEventListener('click', () => openDriveCandidates(button.dataset.manageDrive)));
        tbody.querySelectorAll('[data-delete-drive]').forEach((button) => button.addEventListener('click', async () => {
            const drive = recruiterDrivesCache.find((item) => item._id === button.dataset.deleteDrive);
            if (!drive || !window.confirm(`Delete this drive?\n\n${drive.role || drive.jobId?.title || 'Drive'}\n\nDrive-specific candidate and scheduling associations will be removed. Jobs, applications, and offers will remain.`)) return;
            button.disabled = true;
            try {
                await CampusAPI.request(`/drives/${encodeURIComponent(drive._id)}`, { method: 'DELETE' });
                CampusUtils.showToast('Drive deleted.', 'success');
                await loadDrives();
            } catch (error) {
                CampusUtils.showToast(error.message || 'Could not delete drive.', 'error');
                button.disabled = false;
            }
        }));
        tbody.querySelectorAll('[data-drive-conflicts]').forEach((button) => button.addEventListener('click', () => {
            const conflicts = recruiterDriveConflicts.get(button.dataset.driveConflicts) || [];
            CampusUtils.showToast(conflicts.map(describeDriveConflict).join(' '), 'warning', 8000);
        }));
}

async function openDriveCandidates(driveId) {
    const dialog = document.getElementById('drive-candidates-dialog');
    const list = document.getElementById('drive-candidates-list');
    const context = document.getElementById('drive-candidates-context');
    const conflictBox = document.getElementById('drive-candidates-conflicts');
    const save = document.getElementById('drive-candidates-save');
    if (!dialog || !list || !save) return;
    const drive = recruiterDrivesCache.find((item) => item._id === driveId);
    if (!drive) return;
    save.disabled = true; list.textContent = 'Loading drive candidates…'; conflictBox.textContent = '';
    context.textContent = `${drive.companyName || 'Company'} · ${drive.jobId?.title || drive.role || 'Drive'}`;
    dialog.showModal();
    try {
        const jobId = drive.jobId?._id || drive.jobId;
        const [driveResponse, applicationsResponse, candidatesResponse] = await Promise.all([
            CampusAPI.get(`/drives/${encodeURIComponent(driveId)}`),
            CampusAPI.get(`/jobs/${encodeURIComponent(jobId)}/applications`),
            CampusAPI.get(`/jobs/${encodeURIComponent(jobId)}/candidates?includeIneligible=true&applicantsOnly=true`)
        ]);
        const fullDrive = driveResponse.data || drive;
        const applications = applicationsResponse.data || [];
        const appByStudent = new Map(applications.map((app) => [String(app.studentId?._id || app.studentId), app]));
        const matchingByStudent = new Map((candidatesResponse.data || []).map((candidate) => [String(candidate.studentId), candidate]));
        const roster = new Map();
        [...(fullDrive.addedCandidates || []), ...(fullDrive.shortlistedCandidates || [])].forEach((candidate) => roster.set(String(candidate._id || candidate), candidate));
        applications.forEach((application) => {
            if (String(application.driveId?._id || application.driveId || '') === String(driveId)) {
                const studentId = String(application.studentId?._id || application.studentId);
                if (!roster.has(studentId)) roster.set(studentId, application.studentId);
            }
        });
        const already = new Set(roster.keys());
        list.replaceChildren();
        const heading = document.createElement('h3'); heading.textContent = 'Candidates on this drive'; list.append(heading);
        const currentList = document.createElement('div'); currentList.className = 'drive-candidate-current';
        const driveIsPast = ['Completed', 'Cancelled'].includes(fullDrive.status) || driveHasEnded(fullDrive);
        [...roster.values()].forEach((candidate) => {
            const studentId = String(candidate._id || candidate), application = appByStudent.get(studentId);
            const row = document.createElement('div'); row.className = 'drive-candidate-current-row';
            const isShortlisted = (fullDrive.shortlistedCandidates || []).some((item) => String(item._id || item) === studentId);
            const name = document.createElement('span'); name.textContent = `${candidate.name || 'Student'} · ${application?.status || (isShortlisted ? 'Shortlisted' : 'Added · awaiting application')}${application?.interviewScheduledAt ? ` · Interview ${new Date(application.interviewScheduledAt).toLocaleString()}` : ''}`;
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-secondary btn-sm'; remove.textContent = 'Remove';
            const protectedByAppointment = Boolean(application?.interviewScheduledAt);
            const locked = driveIsPast || protectedByAppointment || ['Selected', 'Offer', 'Hired'].includes(application?.status);
            remove.disabled = locked;
            if (protectedByAppointment) { remove.textContent = 'Interview Scheduled — Protected'; remove.title = 'A scheduled interview protects this drive association.'; }
            else if (locked) remove.title = driveIsPast ? 'Candidates cannot be removed from a completed or past drive.' : 'Candidates with a selected or completed hiring outcome cannot be removed.';
            remove.addEventListener('click', async () => {
                if (!window.confirm('Remove this candidate from this drive?')) return;
                remove.disabled = true;
                try {
                    await CampusAPI.request(`/drives/${encodeURIComponent(driveId)}/candidates/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
                    dialog.close(); await loadDrives(); await openDriveCandidates(driveId);
                } catch (error) { CampusUtils.showToast(error.message || 'Could not remove candidate.', 'error'); remove.disabled = false; }
            });
            const controls = document.createElement('span');
            if (application?.status === 'Interview' && !protectedByAppointment && !['Selected', 'Offer', 'Hired'].includes(application.status)) {
                const schedule = document.createElement('button'); schedule.type = 'button'; schedule.className = 'btn btn-secondary btn-sm'; schedule.textContent = 'Schedule Interview';
                schedule.addEventListener('click', async () => {
                    const scheduledAt = await CampusUtils.requestForm('Schedule candidate interview', [{ name: 'scheduledAt', label: 'Interview date and time', type: 'datetime-local', required: true, min: new Date(Date.now() + 60000).toISOString().slice(0, 16) }]);
                    if (!scheduledAt) return;
                    try {
                        await CampusAPI.patch(`/applications/${encodeURIComponent(application._id)}/interview-schedule`, { scheduledAt: new Date(scheduledAt.scheduledAt).toISOString() });
                        CampusUtils.showToast('Interview scheduled. This candidate is now protected from removal.', 'success');
                        dialog.close(); await loadDrives(); await openDriveCandidates(driveId);
                    } catch (error) { CampusUtils.showToast(error.message || 'Could not schedule interview.', 'error'); }
                });
                controls.append(schedule);
            }
            if (!isShortlisted && ['Applied', 'Eligible'].includes(application?.status) && !driveIsPast) {
                const shortlist = document.createElement('button'); shortlist.type = 'button'; shortlist.className = 'btn btn-primary btn-sm'; shortlist.textContent = 'Shortlist';
                shortlist.addEventListener('click', async () => {
                    shortlist.disabled = true;
                    try {
                        await CampusAPI.post(`/drives/${encodeURIComponent(driveId)}/shortlist`, { studentIds: [studentId] });
                        CampusUtils.showToast('Candidate shortlisted.', 'success');
                        dialog.close(); await loadDrives(); await openDriveCandidates(driveId);
                    } catch (error) {
                        const details = (error.conflicts || []).map(describeDriveConflict).join(' ');
                        conflictBox.textContent = details || error.message || 'Could not shortlist candidate.';
                        CampusUtils.showToast(conflictBox.textContent, 'error', 6500);
                        shortlist.disabled = false;
                    }
                });
                controls.append(shortlist);
            }
            controls.append(remove);
            row.append(name, controls); currentList.append(row);
        });
        if (!currentList.childElementCount) currentList.textContent = 'No candidates are currently added to this drive.';
        list.append(currentList);

        const addHeading = document.createElement('h3'); addHeading.textContent = 'Suggested candidates · ranked for this job';
        const picker = document.createElement('div'); picker.className = 'drive-candidate-picker';
        const suggestions = applications
            .filter((application) => application.studentId && typeof application.studentId === 'object')
            .map((application) => ({ application, match: matchingByStudent.get(String(application.studentId._id)) }))
            .filter((item) => item.match)
            .sort((a, b) => Number(b.match.matchScore || 0) - Number(a.match.matchScore || 0));
        if (!suggestions.length) { const empty = document.createElement('p'); empty.textContent = 'No applicants have applied to this job yet.'; picker.append(empty); }
        suggestions.forEach(({ application, match: candidate }, index) => {
            const studentId = String(application.studentId._id);
            const appStatus = application.status || 'Applied';
            const linkedDrive = application.driveId && String(application.driveId._id || application.driveId) !== String(driveId) ? application.driveId : null;
            const onCurrentDrive = already.has(studentId) || String(application.driveId?._id || application.driveId || '') === String(driveId);
            const otherDrive = linkedDrive;
            const terminal = ['Hired', 'Rejected', 'Withdrawn'].includes(appStatus);
            const canAdd = !onCurrentDrive && !otherDrive && !terminal && ['Applied', 'Eligible', 'Shortlisted'].includes(appStatus) && application.eligibility?.isEligible === true && candidate.eligible === true;
            const option = document.createElement('div'); option.className = 'drive-candidate-option';
            const label = document.createElement('label');
            const name = document.createElement('span');
            name.textContent = `${index + 1}. ${candidate.studentName || application.studentId.name || 'Student'} · ${appStatus} · ${candidate.matchScore}/100 · ${candidate.matchCategory || 'Match'}`;
            label.append(name);

            const details = document.createElement('details'); details.className = 'match-explanation';
            const summary = document.createElement('summary'); summary.textContent = 'Why this match?';
            const explanation = candidate.explanation || {};
            const matchedRequired = candidate.skillDetail?.matchedRequired || [];
            const missingRequired = explanation.missingRequiredSkills || candidate.skillDetail?.missingRequired || [];
            const matchedPreferred = candidate.skillDetail?.matchedPreferred || [];
            const missingPreferred = explanation.weakPreferredSkills || candidate.skillDetail?.missingPreferred || [];
            const projectEvidence = candidate.projectDetail?.matchedInProjects || [];
            const facts = (explanation.facts || []).map((fact) => `<li>${CampusUtils.escapeHtml(fact.text || '')}</li>`).join('');
            details.innerHTML = `<summary>${CampusUtils.escapeHtml(summary.textContent)}</summary><p><strong>Overall:</strong> ${Number(candidate.matchScore)}/100 · ${CampusUtils.escapeHtml(candidate.matchCategory || 'Match')}</p><p><strong>Required matched:</strong> ${CampusUtils.escapeHtml(matchedRequired.join(', ') || 'None')}<br><strong>Required missing:</strong> ${CampusUtils.escapeHtml(missingRequired.join(', ') || 'None')}</p><p><strong>Preferred matched:</strong> ${CampusUtils.escapeHtml(matchedPreferred.join(', ') || 'None')}<br><strong>Preferred missing:</strong> ${CampusUtils.escapeHtml(missingPreferred.join(', ') || 'None')}</p><p><strong>Project relevance:</strong> ${Number(candidate.breakdown?.projectRelevance ?? 0)}%${projectEvidence.length ? ` · ${CampusUtils.escapeHtml(projectEvidence.join(', '))}` : ' · No required skills evidenced in projects'}</p><p><strong>Academic eligibility:</strong> ${candidate.eligible ? 'Eligible' : 'Not eligible'}${candidate.cgpa != null ? ` · CGPA ${CampusUtils.escapeHtml(candidate.cgpa)}` : ''}</p>${facts ? `<ul>${facts}</ul>` : ''}`;
            const state = document.createElement('span'); state.className = 'drive-candidate-state';
            const add = document.createElement('button'); add.type = 'button'; add.className = 'btn btn-primary btn-sm'; add.textContent = 'Add Candidate';
            if (onCurrentDrive) { state.textContent = 'Already Added'; add.hidden = true; }
            else if (otherDrive) {
                const driveTitle = otherDrive.role || otherDrive.jobId?.title || 'another drive';
                state.textContent = `Already added to another ${driveTitle} drive for ${otherDrive.companyName || 'this company'}.`;
                add.hidden = true;
            } else if (appStatus === 'Hired') { state.textContent = 'Hired — Cannot Add'; add.hidden = true; }
            else if (['Rejected', 'Withdrawn'].includes(appStatus)) { state.textContent = 'Rejected — Cannot Add'; add.hidden = true; }
            else if (!application.eligibility?.isEligible || !candidate.eligible) { state.textContent = 'Not eligible — Cannot Add'; add.hidden = true; }
            else if (!canAdd) { state.textContent = 'Cannot Add'; add.hidden = true; }
            add.addEventListener('click', async () => {
                const candidateName = candidate.studentName || application.studentId.name || 'this candidate';
                const jobName = fullDrive.jobId?.title || fullDrive.role || 'this job';
                if (!await confirmAddAndMoveToInterview(candidateName, jobName, appStatus)) return;
                add.disabled = true;
                try {
                    await CampusAPI.post(`/drives/${encodeURIComponent(driveId)}/candidates`, { studentIds: [studentId] });
                    CampusUtils.showToast('Candidate added to the drive and moved to Interview.', 'success');
                    dialog.close(); await loadDrives(); await openDriveCandidates(driveId);
                } catch (error) {
                    state.textContent = error.message || 'Could not add candidate.';
                    add.disabled = false;
                }
            });
            option.append(label, details, state, add); picker.append(option);
        });
        list.append(addHeading, picker);
        save.hidden = true;
        if (driveIsPast) picker.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    } catch (error) { list.textContent = error.message || 'Unable to load applicants.'; save.disabled = true; }
}

document.getElementById('drive-candidates-cancel')?.addEventListener('click', () => document.getElementById('drive-candidates-dialog')?.close());

['recruiter-drive-search', 'recruiter-drive-status', 'recruiter-drive-sort'].forEach((id) => {
    const control = document.getElementById(id);
    control?.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderRecruiterDrives);
});

document.getElementById('drives-list')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-recruiter-drives]')) loadDrives();
    if (event.target.closest('[data-create-first-drive]')) {
        document.getElementById('drive-job-id')?.focus();
        document.getElementById('create-drive-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (event.target.closest('[data-clear-recruiter-drive-filters]')) {
        document.getElementById('recruiter-drive-search').value = '';
        document.getElementById('recruiter-drive-status').value = '';
        document.getElementById('recruiter-drive-sort').value = 'date-asc';
        renderRecruiterDrives();
    }
});

// ==============================
// JD ANALYSIS (Phase 6 — unchanged)
// ==============================
async function analyzeJd(jobId) {
    try {
        CampusUtils.showToast("Analyzing JD with AI...", "info");
        const res = await CampusAPI.post(`/jobs/${jobId}/analyze`);

        if (res.success) {
            CampusUtils.showToast("JD analyzed successfully!", "success");
            showJdAnalysis(res.data.aiAnalysis || res.data.requirements, res.data.requirements);
        }
    } catch (err) {
        CampusUtils.showToast(err.message, "error");
    }
}

function showJdAnalysis(analysis, requirements = {}) {
    const dialog = document.createElement('dialog'); dialog.className = 'placement-detail-dialog nlp-analysis-dialog';
    const header = document.createElement('div'); header.className = 'placement-detail-header';
    const title = document.createElement('h2'); title.textContent = 'AI / NLP Analysis';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn btn-secondary btn-sm'; close.textContent = 'Close'; close.addEventListener('click', () => dialog.close());
    header.append(title, close);
    const body = document.createElement('div'); body.className = 'placement-detail-body';
    const addSection = (label, value) => {
        const section = document.createElement('section'); section.className = 'nlp-analysis-group';
        const heading = document.createElement('h3'); heading.textContent = label; section.append(heading);
        const entries = Array.isArray(value) ? value.filter(Boolean) : String(value || '').trim() ? [String(value).trim()] : [];
        if (!entries.length) { const empty = document.createElement('p'); empty.className = 'form-help'; empty.textContent = 'No information extracted.'; section.append(empty); }
        else { const list = document.createElement('ul'); entries.forEach((entry) => { const item = document.createElement('li'); item.textContent = String(entry); list.append(item); }); section.append(list); }
        body.append(section);
    };
    const extracted = analysis || {};
    addSection('Extracted role', extracted.role);
    addSection('Required skills', extracted.requiredSkills);
    addSection('Preferred skills', extracted.preferredSkills);
    addSection('Education', extracted.education);
    addSection('Experience', extracted.experience);
    addSection('Responsibilities', extracted.responsibilities);
    addSection('Matcher-normalized required skills', extracted.normalizedJobRequiredSkills || extracted.normalizedRequiredSkills || []);
    addSection('Matcher-normalized preferred skills', extracted.normalizedJobPreferredSkills || extracted.normalizedPreferredSkills || []);
    dialog.append(header, body); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
}

// ==============================
// DASHBOARD
// ==============================
async function loadDashboard() {
    const user = CampusAuth.getCurrentUser();

    try {
        const res = await CampusAPI.get(`/jobs?recruiterId=${user.id}`);

        if (res.success) {
            const jobs = res.data || [];
            const active = jobs.filter(j => j.status === 'active').length;
            document.getElementById('stat-active-jobs').textContent = active;
            document.getElementById('stat-total-jobs').textContent = jobs.length;
            const activeJobs = jobs.filter((job) => job.status === 'active');
            const [applicationsByJob, offersResponse, matchesByJob] = await Promise.all([
                Promise.all(jobs.map(async (job) => {
                    const response = await CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/applications`);
                    return (response.data || []).map((application) => ({ ...application, _jobTitle: job.requirements?.role || job.title }));
                })),
                CampusAPI.get('/offers'),
                Promise.all(activeJobs.map(async (job) => {
                    try {
                        const response = await CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/candidates`);
                        return (response.data || []).map((candidate) => ({ ...candidate, _jobId: job._id, _jobTitle: job.requirements?.role || job.title }));
                    } catch (error) {
                        console.warn(`Could not load matches for ${job.title || 'job'}`, error);
                        return [];
                    }
                }))
            ]);
            const applications = applicationsByJob.flat();
            const counts = applications.reduce((summary, application) => {
                const status = String(application.status || '').trim().toLowerCase();
                if (status === 'shortlisted') summary.shortlisted += 1;
                if (status === 'interview') summary.interview += 1;
                if (status === 'selected') summary.selected += 1;
                return summary;
            }, { shortlisted: 0, interview: 0, selected: 0 });
            document.getElementById('stat-shortlisted-apps').textContent = counts.shortlisted;
            document.getElementById('stat-interview-apps').textContent = counts.interview;
            document.getElementById('stat-selected-apps').textContent = counts.selected;
            const pipeline = document.getElementById('recruiter-dashboard-pipeline');
            const offers = offersResponse.data || [];
            const stages = [['Applications', applications.length, 'is-application'], ['Shortlisted', counts.shortlisted, 'is-shortlisted'], ['Interview', counts.interview, 'is-interview'], ['Selected', counts.selected, 'is-selected'], ['Offers', offers.length, 'is-offer']];
            if (pipeline) pipeline.innerHTML = stages.map(([label, value, tone]) => `<div class="recruiter-pipeline-step ${tone}"><strong>${value}</strong><span>${label}</span><i style="width:${applications.length ? Math.max(4, value / applications.length * 100) : 0}%"></i></div>`).join('');
            const recent = document.getElementById('recruiter-dashboard-recent');
            const latest = applications.slice().sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0)).slice(0, 5);
            if (recent) recent.innerHTML = latest.length ? latest.map((application) => `<div class="dashboard-activity-row"><div><strong>${CampusUtils.escapeHtml(application.studentId?.name || 'Student')}</strong><small>${CampusUtils.escapeHtml(application._jobTitle || 'Job application')}${application.appliedAt ? ` · ${CampusUtils.formatDate(application.appliedAt)}` : ''}</small></div><span class="status-badge ${CampusUtils.statusBadgeClass(application.status)}">${CampusUtils.escapeHtml(application.status || 'Applied')}</span></div>`).join('') : '<p class="dashboard-empty-note">New candidate applications will appear here.</p>';
            const matchList = document.getElementById('recruiter-dashboard-matches');
            if (matchList) {
                const jobPicker = document.getElementById('recruiter-dashboard-match-job');
                const reviewButton = document.getElementById('recruiter-dashboard-review-matches');
                const matchNote = document.getElementById('recruiter-dashboard-match-note');
                const previousJob = jobPicker?.value;
                if (jobPicker) {
                    jobPicker.innerHTML = activeJobs.length
                        ? activeJobs.map((job) => `<option value="${CampusUtils.escapeHtml(String(job._id))}">${CampusUtils.escapeHtml(job.requirements?.role || job.title || 'Open role')}</option>`).join('')
                        : '<option value="">No active jobs</option>';
                    if (activeJobs.some((job) => String(job._id) === previousJob)) jobPicker.value = previousJob;
                    else if (activeJobs.length) jobPicker.value = String(activeJobs[0]._id);
                }
                const renderSelectedJobMatches = () => {
                    const selectedJob = activeJobs.find((job) => String(job._id) === jobPicker?.value);
                    if (reviewButton) reviewButton.disabled = !selectedJob;
                    if (!selectedJob) {
                        if (matchNote) matchNote.textContent = 'Create or activate a job to see matched students.';
                        matchList.innerHTML = '<p class="dashboard-empty-note">Your active job matches will appear here.</p>';
                        return;
                    }
                    const jobTitle = selectedJob.requirements?.role || selectedJob.title || 'Open role';
                    if (matchNote) matchNote.textContent = `Eligible candidates matched to ${jobTitle}.`;
                    const bestByStudent = new Map();
                    (matchesByJob[activeJobs.indexOf(selectedJob)] || []).filter((candidate) => candidate.eligible && candidate.studentId).forEach((candidate) => {
                        const studentId = String(candidate.studentId?._id || candidate.studentId?.id || candidate.studentId);
                        const current = bestByStudent.get(studentId);
                        if (!current || Number(candidate.matchScore || 0) > Number(current.matchScore || 0)) bestByStudent.set(studentId, candidate);
                    });
                    const bestMatches = [...bestByStudent.values()].sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0)).slice(0, 6);
                    matchList.innerHTML = bestMatches.length ? bestMatches.map((candidate) => `<article class="recruiter-dashboard-match-row"><div class="recruiter-dashboard-match-person">${CampusUtils.studentAvatarMarkup(candidate.studentName || candidate.studentId?.name || 'Student', candidate.studentId)}<div><strong>${CampusUtils.escapeHtml(candidate.studentName || candidate.studentId?.name || 'Student')}</strong><small>${CampusUtils.escapeHtml(candidate.branch || candidate.studentId?.branch || 'Branch not provided')}</small></div></div><span class="recruiter-dashboard-match-score"><strong>${Number(candidate.matchScore) || 0}</strong><small>/100</small></span></article>`).join('') : '<p class="dashboard-empty-note">No eligible matches were found for this job.</p>';
                    CampusUtils.hydrateStudentAvatars(matchList);
                };
                if (jobPicker) jobPicker.onchange = renderSelectedJobMatches;
                if (reviewButton) reviewButton.onclick = () => {
                    const job = activeJobs.find((item) => String(item._id) === jobPicker?.value);
                    if (job) viewCandidates(job._id, job.requirements?.role || job.title || 'Open role');
                };
                renderSelectedJobMatches();
            }
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

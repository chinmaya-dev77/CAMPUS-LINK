/**
 * CampusLink — placement.js
 * Placement cell command dashboard logic.
 *
 * Phase 8: drive management + conflict display
 * Phase 9: conflict-aware scheduling
 * Phase 10: offer tracking
 * Phase 11: analytics dashboard
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
    CampusAuth.requireRole("placement");
    CampusAuth.populateSidebarUser();
    CampusAuth.attachLogoutHandler();

    const button = document.getElementById("check-drive-conflicts");
    const results = document.getElementById("scheduling-conflict-results");
    if (button && results) button.addEventListener("click", async () => {
        button.disabled = true;
        results.textContent = "Checking scheduled drives…";
        try {
            const response = await CampusAPI.get("/drives");
            const drives = response.data || [];
            if (!drives.length) {
                results.textContent = "No drives are available to check yet.";
                return;
            }
            const checks = await Promise.all(drives.map(async (drive) => {
                const result = await CampusAPI.post(`/drives/${encodeURIComponent(drive._id)}/check-conflicts`, {});
                return { drive, conflicts: result.data.conflicts || [] };
            }));
            const unique = new Map();
            checks.forEach(({ conflicts }) => conflicts.forEach((conflict) => {
                const drives = [conflict.currentDrive.id, conflict.conflictingDrive.id].sort().join(":");
                const key = `${conflict.type}:${conflict.studentId || "venue"}:${drives}`;
                if (!unique.has(key)) unique.set(key, conflict);
            }));
            const allConflicts = [...unique.values()];
            if (!allConflicts.length) {
                results.textContent = "No scheduling conflicts found.";
                return;
            }
            const list = document.createElement("ul");
            allConflicts.forEach((conflict) => {
                const item = document.createElement("li");
                const current = conflict.currentDrive;
                const other = conflict.conflictingDrive;
                const student = conflict.student ? `Student: ${conflict.student.name}. ` : "";
                const type = conflict.type === "venue_time_overlap" ? "Venue time overlap" : "Student time overlap";
                item.textContent = `${type}. ${student}${current.company} (${current.role}) — ${current.date}, ${current.startTime}–${current.endTime}${current.venue ? `, ${current.venue}` : ""}; ${other.company} (${other.role}) — ${other.date}, ${other.startTime}–${other.endTime}${other.venue ? `, ${other.venue}` : ""}.`;
                list.appendChild(item);
            });
            results.replaceChildren(list);
        } catch (error) {
            results.textContent = error.message || "Could not check drive conflicts.";
        } finally {
            button.disabled = false;
        }
    });

    const offersSection = document.getElementById("placement-offers");
    document.querySelectorAll('.sidebar-link').forEach((link) => link.addEventListener('click', () => {
        const conflicts = document.getElementById('scheduling-conflicts');
        if (link.dataset.section === 'offers') {
            if (offersSection) offersSection.style.display = 'block';
            if (conflicts) conflicts.style.display = 'none';
            loadOfferManagement();
        } else {
            if (offersSection) offersSection.style.display = 'none';
            if (conflicts) conflicts.style.display = '';
        }
    }));
    document.getElementById('refresh-offers')?.addEventListener('click', loadOfferManagement);

    async function loadOfferManagement() {
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
        const candidateBody = document.getElementById('selected-candidates-list');
        const offerBody = document.getElementById('placement-offers-list');
        if (!candidateBody || !offerBody) return;
        candidateBody.innerHTML = '<tr><td colspan="5">Loading selected candidates...</td></tr>';
        offerBody.innerHTML = '<tr><td colspan="7">Loading offers...</td></tr>';
        try {
            const [jobsResponse, offersResponse] = await Promise.all([CampusAPI.get('/jobs'), CampusAPI.get('/offers')]);
            const offers = offersResponse.data || [];
            const offeredApplications = new Set(offers.map((offer) => offer.applicationId?._id || offer.applicationId));
            const applications = (await Promise.all((jobsResponse.data || []).map(async (job) => {
                const response = await CampusAPI.get(`/jobs/${encodeURIComponent(job._id)}/applications`);
                return (response.data || []).filter((app) => app.status === 'Selected').map((app) => ({ ...app, _job: job }));
            }))).flat();
            const selected = applications.filter((app) => !offeredApplications.has(app._id));
            candidateBody.innerHTML = selected.length ? selected.map((app) => `<tr><td>${CampusUtils.studentAvatarMarkup(app.studentId?.name, app.studentId?._id)} ${CampusUtils.escapeHtml(app.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(app._job.companyName || '—')}</td><td>${CampusUtils.escapeHtml(app._job.requirements?.role || app._job.title)}</td><td>${app._id}</td><td><button class="btn btn-secondary btn-sm" data-selected-resume="${app.studentId?._id || ''}">Resume</button> <button class="btn btn-primary btn-sm" data-create-offer="${app._id}">Create offer</button></td></tr>`).join('') : '<tr><td colspan="5">No selected candidates waiting for an offer.</td></tr>';
            CampusUtils.hydrateStudentAvatars(candidateBody);
            candidateBody.querySelectorAll('[data-create-offer]').forEach((action) => action.addEventListener('click', async () => {
                const values = await CampusUtils.requestForm('Create Offer', [
                    { name: 'ctc', label: 'Annual CTC/package in rupees', type: 'number', min: '0', step: 'any', required: true },
                    { name: 'joiningDate', label: 'Joining date (optional)', type: 'date' }
                ]);
                if (!values) return;
                try { await CampusAPI.post('/offers', { applicationId: action.dataset.createOffer, ctc: Number(values.ctc), ...(values.joiningDate ? { joiningDate: values.joiningDate } : {}) }); CampusUtils.showToast('Offer created.', 'success'); loadOfferManagement(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.innerHTML = offers.length ? offers.map((offer) => {
                const nextStatuses = nextStatusesByCurrentStatus[offer.offerStatus] || [];
                const documentAction = ['Accepted', 'Documentation Pending'].includes(offer.offerStatus)
                    ? `<button class="btn btn-secondary btn-sm" data-docs="${offer._id}">Update documents</button> `
                    : '';
                const statusControl = nextStatuses.length
                    ? `<select data-status="${offer._id}" aria-label="Next offer status"><option value="">Update status…</option>${nextStatuses.map((status) => `<option>${status}</option>`).join('')}</select>`
                    : '';
                return `<tr><td>${CampusUtils.studentAvatarMarkup(offer.studentId?.name, offer.studentId?._id)} ${CampusUtils.escapeHtml(offer.studentId?.name || 'Student')}</td><td>${CampusUtils.escapeHtml(offer.companyName)} / ${CampusUtils.escapeHtml(offer.role)}</td><td>₹${Number(offer.ctc).toLocaleString('en-IN')}</td><td><span class="status-badge">${CampusUtils.escapeHtml(offer.offerStatus)}</span></td><td>${CampusUtils.escapeHtml(offer.documentStatus || 'Pending')}</td><td>${offer.joiningDate ? new Date(offer.joiningDate).toLocaleDateString() : '—'}</td><td><button class="btn btn-secondary btn-sm" data-offer-resume="${offer.studentId?._id || ''}">Resume</button> <button class="btn btn-secondary btn-sm" data-joining-date="${offer._id}">${offer.joiningDate ? 'Edit' : 'Set'} joining date</button> ${documentAction}${statusControl}</td></tr>`;
            }).join('') : '<tr><td colspan="7">No offers created yet.</td></tr>';
            CampusUtils.hydrateStudentAvatars(offerBody);
            candidateBody.querySelectorAll('[data-selected-resume]').forEach((button) => button.addEventListener('click', async () => {
                try { await CampusUtils.openStudentResume(button.dataset.selectedResume); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.querySelectorAll('[data-offer-resume]').forEach((button) => button.addEventListener('click', async () => {
                try { await CampusUtils.openStudentResume(button.dataset.offerResume); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.querySelectorAll('[data-joining-date]').forEach((action) => action.addEventListener('click', async () => {
                const offer = offers.find((item) => item._id === action.dataset.joiningDate);
                const currentDate = offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '';
                const values = await CampusUtils.requestForm('Joining Date', [
                    { name: 'joiningDate', label: 'Joining date', type: 'date', value: currentDate, required: true }
                ]);
                if (!values) return;
                try { await CampusAPI.patch(`/offers/${offer._id}/joining-date`, { joiningDate: values.joiningDate }); CampusUtils.showToast('Joining date updated.', 'success'); loadOfferManagement(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
            offerBody.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', async () => {
                if (!select.value) return;
                try { await CampusAPI.patch(`/offers/${select.dataset.status}/status`, { status: select.value }); CampusUtils.showToast('Offer status updated.', 'success'); loadOfferManagement(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); select.value = ''; }
            }));
            offerBody.querySelectorAll('[data-docs]').forEach((action) => action.addEventListener('click', async () => {
                const offer = offers.find((item) => item._id === action.dataset.docs);
                const values = await CampusUtils.requestForm('Update Document', [
                    { name: 'name', label: 'Document name', type: 'text', value: offer.documents?.[0]?.name || 'Identity Proof', required: true },
                    { name: 'status', label: 'Document status', type: 'select', options: ['Pending', 'Submitted', 'Verified', 'Rejected'], value: offer.documents?.[0]?.status || 'Submitted', required: true }
                ]);
                if (!values) return;
                try { await CampusAPI.patch(`/offers/${offer._id}/documents`, { documents: [{ name: values.name, status: values.status }] }); CampusUtils.showToast('Document status updated.', 'success'); loadOfferManagement(); }
                catch (error) { CampusUtils.showToast(error.message, 'error'); }
            }));
        } catch (error) {
            candidateBody.innerHTML = `<tr><td colspan="5">${CampusUtils.escapeHtml(error.message)}</td></tr>`;
            offerBody.innerHTML = '<tr><td colspan="7">Could not load offer data.</td></tr>';
        }
    }
});

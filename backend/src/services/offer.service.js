const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Offer = require('../models/Offer');
const Application = require('../models/Application');
const Job = require('../models/Job');
const Drive = require('../models/Drive');
const Recruiter = require('../models/Recruiter');
const User = require('../models/User');
const { transitions, canTransition } = require('./offer.transitions');
const { notify } = require('./notification.service');
const { uploadBuffer, deleteAsset, downloadAsset } = require('./cloudinary.service');
const { extractText, renderPdfPages } = require('./pdf.service');
const { extractPlacementDocument } = require('./ai.service');
const Student = require('../models/Student');
const { normalizeBranch } = require('./branch.domain');

function fail(message, status = 400, code = 'INVALID_INPUT') {
    const err = new Error(message); err.status = status; err.code = code; throw err;
}
async function saveOffer(offer) {
    try { return await offer.save(); }
    catch (error) {
        if (error.name === 'VersionError') fail('This offer changed in another request. Refresh and try again.', 409, 'CONCURRENT_UPDATE');
        throw error;
    }
}
function validateId(id, label) { if (!mongoose.isValidObjectId(id)) fail(`${label} must be a valid ID`); }
function validDocumentContent(file) {
    const bytes = file?.buffer;
    if (!Buffer.isBuffer(bytes)) return false;
    const signatures = {
        'application/pdf': bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-',
        'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
        'image/jpg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
        'image/png': bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    };
    return Boolean(signatures[file.mimetype]);
}
function assertOwner(offer, actor) {
    if (actor.role === 'recruiter' && offer.recruiterId.toString() !== actor.id.toString()) fail('Not authorized to manage this offer', 403, 'FORBIDDEN');
}
function assertRecruiter(offer, actor) {
    if (actor.role !== 'recruiter' || offer.recruiterId.toString() !== actor.id.toString()) fail('Only the owning recruiter can manage this offer', 403, 'FORBIDDEN');
}
function populated(query) {
    return query.populate('studentId', 'name email').populate('applicationId', 'status eligibility matching appliedAt').populate('jobId', 'title status requirements').populate('driveId', 'companyName role date startTime endTime venue mode');
}
function placementSafe(offer, actor) {
    if (actor.role !== 'placement' || !offer) return offer;
    const plain = offer.toObject ? offer.toObject() : { ...offer };
    plain.documents = (plain.documents || []).map((doc) => ({
        name: doc.name,
        required: doc.required,
        status: doc.status,
        verificationStatus: verificationStatusOf(doc),
        verificationMethod: doc.verificationMethod
    }));
    return plain;
}
function verificationStatusOf(doc) {
    if (doc?.verificationStatus) return doc.verificationStatus;
    if (doc?.status === 'Verified') return 'VERIFIED';
    if (doc?.status === 'Rejected') return 'REJECTED';
    if (doc?.status === 'Submitted') return 'NEEDS_REVIEW';
    return 'PENDING';
}
function documentByReference(offer, reference) {
    const byId = mongoose.isValidObjectId(reference) ? offer.documents.id?.(reference) : null;
    if (byId) return { doc: byId, index: offer.documents.indexOf(byId) };
    const index = Number(reference);
    return Number.isInteger(index) && index >= 0 && index < offer.documents.length
        ? { doc: offer.documents[index], index }
        : { doc: null, index: -1 };
}
function syncDocumentSummary(offer) {
    const required = offer.documents.filter((doc) => doc.required);
    const complete = required.length > 0 && required.every((doc) => verificationStatusOf(doc) === 'VERIFIED' && doc.hasFile);
    const wasComplete = offer.offerStatus === 'Documents Verified' || offer.offerStatus === 'Joining Confirmed';
    if (complete) {
        offer.documentStatus = 'Verified';
        if (!wasComplete) {
            offer.offerStatus = 'Documents Verified';
            offer.statusHistory.push({ status: 'Documents Verified' });
        }
    } else {
        offer.documentStatus = required.some((doc) => verificationStatusOf(doc) !== 'PENDING') ? 'Submitted' : 'Pending';
        if (offer.offerStatus === 'Documents Verified') offer.offerStatus = 'Documentation Pending';
    }
    return complete && !wasComplete;
}
function documentVerificationCycle(offer) {
    return (offer.statusHistory || []).filter((entry) => entry.status === 'Documents Verified').length;
}
function validateDocumentRequirements(documents) {
    if (!Array.isArray(documents)) fail('documents must be an array');
    const clean = documents.map((doc) => ({ name: typeof doc?.name === 'string' ? doc.name.trim().slice(0, 80) : '', required: doc?.required !== false }));
    if (clean.some((doc) => !doc.name)) fail('Each document requirement must have a name');
    const unique = new Set(clean.map((doc) => doc.name.toLocaleLowerCase()));
    if (unique.size !== clean.length) fail('Document requirement names must be unique');
    if (clean.length > 20) fail('A maximum of 20 document requirements is allowed');
    return clean;
}

async function createOffer(data, actor) {
    if (actor.role !== 'recruiter') fail('Only recruiters can create offers', 403, 'FORBIDDEN');
    validateId(data.applicationId, 'applicationId');
    if (data.ctc === undefined || !Number.isFinite(Number(data.ctc)) || Number(data.ctc) < 0) fail('ctc must be a non-negative number');
    if (data.joiningDate && Number.isNaN(Date.parse(data.joiningDate))) fail('joiningDate must be a valid date');
    if (data.documentDeadline && Number.isNaN(Date.parse(data.documentDeadline))) fail('documentDeadline must be a valid date');
    const requirements = validateDocumentRequirements(data.documents || data.requiredDocuments || []);
    const application = await Application.findById(data.applicationId);
    if (!application) fail('Application not found', 404, 'NOT_FOUND');
    if (application.recruiterId.toString() !== actor.id.toString()) fail('Not authorized to manage this application', 403, 'FORBIDDEN');
    if (application.status !== 'Selected') fail('Offers can only be created for selected applications', 409, 'APPLICATION_NOT_SELECTED');
    const [job, student] = await Promise.all([Job.findById(application.jobId), User.findOne({ _id: application.studentId, role: 'student' }).select('_id')]);
    if (!job || job.recruiterId.toString() !== application.recruiterId.toString()) fail('Application job or recruiter relationship is invalid', 409, 'INVALID_RELATIONSHIP');
    if (!student) fail('Application student relationship is invalid', 409, 'INVALID_RELATIONSHIP');
    const [recruiter, drive] = await Promise.all([Recruiter.findOne({ userId: application.recruiterId }).select('companyName'), application.driveId ? Drive.findById(application.driveId) : null]);
    if (drive && (drive.jobId.toString() !== application.jobId.toString() || drive.recruiterId.toString() !== application.recruiterId.toString())) fail('Application drive does not match its job and recruiter', 409, 'INVALID_RELATIONSHIP');
    try {
        const offer = await Offer.create({
            applicationId: application._id, studentId: application.studentId, recruiterId: application.recruiterId,
            jobId: application.jobId, driveId: application.driveId, companyName: recruiter?.companyName || drive?.companyName || 'Company',
            role: job.requirements?.role || job.title, ctc: Number(data.ctc), joiningDate: data.joiningDate || undefined,
            documentDeadline: data.documentDeadline || undefined,
            offerStatus: 'Selected', documents: requirements.map((doc) => ({ ...doc, status: 'Pending' })), statusHistory: [{ status: 'Selected' }]
        });
        application.status = 'Offer';
        await application.save();
        return populated(Offer.findById(offer._id));
    } catch (err) {
        if (err.code === 11000) fail('An offer already exists for this application', 409, 'DUPLICATE_OFFER');
        throw err;
    }
}

async function getOffer(id, actor) {
    validateId(id, 'offer ID');
    const offer = await populated(Offer.findById(id));
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertView(offer, actor);
    return placementSafe(offer, actor);
}
function assertView(offer, actor) {
    if (actor.role === 'student') {
        if (offer.studentId._id.toString() !== actor.id.toString()) fail('Not authorized to view this offer', 403, 'FORBIDDEN');
        if (['Selected', 'Offer Generated'].includes(offer.offerStatus)) fail('Offer details are available after the recruiter sends the offer', 404, 'NOT_FOUND');
    }
    if (actor.role === 'recruiter' && offer.recruiterId.toString() !== actor.id.toString()) fail('Not authorized to view this offer', 403, 'FORBIDDEN');
    if (!['student', 'recruiter', 'placement'].includes(actor.role)) fail('Not authorized to view this offer', 403, 'FORBIDDEN');
}

async function listOffers(filters, actor) {
    const query = {};
    if (actor.role === 'student') { query.studentId = actor.id; query.offerStatus = { $nin: ['Selected', 'Offer Generated'] }; }
    else if (actor.role === 'recruiter') query.recruiterId = actor.id;
    else if (actor.role !== 'placement') fail('Not authorized', 403, 'FORBIDDEN');
    if (filters.studentId) { validateId(filters.studentId, 'studentId'); if (actor.role === 'student' && filters.studentId !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN'); query.studentId = filters.studentId; }
    if (filters.status) {
        if (actor.role === 'student' && ['Selected', 'Offer Generated'].includes(filters.status)) return [];
        query.offerStatus = filters.status;
    }
    if (filters.company) query.companyName = filters.company;
    const offers = await populated(Offer.find(query).sort({ createdAt: -1 }));
    return actor.role === 'placement' ? offers.map((offer) => placementSafe(offer, actor)) : offers;
}
async function getByStudent(studentId, actor) {
    validateId(studentId, 'student ID');
    if (actor.role !== 'placement' && (actor.role !== 'student' || studentId !== actor.id.toString())) fail('Not authorized', 403, 'FORBIDDEN');
    const offers = await populated(Offer.find({ studentId, offerStatus: { $nin: ['Selected', 'Offer Generated'] } }).sort({ createdAt: -1 }));
    return actor.role === 'placement' ? offers.map((offer) => placementSafe(offer, actor)) : offers;
}
async function getByApplication(applicationId, actor) {
    validateId(applicationId, 'application ID');
    const application = await Application.findById(applicationId);
    if (!application) fail('Application not found', 404, 'NOT_FOUND');
    if (actor.role === 'student' && application.studentId.toString() !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN');
    if (actor.role === 'recruiter' && application.recruiterId.toString() !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN');
    if (!['student', 'recruiter', 'placement'].includes(actor.role)) fail('Not authorized', 403, 'FORBIDDEN');
    const query = { applicationId };
    if (actor.role === 'student') query.offerStatus = { $nin: ['Selected', 'Offer Generated'] };
    const offer = await populated(Offer.findOne(query));
    return placementSafe(offer, actor);
}

async function updateStatus(id, status, actor) {
    validateId(id, 'offer ID');
    if (typeof status !== 'string' || !Object.hasOwn(transitions, status)) fail('Invalid offer status');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    const studentDecision = ['Accepted', 'Declined'].includes(status);
    if (studentDecision) {
        if (actor.role !== 'student' || offer.studentId.toString() !== actor.id.toString()) fail('Only the student can accept or decline this offer', 403, 'FORBIDDEN');
    } else assertRecruiter(offer, actor);
    if (!canTransition(offer.offerStatus, status)) fail(`Cannot change offer status from ${offer.offerStatus} to ${status}`, 409, 'INVALID_TRANSITION');
    if (status === 'Documents Verified') fail('Document completion is updated from saved verification results.', 409, 'DOCUMENT_STATUS_AUTOMATIC');
    if (status === 'Offer Sent' && !offer.documents.some((doc) => doc.required)) fail('Define at least one required joining document before sending the offer', 409, 'DOCUMENT_REQUIREMENTS_REQUIRED');
    if (status === 'Joining Confirmed' && (!offer.joiningDate || offer.offerStatus !== 'Documents Verified' || !offer.documents.some((doc) => doc.required) || offer.documents.some((doc) => doc.required && verificationStatusOf(doc) !== 'VERIFIED'))) fail('A joining date and verified required documents are needed before confirming joining', 409, 'JOINING_REQUIREMENTS_INCOMPLETE');
    offer.offerStatus = status;
    if (status === 'Accepted') {
        offer.statusHistory.push({ status: 'Accepted' });
        offer.offerStatus = 'Documentation Pending';
        offer.documentStatus = 'Pending';
        offer.statusHistory.push({ status: 'Documentation Pending' });
    } else {
        offer.statusHistory.push({ status });
    }
    await saveOffer(offer);
    const job = await Job.findById(offer.jobId).select('title requirements.role');
    const jobLabel = job?.requirements?.role || job?.title || offer.role;
    const messages = {
        'Offer Generated': `An offer has been generated for ${jobLabel}.`,
        'Offer Sent': `Your offer for ${jobLabel} is ready to review.`,
        Accepted: `You accepted the offer for ${jobLabel}. Documents are required to complete your joining process.`,
        Declined: `The offer for ${jobLabel} was declined and the application is closed.`,
        'Documents Verified': `All required documents for ${jobLabel} have been verified.`,
        'Joining Confirmed': `Your joining has been confirmed for ${jobLabel}${offer.joiningDate ? ` on ${new Date(offer.joiningDate).toLocaleDateString('en-GB')}` : ''}.`
    };
    const eventStatus = status === 'Accepted' ? 'Accepted' : status;
    if (messages[eventStatus]) await notify(offer.studentId, messages[eventStatus], eventStatus === 'Joining Confirmed' ? 'joining' : 'offer', { type: 'offer', id: offer._id }, `offer:${offer._id}:${eventStatus}`);
    if (status === 'Offer Sent' && offer.documentDeadline) {
        const due = new Date(offer.documentDeadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        await notify(offer.studentId, `Your placement documents for ${jobLabel} are due on ${due}.`, 'document', { type: 'offer', id: offer._id }, `offer:${offer._id}:document-deadline`);
    }
    if (status === 'Joining Confirmed') await Application.updateOne({ _id: offer.applicationId }, { $set: { status: 'Hired' } });
    if (status === 'Declined') await Application.updateOne({ _id: offer.applicationId }, { $set: { status: 'Rejected' } });
    return populated(Offer.findById(id));
}

async function updateJoiningDate(id, joiningDate, actor) {
    validateId(id, 'offer ID');
    if (typeof joiningDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) fail('joiningDate must be a valid date');
    const parsedDate = new Date(`${joiningDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== joiningDate) fail('joiningDate must be a valid date');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertRecruiter(offer, actor);
    if (offer.offerStatus === 'Joining Confirmed' || offer.offerStatus === 'Declined') fail('This offer is closed and cannot be changed', 409, 'TERMINAL_STATE');
    offer.joiningDate = parsedDate;
    await saveOffer(offer);
    return populated(Offer.findById(id));
}

async function updateCtc(id, value, actor) {
    validateId(id, 'offer ID');
    const ctc = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() ? Number(value) : NaN);
    if (!Number.isFinite(ctc) || ctc < 0) fail('ctc must be a non-negative number');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertRecruiter(offer, actor);
    if (!['Selected', 'Offer Generated'].includes(offer.offerStatus)) fail('CTC can only be edited before the offer is sent', 409, 'OFFER_CTC_LOCKED');
    offer.ctc = ctc;
    await saveOffer(offer);
    return populated(Offer.findById(id));
}

async function updateDocuments(id, documents, actor) {
    validateId(id, 'offer ID');
    const requirements = validateDocumentRequirements(documents);
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertRecruiter(offer, actor);
    if (!['Selected', 'Offer Generated'].includes(offer.offerStatus)) fail('Required documents can only be defined before the offer is sent', 409, 'INVALID_TRANSITION');
    const existing = new Map(offer.documents.map((doc) => [doc.name.toLocaleLowerCase(), doc]));
    offer.documents = requirements.map((requirement) => {
        const prior = existing.get(requirement.name.toLocaleLowerCase());
        return prior ? { ...prior.toObject(), name: requirement.name, required: requirement.required } : { ...requirement, status: 'Pending' };
    });
    await saveOffer(offer);
    return populated(Offer.findById(id));
}

async function submitDocument(id, index, file, actor) {
    validateId(id, 'offer ID');
    const offer = await Offer.findById(id).select('+documents.storedFileName +documents.publicId +documents.resourceType');
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    if (actor.role !== 'student' || offer.studentId.toString() !== actor.id.toString()) fail('Only the offer recipient can submit documents', 403, 'FORBIDDEN');
    if (!['Accepted', 'Documentation Pending'].includes(offer.offerStatus)) fail('Documents can only be submitted for an accepted offer', 409, 'INVALID_TRANSITION');
    const { doc } = documentByReference(offer, index);
    if (!doc || !doc.required) fail('Required document not found', 404, 'NOT_FOUND');
    if (verificationStatusOf(doc) === 'VERIFIED') fail('Verified documents cannot be replaced', 409, 'DOCUMENT_ALREADY_VERIFIED');
    if (!file) fail('A PDF or supported image document is required');
    if (!file.buffer || !validDocumentContent(file)) fail('The file content does not match its PDF or image type', 400, 'INVALID_FILE_CONTENT');
    const normalizedType = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    const originalFileName = path.posix.basename(String(file.originalname || 'document.pdf').replace(/\\/g, '/')).replace(/[^a-zA-Z0-9_. -]/g, '_').slice(0, 200);
    const resourceType = normalizedType === 'application/pdf' ? 'raw' : 'image';
    const asset = await uploadBuffer(file.buffer, { folder: 'campuslink/documents', resourceType, originalFilename: originalFileName });
    try {
        const student = await Student.findOne({ userId: offer.studentId }).select('name registrationNumber branch education cgpa').lean();
        const { status: verificationStatus, ...verification } = await verifyPlacementDocument(file.buffer, normalizedType, doc.name, student);
        const oldPublicId = doc.publicId;
        const oldResourceType = doc.resourceType;
        doc.status = 'Submitted'; doc.verificationStatus = verificationStatus; doc.verificationMethod = 'AI'; doc.storedFileName = asset.publicId; doc.publicId = asset.publicId;
        doc.resourceType = asset.resourceType; doc.secureUrl = asset.secureUrl; doc.contentType = normalizedType;
        doc.hasFile = true; doc.originalFileName = originalFileName; doc.submittedAt = new Date();
        doc.verifiedAt = undefined; doc.rejectionReason = undefined; doc.verification = verification;
        offer.offerStatus = 'Documentation Pending';
        const completed = syncDocumentSummary(offer);
        await saveOffer(offer);
        if (completed) {
            const job = await Job.findById(offer.jobId).select('title requirements.role');
            const role = job?.requirements?.role || job?.title || offer.role;
            await notify(offer.studentId, `All required documents for ${role} have been verified.`, 'document', { type: 'offer', id: offer._id }, `offer:${offer._id}:documents-verified:${documentVerificationCycle(offer)}`);
        }
        if (oldPublicId && oldPublicId !== asset.publicId) await deleteAsset(oldPublicId, oldResourceType).catch(() => {});
    } catch (error) {
        await deleteAsset(asset.publicId, asset.resourceType).catch(() => {});
        throw error;
    }
    return populated(Offer.findById(id));
}

function normalizeMatch(value) { return String(value || '').toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, ''); }
function normalizeName(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).sort();
}
function normalizeExactName(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function editDistance(left, right) {
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
        let previous = row[0]; row[0] = i;
        for (let j = 1; j <= right.length; j++) {
            const saved = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
            previous = saved;
        }
    }
    return row[right.length];
}
function nameSimilarity(left, right) {
    const a = normalizeName(left); const b = normalizeName(right);
    if (!a.length || !b.length) return 0;
    const count = Math.max(a.length, b.length);
    let score = 0;
    for (let i = 0; i < count; i++) {
        const first = a[i] || ''; const second = b[i] || '';
        score += first && second ? 1 - editDistance(first, second) / Math.max(first.length, second.length) : 0;
    }
    return score / count;
}
async function verifyPlacementDocument(buffer, contentType, expectedType, student) {
    let extracted;
    try {
        extracted = await extractPlacementDocumentForVerification({ buffer, contentType });
    } catch (error) {
        const reason = ['EMPTY_PDF', 'INVALID_PDF', 'PDF_PARSE_ERROR'].includes(error.code)
            ? 'Document is not readable or processable.' : 'AI extraction was unavailable; manual review is required.';
        return { status: 'NEEDS_REVIEW', confidence: 0, checks: [
            { key: 'documentType', label: 'Document type', passed: false, reason },
            { key: 'nameMatch', label: 'Name match', passed: false, reason },
            { key: 'requiredFields', label: 'Required fields', passed: false, reason },
            { key: 'readable', label: 'Readable document', passed: false, reason }
        ], extracted: {}, reason, verifiedAt: new Date() };
    }
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
        return { status: 'NEEDS_REVIEW', confidence: 0, checks: [{ key: 'requiredFields', label: 'Required fields', passed: false, reason: 'AI could not return structured document details.' }], extracted: {}, reason: 'AI could not return structured document details.', verifiedAt: new Date() };
    }
    return evaluatePlacementDocument(extracted, expectedType, student);
}

async function extractPlacementDocumentForVerification({ buffer, contentType }, dependencies = {}) {
    const readText = dependencies.extractText || extractText;
    const renderPages = dependencies.renderPdfPages || renderPdfPages;
    const extractFacts = dependencies.extractPlacementDocument || extractPlacementDocument;
    if (contentType !== 'application/pdf') {
        return extractFacts({ imageBuffers: [{ buffer, contentType }] });
    }
    try {
        return await extractFacts({ text: await readText(buffer) });
    } catch (error) {
        if (!['EMPTY_PDF', 'PDF_PARSE_ERROR', 'PDF_PARSE_TIMEOUT'].includes(error.code)) throw error;
        const pages = await renderPages(buffer, 3);
        return extractFacts({ imageBuffers: pages.map((page) => ({ buffer: page, contentType: 'image/jpeg' })) });
    }
}

function evaluatePlacementDocument(extracted, expectedType, student) {
    const checks = [];
    const expected = normalizeMatch(expectedType);
    const detected = normalizeMatch(extracted.documentType);
    const matchesType = Boolean(detected && (detected.includes(expected) || expected.includes(detected)));
    checks.push({ key: 'documentType', label: 'Document type', passed: matchesType, reason: matchesType ? undefined : `Expected ${expectedType}; detected ${extracted.documentType || 'unknown document type'}.` });
    const similarity = nameSimilarity(student?.name, extracted.studentName);
    const nameMatch = Boolean(normalizeExactName(student?.name) && normalizeExactName(student?.name) === normalizeExactName(extracted.studentName));
    checks.push({ key: 'nameMatch', label: 'Full name match', passed: nameMatch, reason: nameMatch ? undefined : extracted.studentName ? `The full document name must match the profile name. Profile: ${student?.name || 'not provided'}; document: ${extracted.studentName}.` : 'Student name could not be read.' });
    const academicDocument = /mark|transcript|grade|degree|academic|certificate/i.test(expectedType);
    const expectedStudentId = student?.registrationNumber;
    const hasComparableId = Boolean(expectedStudentId && extracted.studentId);
    const idMatch = hasComparableId && normalizeMatch(expectedStudentId) === normalizeMatch(extracted.studentId);
    checks.push({ key: 'studentIdMatch', label: 'Student ID (when available)', passed: !hasComparableId || idMatch, reason: hasComparableId ? (idMatch ? undefined : 'Detected student ID conflicts with the registered profile.') : 'Not present in both records; this is not required for verification.' });
    const expectedBranch = student?.branch || student?.education?.map((item) => item.field || item.degree).find(Boolean);
    const extractedBranch = extracted.branch || extracted.course || extracted.otherFields?.branch || extracted.otherFields?.course;
    const hasComparableBranch = Boolean(expectedBranch && extractedBranch);
    const branchMatch = hasComparableBranch && normalizeBranch(expectedBranch) === normalizeBranch(extractedBranch);
    if (extractedBranch) checks.push({ key: 'branchMatch', label: 'Course / branch match', passed: !expectedBranch || branchMatch, reason: !expectedBranch ? 'No course or branch is recorded in the profile.' : branchMatch ? undefined : 'Detected course or branch conflicts with the profile.' });
    const expectedInstitutions = (student?.education || []).map((item) => item.institution).filter(Boolean);
    const extractedInstitution = extracted.institution || extracted.otherFields?.institution || extracted.otherFields?.university || extracted.otherFields?.college;
    const hasComparableInstitution = Boolean(expectedInstitutions.length && extractedInstitution);
    const institutionMatch = hasComparableInstitution && expectedInstitutions.some((name) => normalizeMatch(name) === normalizeMatch(extractedInstitution));
    if (extractedInstitution) checks.push({ key: 'institutionMatch', label: 'Institution match', passed: !expectedInstitutions.length || institutionMatch, reason: !expectedInstitutions.length ? 'No institution is recorded in the profile.' : institutionMatch ? undefined : 'Detected institution conflicts with the profile.' });
    const hasComparableCgpa = academicDocument && student?.cgpa != null && extracted?.cgpa != null && Number.isFinite(Number(student.cgpa)) && Number.isFinite(Number(extracted.cgpa));
    const cgpaMatch = hasComparableCgpa ? Math.abs(Number(student.cgpa) - Number(extracted.cgpa)) <= 0.15 : false;
    if (hasComparableCgpa) checks.push({ key: 'academicValueMatch', label: 'CGPA match', passed: cgpaMatch, reason: cgpaMatch ? undefined : 'Extracted CGPA differs from the student profile.' });
    const readable = extracted.readable === true;
    const usableFields = Boolean(extracted.studentId || extracted.branch || extracted.course || extracted.institution || extracted.marks || extracted.percentage != null || extracted.cgpa != null || Object.keys(extracted.otherFields || {}).length);
    const requiredPresent = Boolean(extracted.documentType && extracted.studentName && usableFields
        && (!academicDocument || extracted.marks || extracted.percentage != null || extracted.cgpa != null || extracted.branch || extracted.course || extracted.institution));
    checks.push({ key: 'requiredFields', label: 'Required fields', passed: requiredPresent, reason: requiredPresent ? undefined : 'One or more expected document fields could not be extracted.' });
    checks.push({ key: 'readable', label: 'Readable document', passed: readable, reason: readable ? undefined : 'Document could not be read reliably.' });
    const nameMismatch = Boolean(extracted.studentName && student?.name && similarity < 0.65);
    const idMismatch = hasComparableId && !idMatch;
    const branchMismatch = hasComparableBranch && !branchMatch;
    const institutionMismatch = hasComparableInstitution && !institutionMatch;
    const cgpaMismatch = Boolean(hasComparableCgpa && !cgpaMatch);
    const conflictingDetails = idMismatch || branchMismatch || institutionMismatch || cgpaMismatch;
    const matchedProfileDetails = Boolean((hasComparableId && idMatch) || (hasComparableBranch && branchMatch)
        || (hasComparableInstitution && institutionMatch) || (hasComparableCgpa && cgpaMatch));
    checks.push({ key: 'profileDetailsMatch', label: 'Profile detail match', passed: matchedProfileDetails, reason: matchedProfileDetails ? undefined : 'No comparable profile detail matched; name similarity alone is not enough.' });
    const failures = checks.filter((check) => !check.passed);
    const status = !readable ? 'NEEDS_REVIEW' : (!matchesType && detected) || nameMismatch ? 'REJECTED'
        : conflictingDetails ? 'NEEDS_REVIEW'
            : matchesType && nameMatch && matchedProfileDetails && requiredPresent ? 'VERIFIED' : 'NEEDS_REVIEW';
    const applicable = checks;
    const confidence = Math.round(100 * applicable.filter((check) => check.passed).length / applicable.length);
    return { status, confidence, checks, extracted, reason: failures.map((check) => check.reason).filter(Boolean).join(' ') || undefined, verifiedAt: new Date() };
}

async function reviewDocument(id, index, status, reason, actor) {
    validateId(id, 'offer ID');
    if (!['Verified', 'Rejected'].includes(status)) fail('Document status must be Verified or Rejected');
    if (status === 'Rejected' && (typeof reason !== 'string' || !reason.trim())) fail('A reason is required when rejecting a document');
    const offer = await Offer.findById(id).select('+documents.storedFileName +documents.publicId +documents.resourceType');
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertRecruiter(offer, actor);
    if (offer.offerStatus !== 'Documentation Pending') fail('Documents can only be reviewed during documentation', 409, 'INVALID_TRANSITION');
    const { doc } = documentByReference(offer, index);
    if (!doc?.required || !doc.storedFileName) fail('A submitted required document must exist before review', 409, 'DOCUMENT_NOT_SUBMITTED');
    const verificationStatus = verificationStatusOf(doc);
    const aiRejected = verificationStatus === 'REJECTED' && doc.verificationMethod === 'AI';
    if (verificationStatus !== 'NEEDS_REVIEW' && !aiRejected) fail('Only documents requiring manual review or rejected by AI can be reviewed manually', 409, 'DOCUMENT_NOT_REVIEWABLE');
    doc.verificationStatus = status.toUpperCase();
    doc.verificationMethod = 'MANUAL';
    doc.verifiedAt = status === 'Verified' ? new Date() : undefined;
    doc.rejectionReason = status === 'Rejected' ? String(reason || '').trim().slice(0, 500) || undefined : undefined;
    if (doc.verification) doc.verification.reason = doc.rejectionReason;
    const completed = syncDocumentSummary(offer);
    await saveOffer(offer);
    const job = await Job.findById(offer.jobId).select('title requirements.role');
    const role = job?.requirements?.role || job?.title || offer.role;
    if (status === 'Rejected') await notify(offer.studentId, `Your ${doc.name} document for ${role} needs to be resubmitted${doc.rejectionReason ? `: ${doc.rejectionReason}` : '.'}`, 'document', { type: 'offer', id: offer._id }, `offer:${offer._id}:document:${doc._id}:rejected:${doc.submittedAt?.getTime() || 0}`);
    if (completed) await notify(offer.studentId, `All required documents for ${role} have been verified.`, 'document', { type: 'offer', id: offer._id }, `offer:${offer._id}:documents-verified:${documentVerificationCycle(offer)}`);
    return populated(Offer.findById(id));
}

async function deleteSubmittedDocument(id, index, actor) {
    validateId(id, 'offer ID');
    const offer = await Offer.findById(id).select('+documents.storedFileName +documents.publicId +documents.resourceType');
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    if (actor.role !== 'student' || offer.studentId.toString() !== actor.id.toString()) fail('Only the offer recipient can remove a submitted document', 403, 'FORBIDDEN');
    if (!['Accepted', 'Documentation Pending'].includes(offer.offerStatus)) fail('Documents cannot be removed in this offer state', 409, 'INVALID_TRANSITION');
    const { doc } = documentByReference(offer, index);
    if (!doc?.required) fail('Required document not found', 404, 'NOT_FOUND');
    if (verificationStatusOf(doc) === 'VERIFIED') fail('Verified documents cannot be removed', 409, 'DOCUMENT_ALREADY_VERIFIED');
    if (!doc.storedFileName) fail('No submitted document is available to remove', 404, 'DOCUMENT_NOT_FOUND');
    const storedFileName = path.basename(doc.storedFileName);
    const publicId = doc.publicId; const resourceType = doc.resourceType;
    doc.status = 'Pending'; doc.verificationStatus = 'PENDING'; doc.storedFileName = undefined; doc.publicId = undefined; doc.resourceType = undefined; doc.secureUrl = undefined; doc.verification = undefined; doc.hasFile = false;
    doc.originalFileName = undefined; doc.submittedAt = undefined; doc.verifiedAt = undefined; doc.rejectionReason = undefined;
    doc.contentType = undefined;
    syncDocumentSummary(offer);
    await saveOffer(offer);
    if (publicId) await deleteAsset(publicId, resourceType).catch(() => {});
    else await fs.promises.unlink(path.join(__dirname, '../../uploads', storedFileName)).catch(() => {});
    return populated(Offer.findById(id));
}

async function getDocumentFile(id, index, actor) {
    validateId(id, 'offer ID');
    const offer = await Offer.findById(id).select('+documents.storedFileName +documents.publicId +documents.resourceType');
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertView({ ...offer.toObject(), studentId: offer.studentId, recruiterId: offer.recruiterId }, actor);
    const { doc } = documentByReference(offer, index);
    if (!doc?.storedFileName) fail('Submitted document not found', 404, 'NOT_FOUND');
    const filePath = path.join(__dirname, '../../uploads', path.basename(doc.storedFileName));
    const extension = path.extname(doc.originalFileName || doc.storedFileName).toLowerCase();
    const contentType = doc.contentType || ({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extension]);
    if (!contentType) fail('Submitted document type is unavailable', 415, 'UNSUPPORTED_FILE_TYPE');
    const fileName = path.posix.basename(String(doc.originalFileName || doc.name)).replace(/[\r\n"\\]/g, '_');
    if (doc.publicId) return { buffer: await downloadAsset(doc.publicId, doc.resourceType, path.extname(doc.originalFileName || '').slice(1)), fileName, contentType };
    return { filePath, fileName, contentType };
}

module.exports = { createOffer, getOffer, listOffers, getByStudent, getByApplication, updateStatus, updateDocuments, updateJoiningDate, submitDocument, reviewDocument, deleteSubmittedDocument, getDocumentFile, evaluatePlacementDocument, extractPlacementDocumentForVerification };

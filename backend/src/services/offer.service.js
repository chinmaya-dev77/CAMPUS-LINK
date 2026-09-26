const mongoose = require('mongoose');
const Offer = require('../models/Offer');
const Application = require('../models/Application');
const Job = require('../models/Job');
const Drive = require('../models/Drive');
const Recruiter = require('../models/Recruiter');
const User = require('../models/User');
const { transitions, canTransition } = require('./offer.transitions');

function fail(message, status = 400, code = 'INVALID_INPUT') {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    throw err;
}

function validId(id) { return mongoose.isValidObjectId(id); }
function validateId(id, label) { if (!validId(id)) fail(`${label} must be a valid ID`); }
function assertManager(offer, actor) {
    if (actor.role === 'recruiter' && offer.recruiterId.toString() !== actor.id.toString()) fail('Not authorized to manage this offer', 403, 'FORBIDDEN');
}
function populated(query) {
    return query.populate('studentId', 'name email').populate('applicationId', 'status').populate('jobId', 'title').populate('driveId', 'companyName role date');
}

async function createOffer(data, actor) {
    validateId(data.applicationId, 'applicationId');
    if (data.ctc === undefined || !Number.isFinite(Number(data.ctc)) || Number(data.ctc) < 0) fail('ctc must be a non-negative number');
    if (data.joiningDate && Number.isNaN(Date.parse(data.joiningDate))) fail('joiningDate must be a valid date');
    const application = await Application.findById(data.applicationId);
    if (!application) fail('Application not found', 404, 'NOT_FOUND');
    if (application.status !== 'Selected') fail('Offers can only be created for selected applications', 409, 'APPLICATION_NOT_SELECTED');
    if (actor.role === 'recruiter' && application.recruiterId.toString() !== actor.id.toString()) fail('Not authorized to manage this application', 403, 'FORBIDDEN');
    const [job, student] = await Promise.all([Job.findById(application.jobId), User.findOne({ _id: application.studentId, role: 'student' }).select('_id')]);
    if (!job) fail('Application job not found', 404, 'NOT_FOUND');
    if (!student) fail('Application student relationship is invalid', 409, 'INVALID_RELATIONSHIP');
    if (job.recruiterId.toString() !== application.recruiterId.toString()) fail('Application recruiter does not match its job', 409, 'INVALID_RELATIONSHIP');
    const [recruiter, drive] = await Promise.all([
        Recruiter.findOne({ userId: application.recruiterId }).select('companyName'),
        application.driveId ? Drive.findById(application.driveId) : null
    ]);
    if (drive && (drive.jobId.toString() !== application.jobId.toString() || drive.recruiterId.toString() !== application.recruiterId.toString())) fail('Application drive does not match its job and recruiter', 409, 'INVALID_RELATIONSHIP');
    try {
        const offer = await Offer.create({
            applicationId: application._id,
            studentId: application.studentId,
            recruiterId: application.recruiterId,
            jobId: application.jobId,
            driveId: application.driveId,
            companyName: recruiter?.companyName || drive?.companyName || 'Company',
            role: job.requirements?.role || job.title,
            ctc: Number(data.ctc),
            joiningDate: data.joiningDate || undefined,
            offerStatus: 'Selected',
            statusHistory: [{ status: 'Selected' }]
        });
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
    authorizeView(offer, actor);
    return offer;
}

function authorizeView(offer, actor) {
    if (actor.role === 'student' && offer.studentId._id.toString() !== actor.id.toString()) fail('Not authorized to view this offer', 403, 'FORBIDDEN');
    assertManager(offer, actor);
}

async function listOffers(filters, actor) {
    const query = {};
    if (actor.role === 'student') query.studentId = actor.id;
    if (actor.role === 'recruiter') query.recruiterId = actor.id;
    if (filters.studentId) {
        validateId(filters.studentId, 'studentId');
        if (actor.role === 'student' && filters.studentId !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN');
        query.studentId = filters.studentId;
    }
    if (filters.status) query.offerStatus = filters.status;
    if (filters.company) query.companyName = filters.company;
    return populated(Offer.find(query).sort({ createdAt: -1 }));
}

async function getByStudent(studentId, actor) {
    validateId(studentId, 'student ID');
    if (actor.role !== 'placement' && (actor.role !== 'student' || studentId !== actor.id.toString())) fail('Not authorized', 403, 'FORBIDDEN');
    return populated(Offer.find({ studentId }).sort({ createdAt: -1 }));
}

async function getByApplication(applicationId, actor) {
    validateId(applicationId, 'application ID');
    const application = await Application.findById(applicationId);
    if (!application) fail('Application not found', 404, 'NOT_FOUND');
    if (actor.role === 'student' && application.studentId.toString() !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN');
    if (actor.role === 'recruiter' && application.recruiterId.toString() !== actor.id.toString()) fail('Not authorized', 403, 'FORBIDDEN');
    return populated(Offer.findOne({ applicationId }));
}

async function updateStatus(id, status, actor) {
    validateId(id, 'offer ID');
    if (typeof status !== 'string' || !Object.hasOwn(transitions, status)) fail('Invalid offer status');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertManager(offer, actor);
    if (!canTransition(offer.offerStatus, status)) fail(`Cannot change offer status from ${offer.offerStatus} to ${status}`, 409, 'INVALID_TRANSITION');
    if (status === 'Documents Verified' && (!offer.documents.length || offer.documents.some((doc) => doc.status !== 'Verified'))) fail('All required documents must be verified first', 409, 'DOCUMENTS_INCOMPLETE');
    if (status === 'Joining Confirmed' && !offer.joiningDate) fail('A joining date is required before confirming joining', 409, 'JOINING_DATE_REQUIRED');
    offer.offerStatus = status;
    if (status === 'Documentation Pending') offer.documentStatus = 'Pending';
    if (status === 'Documents Verified') offer.documentStatus = 'Verified';
    offer.statusHistory.push({ status });
    await offer.save();
    return populated(Offer.findById(id));
}

async function updateJoiningDate(id, joiningDate, actor) {
    validateId(id, 'offer ID');
    if (typeof joiningDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) fail('joiningDate must be a valid date');
    const parsedDate = new Date(`${joiningDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== joiningDate) fail('joiningDate must be a valid date');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertManager(offer, actor);
    offer.joiningDate = parsedDate;
    await offer.save();
    return populated(Offer.findById(id));
}

async function updateDocuments(id, documents, actor) {
    validateId(id, 'offer ID');
    if (Array.isArray(documents)) documents = documents.map((doc) => doc && typeof doc.status === 'string' ? { ...doc, status: doc.status.trim().toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) } : doc);
    if (!Array.isArray(documents) || documents.some((doc) => !doc || typeof doc.name !== 'string' || !doc.name.trim() || !['Pending', 'Submitted', 'Verified', 'Rejected'].includes(doc.status))) fail('documents must contain a name and a valid status (Pending, Submitted, Verified, Rejected)');
    const offer = await Offer.findById(id);
    if (!offer) fail('Offer not found', 404, 'NOT_FOUND');
    assertManager(offer, actor);
    if (!['Accepted', 'Documentation Pending'].includes(offer.offerStatus)) fail('Documents can only be managed for accepted offers', 409, 'INVALID_TRANSITION');
    offer.documents = documents.map(({ name, status }) => ({ name: name.trim(), status }));
    offer.documentStatus = !documents.length || documents.some((doc) => doc.status === 'Pending' || doc.status === 'Rejected') ? 'Pending' : documents.some((doc) => doc.status === 'Submitted') ? 'Submitted' : 'Verified';
    await offer.save();
    return populated(Offer.findById(id));
}

module.exports = { createOffer, getOffer, listOffers, getByStudent, getByApplication, updateStatus, updateDocuments, updateJoiningDate };

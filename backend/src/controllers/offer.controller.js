const offerService = require('../services/offer.service');
const fs = require('fs');

const create = async (req, res, next) => {
    try {
        if (req.user.role !== 'recruiter') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters can create offers' } });
        const offer = await offerService.createOffer(req.body, req.user);
        res.status(201).json({ success: true, data: offer });
    } catch (err) { next(err); }
};

const list = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.listOffers(req.query, req.user) }); }
    catch (err) { next(err); }
};

const get = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.getOffer(req.params.id, req.user) }); }
    catch (err) { next(err); }
};

const getStudent = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.getByStudent(req.params.id, req.user) }); }
    catch (err) { next(err); }
};

const getApplication = async (req, res, next) => {
    try {
        const offer = await offerService.getByApplication(req.params.id, req.user);
        if (!offer) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Offer not found' } });
        res.status(200).json({ success: true, data: offer });
    } catch (err) { next(err); }
};

const updateStatus = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await offerService.updateStatus(req.params.id, req.body.status, req.user) });
    } catch (err) { next(err); }
};

const updateJoiningDate = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await offerService.updateJoiningDate(req.params.id, req.body.joiningDate, req.user) });
    } catch (err) { next(err); }
};

const updateCtc = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await offerService.updateCtc(req.params.id, req.body.ctc, req.user) });
    } catch (err) { next(err); }
};

const updateDocuments = async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await offerService.updateDocuments(req.params.id, req.body.documents, req.user) });
    } catch (err) { next(err); }
};

const submitDocument = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.submitDocument(req.params.id, req.params.index, req.file, req.user) }); }
    catch (err) { next(err); }
};

const reviewDocument = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.reviewDocument(req.params.id, req.params.index, req.body.status, req.body.reason, req.user) }); }
    catch (err) { next(err); }
};

const deleteDocument = async (req, res, next) => {
    try { res.status(200).json({ success: true, data: await offerService.deleteSubmittedDocument(req.params.id, req.params.index, req.user) }); }
    catch (err) { next(err); }
};

const getDocumentFile = async (req, res, next) => {
    try {
        if (req.user.role === 'placement') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Placement oversight does not include access to private candidate documents' } });
        const file = await offerService.getDocumentFile(req.params.id, req.params.index, req.user);
        if (file.buffer) {
            res.setHeader('Content-Type', file.contentType);
            res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${file.fileName}"`);
            res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
            return res.send(file.buffer);
        }
        if (!fs.existsSync(file.filePath)) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Submitted document file is unavailable' } });
        if (req.query.download === '1') return res.download(file.filePath, file.fileName);
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-store');
        res.sendFile(file.filePath);
    } catch (err) { next(err); }
};

module.exports = { create, list, get, getStudent, getApplication, updateStatus, updateDocuments, updateJoiningDate, updateCtc, submitDocument, reviewDocument, deleteDocument, getDocumentFile };

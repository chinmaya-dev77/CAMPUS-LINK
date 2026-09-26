const offerService = require('../services/offer.service');

const create = async (req, res, next) => {
    try {
        if (!['recruiter', 'placement'].includes(req.user.role)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only recruiters and placement users can create offers' } });
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
        if (!['recruiter', 'placement'].includes(req.user.role)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to manage offers' } });
        res.status(200).json({ success: true, data: await offerService.updateStatus(req.params.id, req.body.status, req.user) });
    } catch (err) { next(err); }
};

const updateJoiningDate = async (req, res, next) => {
    try {
        if (!['recruiter', 'placement'].includes(req.user.role)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to manage offers' } });
        res.status(200).json({ success: true, data: await offerService.updateJoiningDate(req.params.id, req.body.joiningDate, req.user) });
    } catch (err) { next(err); }
};

const updateDocuments = async (req, res, next) => {
    try {
        if (!['recruiter', 'placement'].includes(req.user.role)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized to manage offers' } });
        res.status(200).json({ success: true, data: await offerService.updateDocuments(req.params.id, req.body.documents, req.user) });
    } catch (err) { next(err); }
};

module.exports = { create, list, get, getStudent, getApplication, updateStatus, updateDocuments, updateJoiningDate };

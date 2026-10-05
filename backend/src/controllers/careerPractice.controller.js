'use strict';

const service = require('../services/careerPractice.service');

function assertOwnStudent(req) {
    if (req.user?.role !== 'student' || String(req.user.id) !== String(req.params.id)) {
        const error = new Error('You can only access your own career practice results.');
        error.status = 403;
        error.code = 'FORBIDDEN';
        throw error;
    }
}

exports.getLatest = async (req, res, next) => {
    try { assertOwnStudent(req); res.status(200).json({ success: true, data: await service.getLatest(req.user.id) }); }
    catch (error) { next(error); }
};

exports.startAssessment = async (req, res, next) => {
    try { assertOwnStudent(req); res.status(201).json({ success: true, data: await service.startAssessment(req.user.id) }); }
    catch (error) { next(error); }
};

exports.submitAssessment = async (req, res, next) => {
    try {
        assertOwnStudent(req);
        const result = await service.submitAssessment(req.user.id, req.params.attemptId, req.body);
        res.status(200).json({ success: true, data: result, message: 'Assessment complete. Your readiness profile has been updated.' });
    } catch (error) { next(error); }
};

exports.startInterview = async (req, res, next) => {
    try { assertOwnStudent(req); res.status(201).json({ success: true, data: await service.startInterview(req.user.id, req.body) }); }
    catch (error) { next(error); }
};

exports.submitInterview = async (req, res, next) => {
    try {
        assertOwnStudent(req);
        const result = await service.submitInterview(req.user.id, req.params.interviewId, req.body);
        res.status(200).json({ success: true, data: result, message: 'Mock interview evaluated. Your readiness profile has been updated.' });
    } catch (error) { next(error); }
};

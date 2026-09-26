'use strict';
const assistantService = require('../services/assistant.service');

async function ask(req, res, next) {
    try {
        const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
        if (!question || question.length > 1000) return res.status(400).json({ success: false, error: { code: 'INVALID_QUESTION', message: 'Enter a question of 1–1000 characters.' } });
        const data = await assistantService.answerQuestion(question, req.user);
        return res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
}
module.exports = { ask };

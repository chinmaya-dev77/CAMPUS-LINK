'use strict';
const analyticsService = require('../services/analytics/placement.analytics.service');

async function placement(req, res, next) {
    try {
        if (req.user.role !== 'placement') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Placement analytics are restricted to placement users' } });
        res.status(200).json({ success: true, data: await analyticsService.getPlacementAnalytics() });
    } catch (error) { next(error); }
}

module.exports = { placement };

'use strict';

const Student = require('../../models/Student');
const Application = require('../../models/Application');
const Offer = require('../../models/Offer');
const Job = require('../../models/Job');
const { normalizeSkill } = require('../readiness/skill.domain');
const { ensureReadiness } = require('../readiness/readiness.service');

const SELECTED_APPLICATION_STATUSES = ['Selected', 'Offer', 'Hired'];
const ACTIVE_OFFER_STATUSES = [
    'Selected', 'Offer Generated', 'Offer Sent', 'Pending', 'Accepted',
    'Documentation Pending', 'Documents Verified', 'Joining Confirmed'
];

async function getPlacementRisk() {
    const [selectedApplications, selectedOffers] = await Promise.all([
        Application.find({ status: { $in: SELECTED_APPLICATION_STATUSES } }).select('studentId').lean(),
        Offer.find({ offerStatus: { $in: ACTIVE_OFFER_STATUSES } }).select('studentId').lean()
    ]);
    const excludedStudentIds = [...new Set([...selectedApplications, ...selectedOffers].map((item) => String(item.studentId)))];
    const activePopulation = { studentId: { $nin: excludedStudentIds } };
    const [students, applications, jobs] = await Promise.all([
        // Avoid a parent/child projection collision while retaining the cached
        // readiness fields that ensureReadiness() checks.
        Student.find({ userId: { $nin: excludedStudentIds } }).select('userId name skills projects readiness.score readiness.calculatedAt backlogs cgpa +readiness.sourceHash').lean(),
        Application.find(activePopulation).select('studentId status').lean(),
        Job.find({ status: 'active' }).select('requirements.requiredSkills').lean()
    ]);
    const demand = [...new Set(jobs.flatMap((job) => job.requirements?.requiredSkills || []).map(normalizeSkill).filter(Boolean))];
    const appStats = new Map();
    applications.forEach((application) => {
        const id = String(application.studentId);
        const stats = appStats.get(id) || { applicationCount: 0, shortlistedCount: 0 };
        stats.applicationCount++;
        if (['Shortlisted', 'Interview', 'Selected', 'Offer', 'Hired'].includes(application.status)) stats.shortlistedCount++;
        appStats.set(id, stats);
    });

    const features = await Promise.all(students.map(async (student) => {
        const skillSet = new Set((student.skills || []).map((skill) => normalizeSkill(skill.name)).filter(Boolean));
        const gapPct = demand.length ? Math.round((demand.filter((skill) => !skillSet.has(skill)).length / demand.length) * 100) : null;
        const apps = appStats.get(String(student.userId)) || { applicationCount: 0, shortlistedCount: 0 };
        const readiness = await ensureReadiness(student);
        return {
            studentId: String(student.userId), name: student.name,
            readiness: Number.isFinite(readiness?.score) ? readiness.score : null,
            cgpa: Number.isFinite(student.cgpa) ? student.cgpa : null,
            skillGapPct: gapPct,
            backlogs: Number.isFinite(student.backlogs) ? student.backlogs : null,
            ...apps
        };
    }));

    const baseUrl = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
        response = await fetch(`${baseUrl}/predict-risk`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: features }), signal: controller.signal
        });
    } catch (error) {
        const unavailable = new Error('Placement risk service is unavailable. Start the Python ML service to view risk signals.');
        unavailable.status = 503; unavailable.code = 'ML_SERVICE_UNAVAILABLE'; throw unavailable;
    } finally { clearTimeout(timeout); }
    if (!response.ok) {
        const error = new Error(`Placement risk service returned HTTP ${response.status}.`);
        error.status = 502; error.code = 'ML_SERVICE_ERROR'; throw error;
    }
    const result = await response.json();
    const predictions = result?.data?.predictions;
    const knownIds = new Set(features.map((feature) => feature.studentId));
    const validPrediction = (prediction) => prediction && typeof prediction === 'object'
        && knownIds.has(String(prediction.studentId))
        && [null, 'LOW', 'MEDIUM', 'HIGH'].includes(prediction.riskLevel)
        && (prediction.riskScore === null || (Number.isFinite(prediction.riskScore) && prediction.riskScore >= 0 && prediction.riskScore <= 100))
        && Array.isArray(prediction.factors)
        && prediction.factors.every((factor) => factor && typeof factor.name === 'string' && typeof factor.value === 'string');
    if (!result?.success || !Array.isArray(predictions) || predictions.length !== features.length
        || predictions.some((prediction) => !validPrediction(prediction))
        || new Set(predictions.map((prediction) => String(prediction.studentId))).size !== predictions.length) {
        const error = new Error('Placement risk service returned an invalid response.');
        error.status = 502; error.code = 'ML_SERVICE_INVALID_RESPONSE'; throw error;
    }
    const byId = new Map(features.map((feature) => [feature.studentId, feature]));
    const rows = predictions.map((prediction) => ({ ...byId.get(String(prediction.studentId)), ...prediction }));
    const counts = { high: 0, medium: 0, low: 0, insufficientData: 0 };
    rows.forEach((row) => {
        if (row.riskLevel === 'HIGH') counts.high++;
        else if (row.riskLevel === 'MEDIUM') counts.medium++;
        else if (row.riskLevel === 'LOW') counts.low++;
        else counts.insufficientData++;
    });
    return {
        generatedAt: new Date().toISOString(), counts,
        students: rows.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1)),
        disclaimer: result.data.disclaimer || 'Prototype predictive signal based on available placement data.'
    };
}

module.exports = { getPlacementRisk };

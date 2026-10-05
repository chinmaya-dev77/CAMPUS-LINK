const Student = require('../models/Student');
const { detectSkillGaps } = require('../services/readiness/readiness.engine');
const { calculateAndPersistReadiness } = require('../services/readiness/readiness.service');
const aiService = require('../services/ai.service'); // for explanations

exports.analyzeReadiness = async (req, res, next) => {
    try {
        const userId = req.params.id;
        if (req.user.role !== 'placement' && (req.user.role !== 'student' || req.user.id.toString() !== userId)) {
            const err = new Error('Not authorized to access this profile');
            err.status = 403; err.code = 'FORBIDDEN';
            throw err;
        }

        const student = await Student.findOne({ userId });
        if (!student) {
            const err = new Error('Student profile not found');
            err.status = 404;
            throw err;
        }

        // Use the same frozen readiness engine and persisted source used by all workspaces.
        const readinessData = await calculateAndPersistReadiness(student);
        const skillGaps = detectSkillGaps(student.skills);

        // 2. Deterministic recommendations from current calculated evidence + skill gaps.
        //    Derived entirely from readinessData (fresh, computed above).
        //    LLM is NOT used here — backend decides what to recommend per AI_RULES.md.
        const recommendations = [];

        // Skill-gap recommendations
        for (const gap of skillGaps) {
            recommendations.push(`Learn ${gap.skill}: ${gap.reason}`);
        }

        // Evidence gap recommendations — only fire when that evidence is actually missing
        if (readinessData.missingEvidence.includes('Academic')) {
            recommendations.push('Enter your CGPA and backlog count in your profile to improve your academic score.');
        }
        if (readinessData.missingEvidence.includes('Skills')) {
            recommendations.push('Add your technical skills (or upload your resume) to enable skill-domain scoring.');
        }
        if (readinessData.missingEvidence.includes('Projects')) {
            recommendations.push('Add at least one project to improve your projects score.');
        }
        if (readinessData.missingEvidence.includes('Assessment')) recommendations.push('Take the placement assessment to add a measured technical and aptitude signal.');
        if (readinessData.missingEvidence.includes('Interview')) recommendations.push('Complete a mock interview to add an interview-practice signal.');

        if (recommendations.length === 0) {
            recommendations.push('Great profile coverage! Keep building projects and sharpening your skills.');
        }

        res.status(200).json({
            success: true,
            data: {
                score: readinessData.score,
                category: readinessData.category,
                evidenceCoverage: readinessData.evidenceCoverage,
                missingEvidence: readinessData.missingEvidence,
                breakdown: readinessData.breakdown,
                skillGaps: skillGaps.map(g => g.skill),
                recommendations
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.getReadiness = async (req, res, next) => {
    try {
        const userId = req.params.id;
        
        if (req.user.role !== 'placement' && (req.user.role !== 'student' || req.user.id.toString() !== userId)) {
            const err = new Error('Not authorized');
            err.status = 403; err.code = 'FORBIDDEN';
            throw err;
        }

        const student = await Student.findOne({ userId });
        if (!student) {
            const err = new Error('Student profile not found');
            err.status = 404;
            throw err;
        }

        const readinessData = await calculateAndPersistReadiness(student);
        res.status(200).json({
            success: true,
            data: readinessData
        });
    } catch (err) {
        next(err);
    }
};

exports.getSkillGaps = async (req, res, next) => {
    try {
        const userId = req.params.id;
        if (req.user.role !== 'placement' && (req.user.role !== 'student' || req.user.id.toString() !== userId)) {
            const err = new Error('Not authorized');
            err.status = 403; err.code = 'FORBIDDEN';
            throw err;
        }

        const student = await Student.findOne({ userId });
        if (!student) {
            const err = new Error('Student profile not found');
            err.status = 404;
            throw err;
        }

        const skillGaps = detectSkillGaps(student.skills);
        res.status(200).json({
            success: true,
            data: { skillGaps }
        });
    } catch (err) {
        next(err);
    }
};

const Student = require('../models/Student');
const { calculateReadiness, detectSkillGaps } = require('../services/readiness/readiness.engine');
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

        // 1. Deterministic Calculation
        const readinessData = calculateReadiness(student);
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
        // Assessment and Interview are always missing (schema not yet implemented) — no recommendation to avoid noise.

        if (recommendations.length === 0) {
            recommendations.push('Great profile coverage! Keep building projects and sharpening your skills.');
        }

        // Save to DB
        student.readiness = {
            score: readinessData.score,
            category: readinessData.category,
            technicalSkillsScore: readinessData.technicalSkillsScore,
            projectsScore: readinessData.projectsScore,
            academicScore: readinessData.academicScore,
            assessmentScore: readinessData.assessmentScore,
            interviewScore: readinessData.interviewScore,
            improvementAreas: skillGaps.map(g => g.skill),
            calculatedAt: readinessData.calculatedAt
        };
        await student.save();

        res.status(200).json({
            success: true,
            data: {
                score: readinessData.score,
                category: readinessData.category,
                evidenceCoverage: readinessData.evidenceCoverage,
                missingEvidence: readinessData.missingEvidence,
                breakdown: {
                    technicalSkills: readinessData.technicalSkillsScore,
                    projects: readinessData.projectsScore,
                    academic: readinessData.academicScore,
                    assessment: readinessData.assessmentScore,
                    interview: readinessData.interviewScore
                },
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

        if (!student.readiness || student.readiness.score == null) {
            // Not calculated yet
            return res.status(200).json({
                success: true,
                data: null
            });
        }

        res.status(200).json({
            success: true,
            data: student.readiness
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

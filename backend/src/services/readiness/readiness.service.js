'use strict';

const crypto = require('node:crypto');
const Student = require('../../models/Student');
const { calculateReadiness, detectSkillGaps } = require('./readiness.engine');

const READINESS_ALGORITHM_VERSION = 'readiness-v1';

function readinessSourceHash(student) {
    const source = {
        version: READINESS_ALGORITHM_VERSION,
        skills: (student?.skills || []).map((skill) => ({ name: skill?.name || '', level: skill?.level || '' }))
            .sort((a, b) => `${a.name.toLowerCase()}|${a.level.toLowerCase()}`.localeCompare(`${b.name.toLowerCase()}|${b.level.toLowerCase()}`)),
        projects: (student?.projects || []).map((project) => ({
            technologies: [...(project?.technologies || [])].filter(Boolean).sort(),
            description: project?.description || '', role: project?.role || ''
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        cgpa: student?.cgpa ?? null,
        backlogs: student?.backlogs ?? 0,
        assessmentScore: student?.readiness?.assessmentScore ?? null,
        interviewScore: student?.readiness?.interviewScore ?? null
    };
    return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

function buildReadinessSnapshot(student) {
    const calculated = calculateReadiness(student);
    const skillGaps = detectSkillGaps(student.skills);
    const recommendations = skillGaps.map((gap) => `Learn ${gap.skill}: ${gap.reason}`);
    if (calculated.missingEvidence.includes('Academic')) recommendations.push('Enter your CGPA and backlog count in your profile to improve your academic score.');
    if (calculated.missingEvidence.includes('Skills')) recommendations.push('Add your technical skills (or upload your resume) to enable skill-domain scoring.');
    if (calculated.missingEvidence.includes('Projects')) recommendations.push('Add at least one project to improve your projects score.');
    if (!recommendations.length) recommendations.push('Great profile coverage! Keep building projects and sharpening your skills.');
    return {
        ...calculated,
        skillGaps: skillGaps.map((gap) => gap.skill),
        recommendations,
        breakdown: {
            technicalSkills: calculated.technicalSkillsScore,
            projects: calculated.projectsScore,
            academic: calculated.academicScore,
            assessment: calculated.assessmentScore,
            interview: calculated.interviewScore
        }
    };
}

async function calculateAndPersistReadiness(student) {
    const snapshot = buildReadinessSnapshot(student);
    const readiness = {
        score: snapshot.score,
        category: snapshot.category,
        technicalSkillsScore: snapshot.technicalSkillsScore,
        projectsScore: snapshot.projectsScore,
        academicScore: snapshot.academicScore,
        assessmentScore: snapshot.assessmentScore,
        interviewScore: snapshot.interviewScore,
        improvementAreas: snapshot.skillGaps,
        calculatedAt: snapshot.calculatedAt,
        sourceHash: readinessSourceHash(student)
    };
    if (typeof student.save === 'function') {
        student.readiness = readiness;
        await student.save();
    } else if (student?.userId) {
        await Student.updateOne({ userId: student.userId }, { $set: { readiness } });
        student.readiness = readiness;
    } else {
        throw new Error('Cannot persist readiness without a student profile document.');
    }
    return snapshot;
}

async function ensureReadiness(student) {
    const sourceHash = readinessSourceHash(student);
    if (student?.readiness?.score != null && student.readiness.sourceHash === sourceHash) {
        const snapshot = buildReadinessSnapshot(student);
        snapshot.calculatedAt = student.readiness.calculatedAt || snapshot.calculatedAt;
        return snapshot;
    }
    return calculateAndPersistReadiness(student);
}

module.exports = { buildReadinessSnapshot, calculateAndPersistReadiness, ensureReadiness, readinessSourceHash };

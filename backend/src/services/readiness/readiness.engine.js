const { calculateTechnicalSkillsScore, normalizeSkill } = require('./skill.domain');

function calculateProjectsScore(projects) {
    if (!projects || projects.length === 0) return 0;
    
    let totalScore = 0;
    for (const p of projects) {
        let score = 0;
        // Relevance (40%) - heuristic: has technologies and description
        score += (p.technologies && p.technologies.length > 0 ? 40 : 20);
        // Technical Depth (25%) - heuristic: number of technologies
        score += Math.min((p.technologies ? p.technologies.length * 5 : 0), 25);
        // Complexity (20%) - heuristic: description length
        score += Math.min((p.description ? p.description.length / 10 : 0), 20);
        // Evidence (15%) - heuristic: has role
        score += (p.role ? 15 : 0);
        
        totalScore += score;
    }
    
    // Average project score, capped at 100
    return Math.min(totalScore / projects.length, 100);
}

function calculateAcademicScore(student) {
    const cgpa = student.cgpa || 0;
    const backlogs = student.backlogs || 0;
    
    const cgpaScore = (cgpa / 10) * 100;
    
    let backlogScore = 15;
    if (backlogs === 0) backlogScore = 100;
    else if (backlogs === 1) backlogScore = 75;
    else if (backlogs === 2) backlogScore = 50;
    else if (backlogs === 3) backlogScore = 30;

    // Academic Trend is 10%. Without historical data, we assume 100 or re-weight. 
    // We'll assume a base 100 for trend to not penalize.
    const academicTrend = 100;

    return (cgpaScore * 0.70) + (backlogScore * 0.20) + (academicTrend * 0.10);
}

function calculateReadiness(student) {
    const techScore = calculateTechnicalSkillsScore(student.skills);
    const projScore = calculateProjectsScore(student.projects);
    const acadScore = calculateAcademicScore(student);
    
    const assessmentScore = null;
    const interviewScore = null;

    let totalWeight = 0;
    let accumulatedScore = 0;

    // Technical Skills (30%)
    totalWeight += 30;
    accumulatedScore += (techScore * 0.30);

    // Projects (20%)
    totalWeight += 20;
    accumulatedScore += (projScore * 0.20);

    // Academic (20%)
    totalWeight += 20;
    accumulatedScore += (acadScore * 0.20);

    // Assessment (15%) - if available
    if (assessmentScore !== null) {
        totalWeight += 15;
        accumulatedScore += (assessmentScore * 0.15);
    }

    // Interview (15%) - if available
    if (interviewScore !== null) {
        totalWeight += 15;
        accumulatedScore += (interviewScore * 0.15);
    }

    // Scale to 100
    const readinessScore = (accumulatedScore / totalWeight) * 100;

    let category = "Not Ready";
    if (readinessScore >= 85) category = "Highly Employable";
    else if (readinessScore >= 70) category = "Ready";
    else if (readinessScore >= 50) category = "Developing";

    // Evidence coverage calculation
    let evidenceCount = 0;
    let totalEvidence = 5;
    const missingEvidence = [];

    if (student.skills && student.skills.length > 0) evidenceCount++;
    else missingEvidence.push('Skills');

    if (student.projects && student.projects.length > 0) evidenceCount++;
    else missingEvidence.push('Projects');

    if (student.cgpa) evidenceCount++;
    else missingEvidence.push('Academic');

    // Missing by schema design right now
    missingEvidence.push('Assessment');
    missingEvidence.push('Interview');

    const evidenceCoverage = Math.round((evidenceCount / totalEvidence) * 100);

    return {
        score: Math.round(readinessScore),
        category,
        technicalSkillsScore: Math.round(techScore),
        projectsScore: Math.round(projScore),
        academicScore: Math.round(acadScore),
        assessmentScore,
        interviewScore,
        evidenceCoverage,
        missingEvidence,
        calculatedAt: new Date()
    };
}

/**
 * Deterministic skill gap detection.
 * Compares normalized student skills against a baseline "Software Engineer" profile.
 * Uses normalizeSkill() so aliases like 'dsa', 'git', 'mongodb', 'github' are all
 * correctly recognized as covering the relevant baseline gaps.
 */
function detectSkillGaps(studentSkills) {
    // Normalize every student skill name so aliases are resolved before matching
    const normStudentSkills = (studentSkills || []).map(s => normalizeSkill(s.name));

    // Baseline targets with their normalized match keys.
    // matchKeys: any normalized student skill that matches one of these is sufficient to cover the gap.
    const targetSkills = [
        {
            skill: 'Data Structures',
            matchKeys: ['dsa', 'algorithms', 'problem solving', 'competitive programming'],
            priority: 'high',
            reason: 'Fundamental for problem solving and interviews'
        },
        {
            skill: 'Database/SQL',
            matchKeys: ['database/sql', 'sql', 'mysql', 'postgresql', 'mongodb', 'oracle', 'redis', 'firebase', 'cassandra'],
            priority: 'high',
            reason: 'Essential for backend and data management'
        },
        {
            skill: 'Version Control (Git)',
            matchKeys: ['version control (git)', 'git'],
            priority: 'medium',
            reason: 'Industry standard for collaboration'
        }
    ];

    const gaps = [];
    for (const target of targetSkills) {
        const covered = normStudentSkills.some(ns => target.matchKeys.includes(ns));
        if (!covered) {
            gaps.push({ skill: target.skill, priority: target.priority, reason: target.reason });
        }
    }

    return gaps;
}

module.exports = {
    calculateReadiness,
    detectSkillGaps
};

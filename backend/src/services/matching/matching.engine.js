/**
 * CampusLink — Matching Engine (Phase 7)
 * 
 * All scores are deterministic. Backend calculates everything.
 * LLM does NOT score, rank, or decide eligibility.
 * Semantic similarity deferred (no embeddings in Phase 7).
 * 
 * ─── SCORING FORMULA ─────────────────────────────────────────────────────
 *
 *  matchScore = 0.50 × skillMatch
 *             + 0.20 × projectRelevance
 *             + 0.20 × academicFit
 *             + 0.10 × evidenceCoverage
 *
 *  skillMatch:
 *    Required skill coverage  = matchedRequired / totalRequired (× 100)
 *    Preferred skill coverage = matchedPreferred / totalPreferred (× 100)
 *    skillMatch = (requiredCoverage × 0.70) + (preferredCoverage × 0.30)
 *    (If no required skills defined, full required coverage is assumed.)
 *    (If no preferred skills defined, preferred component uses 0.)
 *
 *  projectRelevance:
 *    Count unique job-required skills that appear in any student project's
 *    technologies (after normalization).
 *    = matchedInProjects / totalRequired (× 100), capped at 100.
 *    (If no required skills, score = 50 as neutral.)
 *
 *  academicFit:
 *    cgpaScore  = min(student.cgpa / minCGPA, 1) × 100  [if minCGPA set]
 *              = 80 (neutral)                            [if minCGPA absent]
 *    cgpaScore capped at 100.
 *    backlogScore = 100 if backlogs <= maxBacklogs (or no limit)
 *                 = 0   if backlogs > maxBacklogs
 *    academicFit = (cgpaScore × 0.70) + (backlogScore × 0.30)
 *
 *  evidenceCoverage:
 *    +25 if skills present
 *    +25 if projects present
 *    +25 if resume uploaded
 *    +25 if cgpa set
 *
 * ─── ELIGIBILITY (hard gate, runs before scoring) ────────────────────────
 *  FAIL if student.cgpa < job.minimumCGPA    (when minimumCGPA set)
 *  FAIL if student.backlogs > job.maximumBacklogs (when maximumBacklogs set)
 *  FAIL if student.branch not in eligibleBranches (when branches set and non-empty)
 *
 *  Missing student data (e.g. no branch) is treated as UNKNOWN (not a failure)
 *  for eligibility, but noted in the result.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

const { normalizeSkill } = require('../readiness/skill.domain');
const { normalizeBranch } = require('../branch.domain');

// ─── Eligibility ─────────────────────────────────────────────────────────────
function checkEligibility(student, jobRequirements) {
    const issues = [];
    const warnings = [];

    const { minimumCGPA, maximumBacklogs, eligibleBranches } = jobRequirements || {};

    // CGPA check
    if (minimumCGPA != null && minimumCGPA > 0) {
        if (student.cgpa == null) {
            warnings.push(`Minimum CGPA of ${minimumCGPA} required, but student has not set their CGPA.`);
        } else if (student.cgpa < minimumCGPA) {
            issues.push(`Student CGPA ${student.cgpa} is below the required minimum of ${minimumCGPA}.`);
        }
    }

    // Backlogs check
    if (maximumBacklogs != null) {
        const studentBacklogs = student.backlogs ?? 0;
        if (studentBacklogs > maximumBacklogs) {
            issues.push(`Student has ${studentBacklogs} backlog(s), exceeding the maximum of ${maximumBacklogs}.`);
        }
    }

    // Branch check
    if (eligibleBranches && eligibleBranches.length > 0) {
        if (!student.branch) {
            warnings.push(`Job is open to branches: ${eligibleBranches.join(', ')}. Student branch is not set.`);
        } else {
            const studentBranchNorm = normalizeBranch(student.branch);
            const matched = eligibleBranches.some(b => normalizeBranch(b) === studentBranchNorm);
            if (!matched) {
                issues.push(`Student branch "${student.branch}" is not in eligible branches: ${eligibleBranches.join(', ')}.`);
            }
        }
    }

    return {
        eligible: issues.length === 0,
        issues,       // hard failures
        warnings      // data gaps (not failures)
    };
}

// ─── Skill Match ─────────────────────────────────────────────────────────────
function computeSkillMatch(studentSkills, jobRequirements) {
    const reqSkills = (jobRequirements.requiredSkills || []).map(s => normalizeSkill(s));
    const prefSkills = (jobRequirements.preferredSkills || []).map(s => normalizeSkill(s));
    const studentNorm = (studentSkills || []).map(s => normalizeSkill(s.name));

    const matchedRequired = [];
    const missingRequired = [];
    const matchedPreferred = [];
    const missingPreferred = [];

    for (const sk of reqSkills) {
        if (!sk) continue;
        if (studentNorm.includes(sk)) {
            matchedRequired.push(sk);
        } else {
            missingRequired.push(sk);
        }
    }

    for (const sk of prefSkills) {
        if (!sk) continue;
        if (studentNorm.includes(sk)) {
            matchedPreferred.push(sk);
        } else {
            missingPreferred.push(sk);
        }
    }

    const requiredCoverage = reqSkills.length > 0
        ? (matchedRequired.length / reqSkills.length) * 100
        : 100; // No required skills → full credit

    const preferredCoverage = prefSkills.length > 0
        ? (matchedPreferred.length / prefSkills.length) * 100
        : 0;   // No preferred skills → no bonus

    const skillMatchScore = (requiredCoverage * 0.70) + (preferredCoverage * 0.30);

    return {
        score: Math.round(skillMatchScore),
        matchedRequired,
        missingRequired,
        matchedPreferred,
        missingPreferred
    };
}

// ─── Project Relevance ────────────────────────────────────────────────────────
function computeProjectRelevance(studentProjects, jobRequirements) {
    const reqSkills = (jobRequirements.requiredSkills || []).map(s => normalizeSkill(s));

    if (reqSkills.length === 0) {
        return { score: 50, matchedInProjects: [], note: 'No required skills defined; neutral score applied.' };
    }

    const techsInProjects = new Set();
    (studentProjects || []).forEach(proj => {
        (proj.technologies || []).forEach(t => {
            techsInProjects.add(normalizeSkill(t));
        });
    });

    const matchedInProjects = reqSkills.filter(sk => techsInProjects.has(sk));

    const score = Math.min((matchedInProjects.length / reqSkills.length) * 100, 100);

    return {
        score: Math.round(score),
        matchedInProjects,
        totalProjectTechs: techsInProjects.size
    };
}

// ─── Academic Fit ─────────────────────────────────────────────────────────────
function computeAcademicFit(student, jobRequirements) {
    const { minimumCGPA, maximumBacklogs } = jobRequirements || {};

    let cgpaScore = 80; // neutral when no requirement or no data
    let cgpaNote = 'No CGPA requirement specified.';

    if (minimumCGPA != null && minimumCGPA > 0) {
        if (student.cgpa != null) {
            cgpaScore = Math.min((student.cgpa / minimumCGPA) * 100, 100);
            cgpaNote = `CGPA ${student.cgpa} vs required ${minimumCGPA}.`;
        } else {
            cgpaScore = 0;
            cgpaNote = 'CGPA required but not set by student.';
        }
    } else if (student.cgpa != null) {
        // No requirement but student has CGPA — score based on absolute quality
        cgpaScore = (student.cgpa / 10) * 100;
        cgpaNote = `No CGPA requirement; using student CGPA ${student.cgpa}/10.`;
    }

    const studentBacklogs = student.backlogs ?? 0;
    let backlogScore = 100;
    let backlogNote = 'No backlog limit specified.';
    if (maximumBacklogs != null) {
        backlogScore = studentBacklogs <= maximumBacklogs ? 100 : 0;
        backlogNote = `Backlogs: ${studentBacklogs}, allowed: ${maximumBacklogs}.`;
    }

    const academicFitScore = (cgpaScore * 0.70) + (backlogScore * 0.30);

    return {
        score: Math.round(academicFitScore),
        cgpaScore: Math.round(cgpaScore),
        backlogScore,
        cgpaNote,
        backlogNote
    };
}

// ─── Evidence Coverage ────────────────────────────────────────────────────────
function computeEvidenceCoverage(student) {
    let score = 0;
    const present = [];
    const absent = [];

    if (student.skills && student.skills.length > 0) { score += 25; present.push('Skills'); }
    else absent.push('Skills');

    if (student.projects && student.projects.length > 0) { score += 25; present.push('Projects'); }
    else absent.push('Projects');

    if (student.resume && student.resume.fileUrl) { score += 25; present.push('Resume'); }
    else absent.push('Resume');

    if (student.cgpa != null) { score += 25; present.push('CGPA'); }
    else absent.push('CGPA');

    return { score, present, absent };
}

// ─── Final Match ─────────────────────────────────────────────────────────────
function matchStudentToJob(student, job) {
    const requirements = job.requirements || {};

    const eligibility = checkEligibility(student, requirements);
    const skillMatch = computeSkillMatch(student.skills, requirements);
    const projectRelevance = computeProjectRelevance(student.projects, requirements);
    const academicFit = computeAcademicFit(student, requirements);
    const evidenceCoverage = computeEvidenceCoverage(student);

    const matchScore =
        (skillMatch.score      * 0.50) +
        (projectRelevance.score * 0.20) +
        (academicFit.score     * 0.20) +
        (evidenceCoverage.score * 0.10);

    let matchCategory = 'Weak';
    if (matchScore >= 75) matchCategory = 'Strong';
    else if (matchScore >= 50) matchCategory = 'Moderate';

    return {
        eligible: eligibility.eligible,
        eligibilityIssues: eligibility.issues,
        eligibilityWarnings: eligibility.warnings,
        matchScore: Math.round(matchScore),
        matchCategory,
        breakdown: {
            skillMatch: skillMatch.score,
            projectRelevance: projectRelevance.score,
            academicFit: academicFit.score,
            evidenceCoverage: evidenceCoverage.score
        },
        skillDetail: {
            matchedRequired:  skillMatch.matchedRequired,
            missingRequired:  skillMatch.missingRequired,
            matchedPreferred: skillMatch.matchedPreferred,
            missingPreferred: skillMatch.missingPreferred
        },
        projectDetail: {
            matchedInProjects: projectRelevance.matchedInProjects,
            totalProjectTechs: projectRelevance.totalProjectTechs,
            note: projectRelevance.note
        },
        academicDetail: {
            cgpaScore:   academicFit.cgpaScore,
            backlogScore: academicFit.backlogScore,
            cgpaNote:    academicFit.cgpaNote,
            backlogNote: academicFit.backlogNote
        },
        evidenceDetail: {
            present: evidenceCoverage.present,
            absent:  evidenceCoverage.absent
        }
    };
}

module.exports = {
    matchStudentToJob,
    checkEligibility,
    computeSkillMatch,
    computeProjectRelevance,
    computeAcademicFit,
    computeEvidenceCoverage
};

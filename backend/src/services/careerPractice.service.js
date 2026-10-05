'use strict';

const AssessmentAttempt = require('../models/AssessmentAttempt');
const MockInterview = require('../models/MockInterview');
const Student = require('../models/Student');
const { calculateAndPersistReadiness } = require('./readiness/readiness.service');
const { selectQuestions, publicQuestion, getQuestion } = require('./assessment.catalog');
const { evaluateInterview, calculateInterviewScore } = require('./mockInterview.evaluation.service');

const ASSESSMENT_DURATION_SECONDS = 15 * 60;
const INTERVIEW_QUESTIONS = 5;

function fail(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    throw error;
}

function publicAssessment(attempt) {
    const ids = attempt.questionIds || [];
    return {
        id: String(attempt._id),
        status: attempt.status,
        startedAt: attempt.startedAt,
        durationSeconds: attempt.durationSeconds,
        expiresAt: new Date(new Date(attempt.startedAt).getTime() + attempt.durationSeconds * 1000),
        questions: ids.map(getQuestion).filter(Boolean).map(publicQuestion),
        result: attempt.status === 'completed' ? assessmentResult(attempt) : null
    };
}

function assessmentResult(attempt) {
    return {
        id: String(attempt._id),
        overallScore: attempt.overallScore,
        technicalScore: attempt.technicalScore,
        aptitudeScore: attempt.aptitudeScore,
        strengths: attempt.strengths || [],
        improvementAreas: attempt.improvementAreas || [],
        completedAt: attempt.completedAt,
        durationTakenSeconds: attempt.durationTakenSeconds
    };
}

function interviewResult(attempt) {
    return {
        id: String(attempt._id),
        targetRole: attempt.targetRole,
        overallScore: attempt.overallScore,
        technicalScore: attempt.technicalScore,
        communicationScore: attempt.communicationScore,
        behavioralScore: attempt.behavioralScore,
        strengths: attempt.strengths || [],
        improvementAreas: attempt.improvementAreas || [],
        feedback: attempt.feedback,
        completedAt: attempt.completedAt,
        durationTakenSeconds: attempt.durationTakenSeconds
    };
}

function validateAssessmentAnswers(answers, questionIds) {
    if (!Array.isArray(answers) || answers.length !== questionIds.length) {
        fail('Answer all 10 questions before submitting.', 400, 'ASSESSMENT_ANSWERS_INCOMPLETE');
    }
    const expected = new Set(questionIds);
    const received = new Set();
    const normalized = answers.map((answer) => {
        const questionId = String(answer?.questionId || '');
        const selectedIndex = answer?.selectedIndex;
        const question = getQuestion(questionId);
        if (!expected.has(questionId) || received.has(questionId) || !question
            || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) {
            fail('One or more submitted answers are invalid. Review the questions and try again.', 400, 'ASSESSMENT_ANSWERS_INVALID');
        }
        received.add(questionId);
        return { questionId, selectedIndex, correct: selectedIndex === question.correctIndex, category: question.category };
    });
    if (received.size !== expected.size) fail('Answer all 10 questions before submitting.', 400, 'ASSESSMENT_ANSWERS_INCOMPLETE');
    return normalized;
}

function calculateAssessmentScores(answers) {
    const technical = answers.filter((answer) => answer.category !== 'Aptitude');
    const aptitude = answers.filter((answer) => answer.category === 'Aptitude');
    const technicalScore = Math.round(technical.filter((answer) => answer.correct).length / technical.length * 100);
    const aptitudeScore = Math.round(aptitude.filter((answer) => answer.correct).length / aptitude.length * 100);
    const overallScore = Math.round(technicalScore * 0.70 + aptitudeScore * 0.30);
    const strengths = [...new Set(technical.filter((answer) => answer.correct).map((answer) => answer.category))].slice(0, 3);
    const improvementAreas = [...new Set(technical.filter((answer) => !answer.correct).map((answer) => answer.category))].slice(0, 3);
    if (!strengths.length) strengths.push('Use the explanations to build a stronger technical foundation.');
    if (!improvementAreas.length && aptitudeScore < 70) improvementAreas.push('Aptitude practice');
    if (!improvementAreas.length) improvementAreas.push('Continue practicing with role-specific questions.');
    return { technicalScore, aptitudeScore, overallScore, strengths, improvementAreas };
}

function makeInterviewQuestions({ targetRole, profile }) {
    const skill = profile?.skills?.find((item) => item?.name)?.name || 'a technical skill from your profile';
    const project = profile?.projects?.find((item) => item?.title)?.title;
    return [
        { id: 'technical', category: 'Technical', prompt: `For a ${targetRole} role, describe how you have used ${skill} or how you would use it to solve a practical problem. Explain one trade-off you would consider.` },
        { id: 'project', category: 'Project', prompt: project ? `Walk me through your ${project} project: what problem did it solve, what did you build, and what was the hardest technical decision?` : `Describe a project relevant to ${targetRole}. What did you build, what was your contribution, and what would you improve next?` },
        { id: 'problem-solving', category: 'Problem solving', prompt: `A feature for a ${targetRole} product is failing intermittently in production. How would you investigate it, prioritize the evidence, and reduce the risk while fixing it?` },
        { id: 'communication', category: 'Communication', prompt: `Explain one technical decision relevant to ${targetRole} to a teammate who is new to the system. How would you make the explanation clear and check that it was understood?` },
        { id: 'behavioral', category: 'Behavioral', prompt: 'Tell me about a time you received difficult feedback or faced a setback while working with others. What did you do, and what changed afterward?' }
    ];
}

function validateInterviewAnswers(answers, questions) {
    if (!Array.isArray(answers) || answers.length !== questions.length) fail('Answer all 5 interview questions before evaluation.', 400, 'INTERVIEW_ANSWERS_INCOMPLETE');
    const expected = new Set(questions.map((question) => question.id));
    const received = new Set();
    const normalized = answers.map((answer) => {
        const questionId = String(answer?.questionId || '');
        const text = typeof answer?.answer === 'string' ? answer.answer.trim() : '';
        if (!expected.has(questionId) || received.has(questionId) || text.length < 2 || text.length > 2000) {
            fail('Each interview answer must be between 2 and 2,000 characters.', 400, 'INTERVIEW_ANSWERS_INVALID');
        }
        received.add(questionId);
        return { questionId, answer: text };
    });
    if (received.size !== expected.size) fail('Answer all 5 interview questions before evaluation.', 400, 'INTERVIEW_ANSWERS_INCOMPLETE');
    return normalized;
}

async function refreshReadiness(userId) {
    const [student, assessment, interview] = await Promise.all([
        Student.findOne({ userId }),
        AssessmentAttempt.findOne({ studentId: userId, status: 'completed' }).sort({ completedAt: -1 }).select('overallScore'),
        MockInterview.findOne({ studentId: userId, status: 'completed' }).sort({ completedAt: -1 }).select('overallScore')
    ]);
    if (!student) return;
    student.set('readiness.assessmentScore', assessment?.overallScore ?? null);
    student.set('readiness.interviewScore', interview?.overallScore ?? null);
    await calculateAndPersistReadiness(student);
}

async function getLatest(userId) {
    const [assessment, interview] = await Promise.all([
        AssessmentAttempt.findOne({ studentId: userId, status: 'completed' }).sort({ completedAt: -1 }),
        MockInterview.findOne({ studentId: userId, status: 'completed' }).sort({ completedAt: -1 })
    ]);
    return {
        assessment: assessment ? assessmentResult(assessment) : null,
        interview: interview ? interviewResult(interview) : null
    };
}

async function startAssessment(userId) {
    const student = await Student.findOne({ userId }).select('skills projects cgpa branch');
    if (!student) fail('Complete your student profile before starting an assessment.', 404, 'STUDENT_PROFILE_NOT_FOUND');
    const now = new Date();
    let active = await AssessmentAttempt.findOne({ studentId: userId, status: 'in_progress' }).sort({ startedAt: -1 });
    if (active && now.getTime() >= new Date(active.startedAt).getTime() + active.durationSeconds * 1000) {
        active.status = 'expired';
        await active.save();
        active = null;
    }
    if (active) return publicAssessment(active);

    const questions = selectQuestions(student);
    const attempt = await AssessmentAttempt.create({
        studentId: userId,
        assessmentId: 'placement-readiness-v1',
        assessmentVersion: 'campuslink-basics-v1',
        questionIds: questions.map((question) => question.id),
        startedAt: now,
        durationSeconds: ASSESSMENT_DURATION_SECONDS,
        status: 'in_progress'
    });
    return publicAssessment(attempt);
}

async function submitAssessment(userId, attemptId, input) {
    const attempt = await AssessmentAttempt.findOne({ _id: attemptId, studentId: userId });
    if (!attempt) fail('Assessment attempt not found.', 404, 'ASSESSMENT_NOT_FOUND');
    if (attempt.status === 'completed') return assessmentResult(attempt);
    if (attempt.status !== 'in_progress') fail('This assessment is no longer active. Start a new attempt.', 410, 'ASSESSMENT_EXPIRED');
    const now = new Date();
    if (now.getTime() >= new Date(attempt.startedAt).getTime() + attempt.durationSeconds * 1000) {
        attempt.status = 'expired';
        await attempt.save();
        fail('Time is up. Start a new assessment to try again.', 410, 'ASSESSMENT_EXPIRED');
    }
    const normalized = validateAssessmentAnswers(input?.answers, attempt.questionIds);
    const scores = calculateAssessmentScores(normalized);
    attempt.answers = normalized.map(({ questionId, selectedIndex, correct }) => ({ questionId, selectedIndex, correct }));
    Object.assign(attempt, scores, {
        status: 'completed',
        completedAt: now,
        durationTakenSeconds: Math.max(0, Math.round((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000))
    });
    await attempt.save();
    await refreshReadiness(userId);
    return assessmentResult(attempt);
}

async function startInterview(userId, input) {
    const targetRole = typeof input?.targetRole === 'string' ? input.targetRole.trim().replace(/\s+/g, ' ') : '';
    if (!targetRole || targetRole.length > 120) fail('Choose or enter a target role (up to 120 characters).', 400, 'INTERVIEW_ROLE_INVALID');
    const profile = await Student.findOne({ userId }).select('skills projects branch cgpa');
    if (!profile) fail('Complete your student profile before starting a mock interview.', 404, 'STUDENT_PROFILE_NOT_FOUND');
    let active = await MockInterview.findOne({ studentId: userId, targetRole, status: { $in: ['in_progress', 'evaluation_failed'] } }).sort({ createdAt: -1 });
    if (active) return {
        id: String(active._id), targetRole: active.targetRole, status: active.status,
        questions: active.questions, answers: active.answers || [], result: active.status === 'completed' ? interviewResult(active) : null
    };
    const questions = makeInterviewQuestions({ targetRole, profile });
    const attempt = await MockInterview.create({ studentId: userId, targetRole, questions, status: 'in_progress' });
    return { id: String(attempt._id), targetRole, status: attempt.status, questions: attempt.questions, answers: [], result: null };
}

async function submitInterview(userId, interviewId, input) {
    const attempt = await MockInterview.findOne({ _id: interviewId, studentId: userId });
    if (!attempt) fail('Mock interview not found.', 404, 'INTERVIEW_NOT_FOUND');
    if (attempt.status === 'completed') return interviewResult(attempt);
    if (attempt.status === 'evaluating') fail('This interview is already being evaluated. Please wait.', 409, 'INTERVIEW_EVALUATING');
    const normalized = validateInterviewAnswers(input?.answers, attempt.questions);
    attempt.answers = normalized;
    attempt.status = 'evaluating';
    await attempt.save();

    let evaluation;
    try {
        const profile = await Student.findOne({ userId }).select('skills projects branch cgpa');
        evaluation = await evaluateInterview({ targetRole: attempt.targetRole, questions: attempt.questions, answers: normalized, profile });
    } catch (error) {
        attempt.status = 'evaluation_failed';
        await attempt.save();
        if (error?.code && String(error.code).startsWith('AI_')) throw error;
        fail('AI evaluation could not be completed. Your answers are saved; please retry.', 502, 'AI_EVALUATION_FAILED');
    }
    attempt.technicalScore = evaluation.technicalScore;
    attempt.communicationScore = evaluation.communicationScore;
    attempt.behavioralScore = evaluation.behavioralScore;
    attempt.overallScore = calculateInterviewScore(evaluation);
    attempt.strengths = evaluation.strengths;
    attempt.improvementAreas = evaluation.improvementAreas;
    attempt.feedback = evaluation.feedback;
    attempt.status = 'completed';
    attempt.completedAt = new Date();
    attempt.durationTakenSeconds = Math.max(0, Math.round((attempt.completedAt.getTime() - new Date(attempt.createdAt).getTime()) / 1000));
    await attempt.save();
    await refreshReadiness(userId);
    return interviewResult(attempt);
}

module.exports = {
    getLatest,
    startAssessment,
    submitAssessment,
    startInterview,
    submitInterview,
    validateAssessmentAnswers,
    calculateAssessmentScores,
    makeInterviewQuestions,
    validateInterviewAnswers,
    refreshReadiness,
    ASSESSMENT_DURATION_SECONDS,
    INTERVIEW_QUESTIONS
};

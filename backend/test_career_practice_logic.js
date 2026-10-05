'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectQuestions, publicQuestion, getQuestion } = require('./src/services/assessment.catalog');
const {
    validateAssessmentAnswers,
    calculateAssessmentScores,
    makeInterviewQuestions,
    validateInterviewAnswers
} = require('./src/services/careerPractice.service');
const { parseEvaluation, calculateInterviewScore } = require('./src/services/mockInterview.evaluation.service');
const { calculateReadiness } = require('./src/services/readiness/readiness.engine');

test('assessment exposes ten questions without answer keys and adapts a programming prompt to profile skills', () => {
    const questions = selectQuestions({ skills: [{ name: 'Python' }] });
    assert.equal(questions.length, 10);
    assert.equal(questions.filter((question) => question.category === 'Aptitude').length, 3);
    assert.equal(questions.filter((question) => question.category !== 'Aptitude').length, 7);
    assert.ok(questions.some((question) => question.id === 'programming-python'));
    assert.equal(Object.hasOwn(publicQuestion(questions[0]), 'correctIndex'), false);
    assert.equal(getQuestion('programming-python').correctIndex, 0);
});

test('assessment answer validation and server scoring apply the 70/30 formula', () => {
    const questions = selectQuestions();
    const answers = questions.map((question, index) => ({ questionId: question.id, selectedIndex: index === 0 ? 3 : question.correctIndex }));
    const validated = validateAssessmentAnswers(answers, questions.map((question) => question.id));
    const result = calculateAssessmentScores(validated);
    assert.equal(result.technicalScore, 86);
    assert.equal(result.aptitudeScore, 100);
    assert.equal(result.overallScore, 90);
    assert.throws(() => validateAssessmentAnswers(answers.slice(1), questions.map((question) => question.id)), { code: 'ASSESSMENT_ANSWERS_INCOMPLETE' });
    assert.throws(() => validateAssessmentAnswers([...answers.slice(0, -1), answers[0]], questions.map((question) => question.id)), { code: 'ASSESSMENT_ANSWERS_INVALID' });
});

test('interview questions adapt to profile and require five bounded answers', () => {
    const questions = makeInterviewQuestions({ targetRole: 'Backend Developer', profile: { skills: [{ name: 'Node.js' }], projects: [{ title: 'CampusLink' }] } });
    assert.equal(questions.length, 5);
    assert.match(questions[0].prompt, /Node\.js/);
    assert.match(questions[1].prompt, /CampusLink/);
    const answers = questions.map((question) => ({ questionId: question.id, answer: `A thoughtful answer for ${question.category}.` }));
    assert.equal(validateInterviewAnswers(answers, questions).length, 5);
    assert.throws(() => validateInterviewAnswers(answers.map((answer) => ({ ...answer, answer: 'x' })), questions), { code: 'INTERVIEW_ANSWERS_INVALID' });
});

test('AI component scores are constrained and the final interview score is calculated by the server', () => {
    const result = parseEvaluation(JSON.stringify({
        technicalScore: 82,
        communicationScore: 76,
        behavioralScore: 84,
        strengths: ['Clear project explanation'],
        improvementAreas: ['Make answers more concise'],
        feedback: 'Use concise, structured examples.'
    }));
    assert.equal(calculateInterviewScore(result), 81);
    assert.throws(() => parseEvaluation(JSON.stringify({ ...result, technicalScore: 101 })), { code: 'AI_EVALUATION_INVALID' });
    assert.throws(() => parseEvaluation('not json'), { code: 'AI_EVALUATION_INVALID' });
});

test('readiness includes completed practice scores and leaves missing components reweighted as before', () => {
    const profile = { skills: [], projects: [], cgpa: 8, backlogs: 0, readiness: { assessmentScore: 80, interviewScore: 60 } };
    const readiness = calculateReadiness(profile);
    assert.equal(readiness.assessmentScore, 80);
    assert.equal(readiness.interviewScore, 60);
    assert.equal(readiness.score, 38);
    assert.equal(readiness.missingEvidence.includes('Assessment'), false);
    assert.equal(readiness.missingEvidence.includes('Interview'), false);
    const beforePractice = calculateReadiness({ ...profile, readiness: {} });
    assert.equal(beforePractice.assessmentScore, null);
    assert.equal(beforePractice.interviewScore, null);
    assert.equal(beforePractice.missingEvidence.includes('Assessment'), true);
    assert.equal(beforePractice.missingEvidence.includes('Interview'), true);
});

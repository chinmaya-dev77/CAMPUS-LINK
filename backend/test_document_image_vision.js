'use strict';

const assert = require('node:assert/strict');

const originalFetch = global.fetch;
const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    AI_VISION_MODEL: process.env.AI_VISION_MODEL,
    AI_MAX_RETRIES: process.env.AI_MAX_RETRIES
};
let requests = [];
global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ readable: true, documentType: 'Marksheet', studentName: 'Chinmaya Prusty', studentId: '', branch: 'CSE', course: 'Computer Science', institution: 'Campus University', marks: '88/100', percentage: 88, cgpa: 8.2, dates: [], otherFields: {} }) } }] }) };
};

(async () => {
    process.env.AI_PROVIDER = 'groq';
    process.env.AI_API_KEY = 'test-only';
    process.env.LLM_MODEL = 'text-only-test-model';
    delete process.env.AI_VISION_MODEL;
    process.env.AI_MAX_RETRIES = '1';
    const { extractPlacementDocument } = require('./src/services/ai.service');
    const image = Buffer.from('test image bytes');

    await extractPlacementDocument({ imageBuffers: [{ buffer: image, contentType: 'image/png' }] });
    assert.equal(requests[0].model, 'qwen/qwen3.8-27b', 'image uploads should select a vision-capable Groq model rather than the text-only model');
    assert.equal(requests[0].messages[1].content[1].image_url.url, `data:image/png;base64,${image.toString('base64')}`);

    await extractPlacementDocument({ imageBuffers: [image, image].map((buffer) => ({ buffer, contentType: 'image/jpeg' })) });
    assert.equal(requests[1].model, 'qwen/qwen3.8-27b', 'scanned PDF page images should use vision extraction');
    assert.equal(requests[1].messages[1].content.filter((part) => part.type === 'image_url').length, 2, 'rendered PDF pages should be submitted together');

    await extractPlacementDocument({ text: 'searchable PDF transcript text' });
    assert.equal(requests[2].model, 'text-only-test-model', 'searchable PDFs should continue using the configured text model');
    console.log('Document image vision routing tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

/**
 * Groq LLM Adapter for CampusLink AI Service.
 *
 * Uses native fetch (Node 18+) — no SDK installed.
 * Model is configurable via LLM_MODEL environment variable.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Call the Groq API with the given messages.
 * @param {Array}  messages  - OpenAI-compatible message array
 * @param {string} model     - model identifier from LLM_MODEL env var
 * @returns {Promise<string>} - raw LLM text output
 */
async function callGroq(messages, model) {
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
        const err = new Error('AI_API_KEY is not configured. Set it in the backend .env file.');
        err.status = 500;
        err.code   = 'AI_NOT_CONFIGURED';
        throw err;
    }

    if (!model) {
        const err = new Error('LLM_MODEL is not configured. Set it in the backend .env file.');
        err.status = 500;
        err.code   = 'AI_NOT_CONFIGURED';
        throw err;
    }

    const timeoutMs = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 30000;
    let response;
    try {
        response = await fetch(GROQ_API_URL, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature:    0,       // deterministic output for data extraction
                max_tokens:     model === 'qwen/qwen3.8-27b' ? 8192 : 2048,
                response_format: { type: 'json_object' }
            }),
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (cause) {
        const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
        const err = new Error(timedOut ? 'AI provider request timed out.' : 'AI provider is unreachable.');
        err.status = 502;
        err.code = timedOut ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE';
        throw err;
    }

    if (!response.ok) {
        // Report status only; provider response bodies can contain submitted content.
        console.error(`[Groq] API error ${response.status}`);
        const err = new Error(`AI provider returned error ${response.status}. Check your API key and model name.`);
        err.status = response.status === 429 ? 429 : 502;
        err.code   = response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR';
        const retryAfter = response.headers?.get?.('retry-after');
        if (retryAfter) {
            const seconds = Number(retryAfter);
            const retryAt = Date.parse(retryAfter);
            if (Number.isFinite(seconds)) err.retryAfterMs = Math.max(0, seconds * 1000);
            else if (Number.isFinite(retryAt)) err.retryAfterMs = Math.max(0, retryAt - Date.now());
        }
        throw err;
    }

    const data    = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
        const err = new Error('AI provider returned an empty response.');
        err.status = 502;
        err.code   = 'AI_EMPTY_RESPONSE';
        throw err;
    }

    return content;
}

module.exports = { callGroq };

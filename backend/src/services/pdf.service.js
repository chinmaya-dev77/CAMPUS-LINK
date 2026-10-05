const pdfParse = require('pdf-parse');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// PDF magic bytes: %PDF (hex 25 50 44 46)
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

/**
 * Validate the first bytes of a file to ensure it is a real PDF.
 * @param {string} filePath  - absolute path to the uploaded file
 * @throws if the file does not begin with PDF magic bytes
 */
function validateMagicBytes(input) {
    const buffer = Buffer.isBuffer(input) ? input : require('fs').readFileSync(input);
    if (!buffer.subarray(0, 4).equals(PDF_MAGIC)) {
        const err = new Error('The uploaded file does not appear to be a valid PDF');
        err.status = 400;
        err.code   = 'INVALID_PDF';
        throw err;
    }
}

/**
 * Extract text from a PDF file.
 * @param {string} filePath  - absolute path to the uploaded PDF file
 * @returns {Promise<string>} - extracted plain text
 * @throws on corrupt PDF, empty text, or extraction failure
 */
async function extractText(file) {
    validateMagicBytes(file);
    const buffer = Buffer.isBuffer(file) ? file : require('fs').readFileSync(file);

    let result;
    try {
        let timeout;
        try {
            result = await Promise.race([
                pdfParse(buffer),
                new Promise((_, reject) => {
                    timeout = setTimeout(() => {
                        const error = new Error('PDF text extraction timed out.'); error.code = 'PDF_PARSE_TIMEOUT'; reject(error);
                    }, Number.parseInt(process.env.PDF_PARSE_TIMEOUT_MS, 10) || 20000);
                })
            ]);
        } finally { clearTimeout(timeout); }
    } catch (e) {
        console.error("PDF_PARSE_ERROR internal:", e);
        const err = new Error(e.code === 'PDF_PARSE_TIMEOUT' ? 'PDF text extraction timed out.' : 'Failed to parse the PDF. The file may be corrupt.');
        err.status = e.code === 'PDF_PARSE_TIMEOUT' ? 504 : 400;
        err.code   = e.code === 'PDF_PARSE_TIMEOUT' ? 'PDF_PARSE_TIMEOUT' : 'PDF_PARSE_ERROR';
        throw err;
    }

    const text = (result.text || '').trim();

    const readableCharacters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
    if (readableCharacters < 20) {
        const err = new Error(
            'No usable text was found in the PDF.'
        );
        err.status = 400;
        err.code   = 'EMPTY_PDF';
        throw err;
    }

    return text;
}

async function renderPdfPages(buffer, maxPages = 3) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'campuslink-resume-'));
    const input = path.join(directory, 'resume.pdf');
    const outputPrefix = path.join(directory, 'page');
    const executable = process.env.PDFTOPPM_PATH || 'pdftoppm';
    try {
        await fs.writeFile(input, buffer);
        await execFileAsync(executable, ['-f', '1', '-l', String(maxPages), '-jpeg', '-scale-to', '1600', input, outputPrefix], {
            timeout: 30000,
            windowsHide: true,
            maxBuffer: 1024 * 1024
        });
        const names = (await fs.readdir(directory)).filter((name) => /^page-\d+\.jpg$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0])).slice(0, maxPages);
        const pages = await Promise.all(names.map((name) => fs.readFile(path.join(directory, name))));
        if (!pages.length) {
            const error = new Error('The PDF could not be rendered for scanned-document text extraction.');
            error.code = 'PDF_RENDER_FAILED'; error.status = 422; throw error;
        }
        return pages;
    } catch (cause) {
        if (cause.code === 'ENOENT') {
            const error = new Error('Scanned PDF text extraction is unavailable because the PDF renderer is not installed.');
            error.code = 'PDF_RENDERER_UNAVAILABLE'; error.status = 503; throw error;
        }
        if (cause.code === 'PDF_RENDER_FAILED') throw cause;
        const error = new Error('This PDF could not be rendered. It may be corrupt, encrypted, or password-protected.');
        error.code = 'PDF_RENDER_FAILED'; error.status = 422; throw error;
    } finally {
        await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { extractText, renderPdfPages };

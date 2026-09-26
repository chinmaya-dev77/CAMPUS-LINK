const fs = require('fs');
const pdfParse = require('pdf-parse');

// PDF magic bytes: %PDF (hex 25 50 44 46)
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

/**
 * Validate the first bytes of a file to ensure it is a real PDF.
 * @param {string} filePath  - absolute path to the uploaded file
 * @throws if the file does not begin with PDF magic bytes
 */
function validateMagicBytes(filePath) {
    const header = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    try {
        fs.readSync(fd, header, 0, 4, 0);
    } finally {
        fs.closeSync(fd);
    }

    if (!header.equals(PDF_MAGIC)) {
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
async function extractText(filePath) {
    validateMagicBytes(filePath);

    const buffer = fs.readFileSync(filePath);

    let result;
    try {
        result = await pdfParse(buffer);
    } catch (e) {
        console.error("PDF_PARSE_ERROR internal:", e);
        const err = new Error('Failed to parse the PDF. The file may be corrupt.');
        err.status = 400;
        err.code   = 'PDF_PARSE_ERROR';
        throw err;
    }

    const text = (result.text || '').trim();

    if (!text || text.length < 20) {
        const err = new Error(
            'No readable text found in the PDF. ' +
            'Please upload a text-based PDF. Scanned image PDFs are not supported.'
        );
        err.status = 400;
        err.code   = 'EMPTY_PDF';
        throw err;
    }

    return text;
}

module.exports = { extractText };

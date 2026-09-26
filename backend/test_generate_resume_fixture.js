'use strict';

const fs = require('node:fs');
const path = require('node:path');

const tempRoot = path.resolve(process.env.TEMP || process.env.TMPDIR || '');
const outputPath = path.resolve(process.env.QA_RESUME_PDF || '');
const qaPrefix = path.join(tempRoot, 'campuslink-qa-release-');
if (!process.env.QA_RESUME_PDF || !outputPath.toLowerCase().startsWith(qaPrefix.toLowerCase())) {
    throw new Error('Set QA_RESUME_PDF to a fixture path inside the disposable campuslink-qa-release temp directory.');
}

const escape = text => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const lines = [
    'Avery QA Student',
    'Skills: JavaScript, Node.js, Express.js, MongoDB, Git',
    'Projects: Campus Placement Matcher using JavaScript and Node.js',
    'Education: Bachelor of Technology in Computer Science, 2023 to 2027'
];
const content = `BT\n/F1 12 Tf\n50 760 Td\n${lines.map((line, index) => `${index ? '0 -20 Td\n' : ''}(${escape(line)}) Tj`).join('\n')}\nET\n`;
const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`
];
let output = '%PDF-1.4\n';
const offsets = [];
objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(output, 'ascii');
output += `xref\n0 6\n0000000000 65535 f \n`;
for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

fs.writeFileSync(outputPath, Buffer.from(output, 'ascii'));
console.log(`Synthetic text resume fixture created (${fs.statSync(outputPath).size} bytes).`);

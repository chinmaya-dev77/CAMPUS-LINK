const { v2: cloudinary } = require('cloudinary');

function configured() {
    return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

function client() {
    if (!configured()) {
        const error = new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
        error.status = 503;
        error.code = 'CLOUDINARY_NOT_CONFIGURED';
        throw error;
    }
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
    return cloudinary;
}

function uploadBuffer(buffer, { folder, resourceType, originalFilename }) {
    const api = client();
    return new Promise((resolve, reject) => {
        const stream = api.uploader.upload_stream({
            folder,
            resource_type: resourceType,
            type: 'authenticated',
            use_filename: false,
            unique_filename: true,
            filename_override: originalFilename,
            access_mode: 'authenticated'
        }, (error, result) => error ? reject(error) : resolve({
            publicId: result.public_id,
            resourceType: result.resource_type,
            secureUrl: result.secure_url,
            version: result.version,
            format: result.format,
            bytes: result.bytes
        }));
        stream.end(buffer);
    });
}

async function deleteAsset(publicId, resourceType) {
    if (!publicId || !configured()) return;
    await client().uploader.destroy(publicId, { resource_type: resourceType || 'raw', type: 'authenticated', invalidate: true });
}

function privateDownloadUrl(publicId, resourceType, format) {
    const api = client();
    return api.utils.private_download_url(publicId, format || '', {
        resource_type: resourceType || 'raw',
        type: 'authenticated',
        expires_at: Math.floor(Date.now() / 1000) + 60
    });
}

async function downloadAsset(publicId, resourceType, format) {
    const response = await fetch(privateDownloadUrl(publicId, resourceType, format), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
        const error = new Error('Cloudinary file is unavailable.');
        error.status = response.status === 404 ? 404 : 502;
        error.code = 'ASSET_UNAVAILABLE';
        throw error;
    }
    return Buffer.from(await response.arrayBuffer());
}

module.exports = { uploadBuffer, deleteAsset, downloadAsset, configured };

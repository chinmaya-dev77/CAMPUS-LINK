'use strict';

/**
 * Require an explicitly selected disposable local database and non-default API
 * port before an integration test can issue requests or database writes.
 */
function assertIsolatedMongoUri() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('Set MONGODB_URI to an explicit isolated test database.');
    }

    let parsed;
    try {
        parsed = new URL(mongoUri);
    } catch {
        throw new Error('MONGODB_URI must be a valid local MongoDB URL for an isolated test database.');
    }
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!localHost || !/^campuslink_qa_[a-z0-9_-]+$/i.test(databaseName)) {
        throw new Error('MONGODB_URI must target local MongoDB and a database named campuslink_qa_<name>.');
    }
}

function requireIsolatedTestEnvironment() {
    const apiPort = Number(process.env.API_PORT);
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort === 5000) {
        throw new Error('Set API_PORT to an explicit isolated backend port (1024+ and not 5000).');
    }
    assertIsolatedMongoUri();

    return apiPort;
}

module.exports = requireIsolatedTestEnvironment;
module.exports.assertIsolatedMongoUri = assertIsolatedMongoUri;

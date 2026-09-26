require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// ─── Route imports (added phase by phase) ────────────────────────────────────
const healthRoutes = require("./routes/health.routes");
const authRoutes     = require("./routes/auth.routes");
const studentRoutes  = require("./routes/student.routes");
const recruiterRoutes= require("./routes/recruiter.routes");
const jobRoutes      = require("./routes/job.routes");
const applicationRoutes = require("./routes/application.routes");
const driveRoutes    = require("./routes/drive.routes");
const offerRoutes    = require("./routes/offer.routes");
const analyticsRoutes= require("./routes/analytics.routes");
const assistantRoutes = require("./routes/assistant.routes");

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow the static frontend (served locally or from file://) to call the API.
app.use(
    cors({
        origin: [ "null",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
             "http://127.0.0.1:3002",
        ],
        credentials: true,
    })
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Cookie parser ────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Disable API response caching ─────────────────────────────────────────────
// Express auto-generates ETags; without this a browser may serve a 304 stale
// response for GET /api/jobs even after a recruiter has deleted all jobs.
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/health", healthRoutes);
app.use("/api/auth",   authRoutes);
app.use("/api/students",    studentRoutes);
app.use("/api/recruiters",  recruiterRoutes);
app.use("/api/jobs",        jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/drives", driveRoutes);
app.use("/api/offers",      offerRoutes);
app.use("/api/analytics",   analyticsRoutes);
app.use("/api/assistant", assistantRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: "ROUTE_NOT_FOUND",
            message: `Cannot ${req.method} ${req.originalUrl}`,
        },
    });
});

// ─── Global error handler ────────────────────────────────────────────────────
// Must have 4 parameters so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("[ERROR]", err.stack || err.message);

    const status = err.status || err.statusCode
        || (err.code === 11000 ? 409 : ['ValidationError', 'CastError'].includes(err.name) ? 400 : 500);
    const code = typeof err.code === 'string' ? err.code
        : err.code === 11000 ? 'DUPLICATE_RECORD'
            : ['ValidationError', 'CastError'].includes(err.name) ? 'INVALID_INPUT' : 'INTERNAL_SERVER_ERROR';

    res.status(status).json({
        success: false,
        error: {
            code,
            message: err.message || "An unexpected error occurred",
        },
    });
});

module.exports = app;

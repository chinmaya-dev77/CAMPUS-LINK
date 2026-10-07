# CAMPUSLINK — MASTER JUDGE PREPARATION

A simple guide to what the repository actually does. Use the **OPEN / FUNCTION / SHOW** lines to prepare a code demo. If something is absent, say so. Older design docs are not proof that a feature shipped.

## 1. Project overview

CampusLink is a browser app for student placement preparation, recruiter candidate review, and placement-office coordination. It connects profiles, jobs, applications, drives, offers, documents, and analytics.

- **Student:** edits a profile, uploads a resume, sees readiness and opportunities, tracks applications/offers.
- **Recruiter:** edits recruiter profile, creates jobs, reviews candidates and applications, manages drives/offers.
- **Placement officer:** views students, recruiters, drives, applications, offers, and placement analytics.

**OPEN:** `backend/src/models/User.js`, `Student.js`, `Job.js`, `Application.js`, `Drive.js`, `Offer.js`.

**SHOW:** User is the account; Student is a separate profile connected by a unique `userId`. Applications and drives connect students, recruiters, and jobs.

**SAY:** “CampusLink brings placement preparation and placement workflows into one application. The three roles work with connected records in the same backend.”

**Judge asks: Is this an automatic placement system?** No. It gives workflow tools and decision-support signals. People still make placement decisions.

## 2. Architecture

```text
Browser: HTML + CSS + vanilla JavaScript
                 ↓ HTTP + Bearer token
Express routes and middleware → controllers → services/engines
                                                 ↓
                                              MongoDB
                                 ↙ Groq  ↙ Cloudinary  ↘ SMTP / Flask risk
```

**OPEN:** `backend/src/app.js`, `backend/server.js`, `frontend/js/api.js`.

**FUNCTION:** API setup is in `app.js`; `start()` starts backend after DB connection; `apiRequest()`, `apiGet()`, `apiPost()`, `apiPatch()` make browser requests.

**SAY:** “The browser calls Express; it never connects straight to MongoDB. Routes and middleware pass requests to controllers, services apply rules, and models read or write data.”

This is a **modular monolith**: one main Express app divided into feature modules. The Python risk endpoint is separate. There is no full microservices or Kubernetes setup in the repo.

## 3. Frontend → backend → database

1. User clicks or submits a form in a static HTML page.
2. Page JavaScript calls `CampusAPI` in `frontend/js/api.js`.
3. `apiRequest()` adds JSON headers and a Bearer token from `sessionStorage` when available.
4. Express route runs authentication/role middleware if configured.
5. Controller checks request and calls a service.
6. Service works with a Mongoose model or an external service.
7. API returns JSON; frontend updates the page or shows an error.

**OPEN:** `frontend/js/api.js` — `apiRequest()`; backend example `job.routes.js` → `matching.controller.js` → `matching.service.js` → `matching.engine.js`.

**SAY:** “For matching, the page asks the API to score candidates. The backend loads job and profile data, applies the matching rules, and returns the breakdown for the UI.”

**Failure:** Network/CORS errors become a frontend network error. API errors use a JSON error shape. Unhandled errors go to the handler in `backend/src/app.js`.

## 4. Authentication

### Registration

Registration accepts student/recruiter roles, checks fields, hashes the password, stores an OTP challenge, and sends email. Correct OTP verification creates the account. It does not log the user in; login is separate. User schema also allows `placement`, but public OTP registration does not.

**OPEN:** `backend/src/routes/auth.routes.js` — `/register`, `/register/verify-otp`; `backend/src/controllers/auth.controller.js` — `startRegistration()`, `verifyOtp()`; `backend/src/services/auth.otp.service.js` — same-named service functions.

**SHOW:** `startRegistration()` validates and sends challenge; `verifyOtp()` verifies and creates `User`.

### Login and JWT

JWT is a signed token, not an encrypted message. On login, `loginUser()` checks email/password, rejects inactive users, then signs `{id, role}` with `JWT_SECRET`. Expiration is `JWT_EXPIRES_IN`, default seven days. The frontend saves token and user in tab-scoped `sessionStorage`. Requests send `Authorization: Bearer ...`. `protect()` verifies the token, loads current User from MongoDB, checks active status, and sets `req.user`.

**OPEN:** `backend/src/services/auth.service.js` — `loginUser()`; `frontend/js/auth.js` — `handleLoginSuccess()`, `logout()`; `frontend/js/api.js` — `getToken()`, `apiRequest()`; `backend/src/middleware/auth.middleware.js` — `protect()`.

**SHOW:** Token signing → storage → request header → `jwt.verify()` → DB user lookup.

**SAY:** “After login, the backend signs a token with the user ID and role. The browser sends it on API calls. Middleware checks the signature and loads the current user before continuing.”

**Judge asks:** Is JWT encrypted? **A:** “No, it is signed. The payload can be read, but changing it makes signature verification fail.”

What if stolen? **A:** “A stolen token can be used until expiry unless the account is disabled or the secret changes. No blacklist or refresh-token rotation was found.”

Does logout revoke it? **A:** “No. Logout clears session storage and redirects; it does not revoke the server token.” Password reset also does not explicitly revoke existing tokens.

### Password hashing

**OPEN:** `backend/src/services/auth.service.js` — `hashPassword()`, `loginUser()`.

**SHOW:** bcrypt salt rounds 10, `bcrypt.hash()` and `bcrypt.compare()`.

**SAY:** “We save a one-way password hash, not the password. At login, bcrypt checks the entered password against that hash.” The OTP service minimum is eight characters; a stronger composition rule is **NOT CONFIRMED — VERIFY IN CODE**.

### OTP

**OPEN:** `backend/src/services/auth.otp.service.js` — `createOtp()`, `hashOtp()`, `secureMatch()`, `verifyOtp()`, `sendChallenge()`; `backend/src/models/AuthOtpChallenge.js`.

**SHOW:** Six digits from `crypto.randomInt`; HMAC-SHA256 hash keyed by `JWT_SECRET`; timing-safe comparison; five-minute code expiry, 60-second resend cooldown, maximum five wrong attempts; challenge stored in MongoDB; email sent via `email.service.js`.

**SAY:** “The code is random, short-lived, and we store a keyed hash instead of the raw code.” Rate-limit buckets are a process-local Map; they reset on restart and are not shared across multiple servers.

### Forgot password

**OPEN:** `backend/src/routes/auth.routes.js` — `/password/forgot`, `/password/reset`; `backend/src/services/auth.otp.service.js` — `startPasswordReset()`, `finishPasswordReset()`.

**SHOW:** OTP challenge → verification → bcrypt new password → update User.

**SAY:** “Email OTP authorizes the reset. The new password is hashed. Existing JWTs are not explicitly revoked.”

### Roles and ownership

**OPEN:** `backend/src/middleware/auth.middleware.js` — `protect()`, `authorize()`; example `backend/src/controllers/student.controller.js` — `uploadResume()`.

**SHOW:** Role allow-list and an owner ID comparison.

**SAY:** “The backend checks the user's role and, where needed, that they own the record. Hiding a button in the browser is not the security boundary.” A full access-control audit is **NOT CONFIRMED — VERIFY IN CODE**.

## 5. MongoDB and Mongoose

MongoDB stores document records. Mongoose defines field types, validation, references, and indexes.

**OPEN:** `backend/src/config/db.js` — `connectDB()`; model files in `backend/src/models/`.

**SHOW:** `mongoose.connect(MONGODB_URI)`, schemas, refs, unique indexes.

**SAY:** “MongoDB holds the placement data; Mongoose gives the Node backend schemas and database helpers.” No measured comparison with SQL is confirmed.

Key models: `User`, `Student`, `Recruiter`, `Job`, `Application`, `Drive`, `Offer`, `Notification`, `AuthOtpChallenge`, `AssessmentAttempt`, `MockInterview`. `Application` has a unique student/job index; `Offer` has a unique application index. Mongo refs are not SQL foreign keys; services also enforce business rules.

**Judge asks: How are User and Student connected?** Student has a unique ObjectId `userId` ref to User. Account/auth information and placement profile are separate documents.

## 6. Resume upload, Cloudinary, parsing, and AI

### Resume upload

**Flow:** `frontend/js/student.js` builds multipart form data → `POST /api/students/:id/resume` → `protect` and `resumeUpload` → controller checks owner and file → Cloudinary → Student document stores metadata → analysis runs.

**OPEN:** `backend/src/routes/student.routes.js` — resume route; `backend/src/middleware/upload.middleware.js` — `resumeUpload`; `backend/src/controllers/student.controller.js` — `uploadResume()`.

**SHOW:** File type/size filter, file signature check, owner check, upload, saved metadata.

**SAY:** “The backend checks the file and verifies the student owns the profile. It stores the asset privately and saves metadata in the Student record.”

Resume/document types include PDF and supported image types; default maximum is 5MB from `MAX_FILE_SIZE`. Profile pictures have a 2MB cap. File signature checks are selected checks, not a virus scanner.

### Cloudinary

**OPEN:** `backend/src/services/cloudinary.service.js` — `configured()`, `uploadBuffer()`, `privateDownloadUrl()`, `downloadAsset()`.

**SHOW:** Environment credentials, authenticated upload mode, short-lived private download URL.

**SAY:** “Cloudinary is the configured file-storage adapter. The app retrieves files through protected backend routes.” Its comparative cost/performance rationale is **NOT CONFIRMED — VERIFY IN CODE**.

**What if Cloudinary fails?** Missing config causes a 503; failed upload/download makes the file action fail. Legacy local-file support exists for old records.

### Resume parsing and Groq

**OPEN:** `backend/src/controllers/student.controller.js` — `analyzeResumeBuffer()`, `extractResumeTextWithFallback()`; `backend/src/services/pdf.service.js` — `extractText()`, `renderPdfPages()`; `backend/src/services/ai.service.js` — `parseResumeText()`; `backend/src/services/ai/groq.adapter.js` — `callGroq()`.

**SHOW:** PDF text extraction or scanned page rendering → prompt to Groq → JSON response → validation → profile update. Adapter uses timeout and bounded retries. Provider selector currently supports Groq only.

**SAY:** “The LLM reads the resume text and returns structured fields. It does not write to MongoDB directly; the backend validates and applies the result.”

**What if Groq fails?** Configuration, timeout, provider, rate-limit and empty response errors are returned. Uploaded file can remain saved and analysis can be retried through `POST /api/students/:id/resume/analyze`.

### AI output validation

**OPEN:** `backend/src/validators/resumeSchema.validator.js` — `validateResumeOutput()`; `backend/src/validators/jdSchema.validator.js` — `validateJdOutput()`.

**SHOW:** Parsed fields are checked for expected structure and constraints before updating a profile or job.

**SAY:** “Validation catches malformed output, but cannot prove the facts are true. A plausible false extraction still needs human correction.” If JSON is invalid, parsing or validation fails; retries are limited, not infinite.

## 7. Jobs, eligibility, matching, and explanations

### Job creation

**OPEN:** `backend/src/routes/job.routes.js` — `POST /`; `backend/src/controllers/job.controller.js` — `createJob()`; `backend/src/services/job.service.js` — `createJob()`.

**SHOW:** Authenticated recruiter route, role/owner checks, saved Job record.

**SAY:** “Recruiters create structured jobs; the backend stores the title, description and requirements.”

### JD analysis

**OPEN:** `backend/src/routes/job.routes.js` — `POST /:id/analyze`; `backend/src/controllers/job.controller.js` — `analyzeJob()`; `backend/src/services/ai.service.js` — `parseJobDescription()`.

**SHOW:** Saved title and description go to Groq; validated result is normalized and saved while preserving manual branch/CGPA/backlog settings.

**Important:** There is no `/api/jobs/upload-jd` route in the actual router, though docs mention it. Do not claim JD PDF upload is implemented.

### Eligibility

**OPEN:** `backend/src/services/matching/matching.engine.js` — `checkEligibility()`.

**SHOW:** Minimum CGPA, maximum backlog, eligible branch checks. Missing required CGPA/branch fails when the job set that requirement.

**SAY:** “Eligibility is a separate backend gate. An LLM does not decide eligibility.”

### Matching formula

**OPEN:** `backend/src/services/matching/matching.engine.js` — `computeSkillMatch()`, `computeProjectRelevance()`, `computeAcademicFit()`, `computeEvidenceCoverage()`, `matchStudentToJob()`.

```text
50% Skill Match
20% Project Relevance
20% Academic Fit
10% Evidence Coverage
```

- Skill match uses required and preferred skills. Required coverage is 70% of this subscore; preferred is 30%.
- Project relevance checks job-required skills against project technologies. No required skills gives a neutral 50.
- Academic fit uses CGPA and backlog fit.
- Evidence coverage gives 25 points each for skills, projects, resume, and CGPA.

Eligibility is separate from this score. Categories: Strong ≥75, Moderate ≥50, else Weak. Scores use exact normalized skill matches; the semantic component is unavailable.

**SAY:** “The score uses visible profile evidence and fixed backend weights, so it can be repeated. These are prototype weights, not scientifically validated outcomes.”

**Mismatch:** Old AI Rules and Job schema weights say something else and include semantics. The engine uses 50/20/20/10. It returns semantic similarity as null/unavailable. Use code truth.

### Project, academic, evidence, explanation

Open the component functions above. Project relevance looks for required technologies in projects. Academic fit compares academic data with the role requirement. Evidence coverage measures four fields are present; it does not measure their truth or quality.

**OPEN:** same engine — `explainMatch()`.

**SHOW:** Output facts for matching/missing skills, academic requirements, project evidence, and evidence coverage.

**SAY:** “The explanation shows which measurable profile facts contributed. It is generated by backend rules, not an LLM picking candidates.”

## 8. Readiness and skill gaps

### Readiness formula

**OPEN:** `backend/src/services/readiness/readiness.engine.js` — `calculateReadiness()`; `backend/src/services/readiness/readiness.service.js` — `calculateAndPersistReadiness()`; `backend/src/controllers/readiness.controller.js` — `analyzeReadiness()`.

```text
30% Technical Skills | 20% Projects | 20% Academic
15% Assessment       | 15% Interview
```

If assessment or interview data is missing, code leaves that component out and scales the other available components to total 100%. Categories: <50 Not Ready; 50–69 Developing; 70–84 Ready; 85+ Highly Employable.

**SAY:** “Readiness is a deterministic snapshot based on profile data. It is a prototype score, not a scientifically validated prediction of employability.”

Technical score uses a skill-domain map; project score uses simple signals like technologies, description length, and role; academic score uses CGPA/backlog bands and hard-codes trend as 100. These assumptions can change the score.

### Skill gaps

**OPEN:** `backend/src/services/readiness/readiness.engine.js` — `detectSkillGaps()`; `backend/src/services/readiness/skill.domain.js` — `normalizeSkill()`.

**SHOW:** Fixed baseline of DSA, Database/SQL, Git and alias normalization.

**SAY:** “The readiness gap list checks a small baseline. It is not a fully personalized AI curriculum.” Matching separately computes job-specific gaps.

## 9. Assessment and mock interview

### Assessment

**OPEN:** `backend/src/routes/careerPractice.routes.js`; `backend/src/services/careerPractice.service.js` — `startAssessment()`, `validateAssessmentAnswers()`, `calculateAssessmentScores()`, `submitAssessment()`; `backend/src/services/assessment.catalog.js` — `selectQuestions()`.

**SHOW:** Student-only routes; question IDs saved in `AssessmentAttempt`; server requires answers to all ten questions and checks them against the catalog. Timer is 15 minutes. Scoring is technical/aptitude with overall 70/30. Completion refreshes readiness.

**SAY:** “The browser submits answers, but the backend checks correctness and calculates the score.”

### Mock interview

**OPEN:** `backend/src/services/careerPractice.service.js` — `makeInterviewQuestions()`, `submitInterview()`; `backend/src/services/mockInterview.evaluation.service.js` — `evaluateInterview()`, `calculateInterviewScore()`.

**SHOW:** Five template questions use target role/profile; answers are length-checked; AI evaluation can call Groq; result is saved and readiness refreshed.

**SAY:** “Question creation is template-based. The evaluation can use an LLM, so it is practice feedback, not a hiring decision.” If AI fails, attempt is marked `evaluation_failed` and can be retried.

## 10. Applications, drives, offers, documents, notifications

### Applications

**OPEN:** `backend/src/controllers/application.controller.js` — `createApplication()`; `backend/src/services/application.service.js` — `createApplication()`, `updateApplicationStatus()`; `backend/src/models/Application.js` — unique index.

**SHOW:** Service-level workflow checks and unique `(studentId, jobId)` index. The index also prevents a concurrent duplicate.

**SAY:** “Applications are saved in MongoDB. A database constraint is the final duplicate guard; we do not rely only on disabling the button.”

### Drives and conflicts

**OPEN:** `backend/src/controllers/drive.controller.js` — `createDrive()`, `checkConflicts()`; `backend/src/services/scheduling/scheduling.engine.js` — `validateDriveSchedule()`, `overlaps()`, `getOverlap()`; `scheduling.service.js` — `checkDriveConflicts()`.

**SHOW:** Date and `HH:mm` checks, end-after-start rule, same-date interval overlap. If one ends exactly when another starts, they do not overlap.

**SAY:** “Conflict detection is deterministic time math, not AI.” For a specific action, show controller behavior to explain whether it blocks or reports a conflict.

### Offers and state transitions

**OPEN:** `backend/src/services/offer.transitions.js` — `transitions`, `canTransition()`; `backend/src/services/offer.service.js` — `updateStatus()`.

**SHOW:** Allowed sequence e.g. Selected → Offer Generated → Offer Sent → Accepted/Declined → documentation/joining stages. Offer schema uses optimistic concurrency.

**SAY:** “The service checks whether a transition is allowed before it saves a new status.”

### Documents

**OPEN:** `backend/src/routes/offer.routes.js`; `backend/src/services/offer.service.js` — `submitDocument()`, `extractPlacementDocumentForVerification()`, `evaluatePlacementDocument()`, `reviewDocument()`.

**SHOW:** Upload, extraction/checks, verification status and review. AI extracts facts; code evaluates them; human review states exist. Do not claim every document is automatically or perfectly verified.

### Notifications

**OPEN:** `backend/src/services/notification.service.js` — `notify()`; `backend/src/controllers/notification.controller.js` — `list()`, `markRead()`, `markAllRead()`.

**SHOW:** Notification record stored and read-state updated.

**SAY:** “These are stored notifications shown in the app. Push delivery is not confirmed.”

## 11. Analytics and Python risk service

**OPEN:** `backend/src/controllers/analytics.controller.js` — `placement()`, `risk()`; `backend/src/services/analytics/placement.analytics.service.js` — `getPlacementAnalytics()`; `backend/src/services/analytics/placement.risk.service.js` — `getPlacementRisk()`; `ml-service/app.py` — `_risk_for_student()`, `predict_risk()`.

Placement analytics summarizes MongoDB data. Node builds student features and sends them to Python. Python computes a fixed weighted risk score and LOW/MEDIUM/HIGH label. `MinMaxScaler` is fit on 0–100 endpoints and adds no learned behavior.

**SAY:** “The repository calls this the ML service, but the implementation is a transparent heuristic. There is no trained model, training dataset, saved model artifact, or accuracy result here.”

**If Python fails:** Node aborts after eight seconds. The route returns 503 for unavailable service or 502 for upstream/invalid response. The risk view is then unavailable.

## 12. Security and errors

**Implemented controls:** bcrypt password hashes; JWT verification; active-user, role and selected ownership checks; OTP expiry/attempt/cooldown; Multer size/type filtering; selected signature validation; private Cloudinary assets; structured error handler.

**OPEN:** `backend/src/app.js` — error handler; `backend/src/middleware/auth.middleware.js`; `backend/src/middleware/upload.middleware.js`.

**SHOW:** Error mapping (validation/cast → 400, duplicate key → 409, otherwise 500), token check, upload filters.

No general API rate limiter, malware scanner, full security audit, or compliance certification was confirmed. OTP buckets are process-local. Browser token is in `sessionStorage`, readable by page JavaScript. Logout does not revoke JWT.

**What happens:** invalid JWT → 401; valid token with wrong role/ownership → 403; MongoDB fails at startup → process exits; SMTP send fails → challenge is deleted and request errors; Cloudinary config missing → 503; invalid LLM JSON/schema → analysis fails after bounded attempts.

## 13. Why these technologies?

Give honest implementation-based answers; comparative benchmarks are not confirmed.

| Why? | Answer |
|---|---|
| Node.js | Backend uses JavaScript, alongside browser JS. A benchmark is not confirmed. |
| Express | It handles API routes and middleware in this project. |
| MongoDB | It stores profile and workflow documents. No SQL comparison benchmark is confirmed. |
| Mongoose | It adds schemas, validation, refs and indexes on MongoDB. |
| JWT | Current protected API uses Bearer tokens. JWT is not always better than sessions. |
| bcrypt | Lets us verify passwords without storing plain text. |
| Nodemailer | Sends OTP through environment-configured SMTP. Mail vendor is not fixed. |
| Cloudinary | The implemented adapter stores authenticated assets. A cost/performance comparison is not confirmed. |
| Groq | It is the currently implemented LLM adapter. Rationale beyond configuration is not confirmed. |
| Python/Flask | The risk endpoint is separated and implemented in Python. It currently computes a heuristic. |
| Deterministic matching | Explicit rules are repeatable and inspectable; LLM does not set final score. |
| Vanilla JS | Actual frontend has no framework/build step. Do not invent a tested performance reason. |
| No microservices/Kubernetes | The project is mostly one Express app; no measured need or Kubernetes config is present. |

## 14. External-service failures

| Service/failure | What code does |
|---|---|
| MongoDB | `server.js` waits for `connectDB()`. Missing URI or connection failure exits before listening. |
| Groq | Adapter checks provider/key/model, uses timeout and bounded retry. AI-dependent action returns an error. |
| Cloudinary | Missing config throws 503; failed upload/download makes file operation fail. Old local files have fallback handling. |
| SMTP | OTP email failure returns error and challenge is deleted. Email verification cannot continue until it works. |
| Python risk service | Node calls configured URL, times out at eight seconds, returns 503/502 on failure/bad output. |
| Invalid AI JSON | Parse/validation fails; output is not stored as if valid. |
| Invalid JWT | `protect()` returns 401. |
| Scheduling overlap | Conflict service reports overlap; rule compares date and interval. |

## 15. Deployment and scalability

**OPEN:** `backend/server.js` — `start()`; `backend/src/config/db.js` — `connectDB()`; `frontend/js/api.js` — `API_BASE`.

Backend uses `PORT` or 5000 and needs `MONGODB_URI`. Frontend uses a hardcoded Render API URL outside localhost and CORS includes a Render frontend origin. These settings do not prove a live deployment. Do not claim verified uptime or production readiness.

**If asked about 100,000 students:** “We have no benchmark proving that scale. I would measure queries and external calls, add pagination/indexes, move slow AI calls to a queue, run stateless API instances, and design tenant isolation before serving multiple colleges.” Do not claim current queue, tenant isolation, high availability, or Kubernetes.

## 16. Honest limitations

- Matching/readiness weights are prototype heuristics, not validated outcome predictions.
- Semantic embeddings are described in docs but not implemented.
- Risk service is a weighted formula, not a trained ML model.
- No accuracy, load, or latency metrics are reported.
- LLM extraction can be wrong; schema validation checks structure, not truth.
- Readiness gaps use a small fixed baseline list.
- Public OTP registration accepts student/recruiter, not placement.
- JD PDF upload is described in docs but absent from the job route.
- OTP rate limiting is process-local; no general API limiter was found.
- Malware scanning, tenant isolation, formal fairness audit, and formal appeal process are not confirmed.
- Live deployment is not verified by the repository.

## 17. Tough judge questions

**Why should we trust your AI?** “Treat it as draft extraction or practice feedback, not unquestionable truth. Backend validation checks structure; a person should review important facts.”

**Does AI make final placement decisions?** “No. Eligibility and matching are backend rules; recruiters and placement staff decide.”

**Is readiness scientifically validated?** “No. It is a weighted prototype score. We need outcome data and fairness checks before calling it validated.”

**Is your risk system really ML?** “The code is a weighted heuristic. There is no trained model or evaluation, so I would not claim a trained ML predictor.”

**What if the LLM hallucinates?** “A plausible false fact can pass schema validation. Users or staff must review extracted fields.”

**What if the AI provider is down?** “AI-dependent calls fail after bounded retries/timeouts. Workflows that do not need AI can still run.”

**What if a JWT is stolen?** “It can be used until expiry unless the user is disabled or secret changes. There is no blacklist or refresh rotation.”

**Can users access another student's data?** “Some routes check role and ownership. I would show the exact handler; a full access-control audit is not confirmed.”

**How prevent duplicate applications?** “Service checks plus a unique database index on student/job, including concurrent attempts.”

**How detect scheduling conflict?** “Backend validates times and checks same-day interval overlap.”

**Why not microservices or Kubernetes?** “Most features are modules in one Express app. The repository has no Kubernetes setup and no measured reason to split more services.”

**How scale to 100,000?** “Not benchmarked. Measure first, paginate/index, queue slow calls, scale stateless API, and establish tenant isolation.”

**Biggest weakness?** “The scores are unvalidated heuristics, and the risk endpoint is not a trained model. I would validate before using scores for important decisions.”

**What next?** “Review access controls, evaluate scoring with representative data, document fairness limits, and improve monitoring/background processing.”

## 18. MOCK JUDGE MODE

Practice in eight rounds. Ask yourself **one question at a time** and hide the answer until you respond:

1. Basic project questions.
2. Explain a feature's flow.
3. Show the exact code.
4. Why use this technology?
5. What happens if it fails?
6. Security questions.
7. Architecture and scale.
8. Tough cross-questioning.

After each answer, check: what was right; what was missed; what is the ideal simple answer; which exact file/function proves it; did I admit limits? Then ask the next question. Understand what happens, where it happens, why, and what happens on failure—do not memorize jargon.

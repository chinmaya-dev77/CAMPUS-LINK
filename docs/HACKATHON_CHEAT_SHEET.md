# CAMPUSLINK — HACKATHON JUDGE CHEAT SHEET

Quick revision. The repository is the source of truth. If a location below is marked **NOT CONFIRMED — VERIFY IN CODE**, do not claim it is implemented.

## 1. What is CampusLink?

**One line:** CampusLink helps students, recruiters, and college placement teams manage placement preparation and workflows in one web app.

**30 seconds:** “Students create profiles, upload resumes, review readiness and skill gaps, and track opportunities. Recruiters create jobs and review candidates using explicit eligibility checks and a rule-based match score. Placement teams coordinate drives, applications, offers, documents, and analytics. The app uses a vanilla JavaScript frontend, an Express API, MongoDB, optional Groq AI calls, Cloudinary storage, and a separate Python risk service. The semantic embeddings described in some design documents are not implemented, and the risk service is a heuristic, not a trained ML model.”

**Problem:** Placement information and tasks can be scattered across files and messages. CampusLink brings the student, recruiter, and placement-office workflows into one system.

## 2. Tech stack

- **HTML/CSS/vanilla JavaScript** → Renders the browser pages; there is no React build setup.
- **Node.js + Express** → Runs the backend API and business logic.
- **MongoDB + Mongoose** → Stores users, profiles, jobs, applications, drives, offers, and related records.
- **JWT + bcryptjs** → Signs login tokens and stores password hashes.
- **Groq** → Optional language-model calls for extraction and interview-related tasks.
- **Python + Flask + scikit-learn** → Serves a weighted placement-risk heuristic; it is not a trained model.
- **Cloudinary** → Stores uploaded assets as authenticated/private files when configured.
- **Nodemailer + SMTP** → Sends OTP email when configured.
- **Multer + pdf-parse** → Receives uploads and extracts text from PDFs.

## 3. Architecture

```text
Browser pages (HTML/CSS/JS)
        ↓ HTTP + Bearer token
Express API → middleware/routes → controllers → services/engines
                                                   ↓
                                                MongoDB
                                                   ↘ Groq (some AI tasks)
                                                   ↘ Cloudinary (files)
                                                   ↘ SMTP (OTP email)
                                                   ↘ Flask risk endpoint
```

In simple terms: the browser asks the API to do something. Routes send the request through authentication and input checks. Controllers handle the request, services apply the workflow rules, and Mongoose reads or writes MongoDB. Some tasks call an outside service.

## 4. Important features: open, show, say

### Registration and OTP

**Judge may ask:** “How does registration work?”

**OPEN:** `backend/src/services/auth.otp.service.js`

**FUNCTION:** `startRegistration()` then `verifyOtp()`

**SHOW:** Registration validates name/email/password/role, hashes the password, stores an OTP challenge, and sends email. Verification checks the code and only then creates the user.

**SAY:** “Registration is a two-step email check. The password is hashed before it is stored. The account is created only after the OTP is verified.”

**FOLLOW-UP:** “Does registration log the user in?” **A:** “No. OTP verification creates the account; login is a separate request.”

### Login and JWT

**OPEN:** `backend/src/services/auth.service.js` — `loginUser()`; then `backend/src/middleware/auth.middleware.js` — `protect()`.

**SHOW:** bcrypt comparison; JWT signing with user ID and role; verification; database reload of the current user.

**SAY:** “After the password matches, the backend signs a token with the user ID and role. The frontend sends that token on API calls. `protect` verifies it and loads the current user from MongoDB.”

**FOLLOW-UP:** “Is JWT encrypted?” **A:** “No. It is signed, not encrypted. Its contents can be read, but changing them breaks signature verification.”

### Password hashing

**OPEN:** `backend/src/services/auth.service.js` — `hashPassword()`.

**SHOW:** `bcrypt.genSalt(10)` and `bcrypt.hash()`.

**SAY:** “We store a bcrypt hash, not the original password. At login, bcrypt compares the submitted password with that hash.”

**FOLLOW-UP:** “Can the password be decrypted?” **A:** “No. Hashing is designed to be one-way, unlike encryption.”

### Forgot password

**OPEN:** `backend/src/services/auth.otp.service.js` — `startPasswordReset()`, `verifyOtp()`, `finishPasswordReset()`.

**SHOW:** Email challenge, verification, new bcrypt hash, user update.

**SAY:** “The user proves access to the registered email with an OTP, then the new password is hashed and saved. Existing JWTs are not explicitly revoked.”

### Roles and access checks

**OPEN:** `backend/src/middleware/auth.middleware.js` — `protect()` and `authorize()`; for record ownership, open the relevant controller.

**SHOW:** Token verification, active-account check, role list check, and the controller's ID/owner comparison.

**SAY:** “A valid login is not enough for every action. The backend checks the role and, for personal records, whether the record belongs to that user.”

### Database

**OPEN:** `backend/src/models/User.js`, `Student.js`, `Job.js`, `Application.js`, `Drive.js`, and `Offer.js`.

**SHOW:** Fields, references, unique indexes, and status enums.

**SAY:** “MongoDB stores the workflow records. Mongoose defines their fields and references. A User account and Student profile are separate records connected by `userId`.”

**FOLLOW-UP:** “Can the browser access MongoDB?” **A:** “No. Frontend requests go through the Express API.”

### Resume upload and Cloudinary

**OPEN:** `backend/src/routes/student.routes.js` — route `POST /:id/resume`; `backend/src/controllers/student.controller.js` — `uploadResume()`; `backend/src/services/cloudinary.service.js` — `uploadBuffer()`.

**SHOW:** `resumeUpload` file filter, owner check, file signature check, Cloudinary upload, profile metadata save.

**SAY:** “The upload is checked by the backend, stored as an authenticated Cloudinary asset when configured, and the database keeps file metadata and a protected retrieval route.”

**FOLLOW-UP:** “What if Cloudinary fails?” **A:** “The upload flow reports an error; it does not complete as a successful Cloudinary upload. Legacy local-file handling also exists for older records.”

### Resume AI extraction

**OPEN:** `backend/src/controllers/student.controller.js` — `uploadResume()` and `analyzeResumeBuffer()`; `backend/src/services/ai.service.js` — `parseResumeText()`; `backend/src/services/ai/groq.adapter.js` — `callGroq()`.

**SHOW:** PDF/image text extraction, prompt call, JSON parsing and validation, then profile update.

**SAY:** “The LLM extracts structured facts from resume text. The backend validates the output before applying it. A valid-looking answer can still be factually wrong, so extraction is not proof.”

**FOLLOW-UP:** “Do you use embeddings?” **A:** “No. Embedding support is described in design docs, but it is not implemented in the matching flow.”

### Job creation and JD analysis

**OPEN:** `backend/src/controllers/job.controller.js` — `createJob()` and `analyzeJob()`; `backend/src/services/job.service.js` — `createJob()`.

**SHOW:** Recruiter ownership/role checks, job save, then title/description sent to JD parser and validated.

**SAY:** “Recruiters can create structured jobs. JD analysis sends the saved title and description to the LLM and validates the extracted fields. I cannot claim a JD PDF upload route: it is not present in `job.routes.js`.”

### Eligibility and matching

**OPEN:** `backend/src/services/matching/matching.engine.js` — `checkEligibility()`, `computeSkillMatch()`, `matchStudentToJob()`.

**SHOW:** Hard eligibility conditions and separate weighted score. The LLM does not decide the result.

**SAY:** “The backend checks hard requirements first, such as CGPA, backlogs, and branch. It then calculates a separate match score from profile data.”

**FOLLOW-UP:** “Does the score determine eligibility?” **A:** “No. Eligibility is a separate pass/fail gate.”

### Readiness and skill gaps

**OPEN:** `backend/src/services/readiness/readiness.engine.js` — `calculateReadiness()` and `detectSkillGaps()`; `backend/src/services/readiness/skill.domain.js` — `calculateTechnicalSkillsScore()`.

**SHOW:** Component weights, missing-data handling, fixed gap targets.

**SAY:** “Readiness is a rule-based snapshot of skills, projects, academics, assessment, and interview evidence. Its weights are prototype choices, not scientifically validated employment predictions.”

### Assessment and mock interview

**OPEN:** `backend/src/services/careerPractice.service.js` — `calculateAssessmentScores()`, `makeInterviewQuestions()`, `submitInterview()`; for LLM scoring: `backend/src/services/mockInterview.evaluation.service.js` — `evaluateInterview()`.

**SHOW:** Assessment answers are checked against a question catalog on the server. Interview questions are templates that use target role/profile data; evaluation can use the configured LLM.

**SAY:** “The assessment score is calculated in backend code. The mock interview uses fixed question templates and an AI evaluation path when the provider is configured.”

### Applications

**OPEN:** `backend/src/controllers/application.controller.js` — `createApplication()`; `backend/src/services/application.service.js` — `createApplication()`; `backend/src/models/Application.js` — unique index.

**SHOW:** Application checks and unique `(studentId, jobId)` index.

**SAY:** “The service checks the application workflow, and the database unique index prevents two simultaneous duplicate applications for the same student and job.”

### Drives and conflict detection

**OPEN:** `backend/src/controllers/drive.controller.js` — `createDrive()` / `checkConflicts()`; `backend/src/services/scheduling/scheduling.engine.js` — `overlaps()`; `scheduling.service.js` — `checkDriveConflicts()`.

**SHOW:** Date/time validation and same-day interval overlap. If one drive ends exactly when the next begins, they do not overlap.

### Offers and documents

**OPEN:** `backend/src/services/offer.transitions.js` — `canTransition()`; `backend/src/services/offer.service.js` — `updateStatus()`, `submitDocument()`, `evaluatePlacementDocument()`, `reviewDocument()`.

**SHOW:** Allowed offer transitions and document review status. Document extraction may use AI; extraction does not itself guarantee correctness.

### Notifications

**OPEN:** `backend/src/services/notification.service.js` — `notify()`; `backend/src/controllers/notification.controller.js` — `list()`, `markRead()`, `markAllRead()`.

**SHOW:** Notification record creation and read-state update. These are stored notifications; do not claim push notification delivery.

### Analytics and risk service

**OPEN:** `backend/src/services/analytics/placement.analytics.service.js` — `getPlacementAnalytics()`; `placement.risk.service.js` — `getPlacementRisk()`; `ml-service/app.py` — `_risk_for_student()` and `predict_risk()`.

**SHOW:** Mongo-backed aggregates; Node sends risk features to Flask; Python computes weighted heuristic outputs.

**SAY:** “The Python endpoint is called an ML service in the project, but the current code uses a fixed weighted formula. It has no trained model or reported accuracy.”

### Security and error handling

**OPEN:** `backend/src/middleware/upload.middleware.js` — Multer filters; `backend/src/app.js` — CORS and error handler; `auth.middleware.js` — `protect()`.

**SHOW:** Upload limits/types, centralized JSON errors, token verification.

**SAY:** “There are useful checks, but I would not claim a full security audit, malware scanning, or a general API rate limiter based on this repository.”

### Deployment

**OPEN:** `backend/server.js` — `start()`; `backend/src/config/db.js` — `connectDB()`; `frontend/js/api.js` — `API_BASE`.

**SHOW:** Environment-based database connection, port, and frontend API URL. The frontend contains a Render URL, but that alone does not prove the deployment is live.

## 5. Important formulas

### Matching

- **50% Skill Match:** required and preferred skill coverage. Required coverage counts 70% of this part; preferred coverage counts 30%.
- **20% Project Relevance:** checks how many required job skills appear in the student's project technologies.
- **20% Academic Fit:** CGPA and backlog values compared with job requirements.
- **10% Evidence Coverage:** 25 points each for profile skills, projects, uploaded resume, and CGPA.

Eligibility is checked separately. Semantic similarity is unavailable. `Job.matchingWeights` and older docs show different weights; use the engine formula above.

### Readiness

- 30% Technical Skills
- 20% Projects
- 20% Academic
- 15% Assessment
- 15% Interview

If assessment or interview data is missing, that component is left out and the remaining available weights are scaled to make the total 100%. The academic score currently assumes academic trend is 100; disclose this simplification.

## 6. AI or backend rules?

| Feature | Who handles it | Simple reason |
|---|---|---|
| Resume/JD fact extraction | LLM + backend validation | LLM reads unstructured text; backend checks fields before saving. |
| Eligibility | Backend rules | Must follow explicit job requirements. |
| Match score/rank | Backend rules | Same inputs should give a repeatable score. |
| Readiness | Backend rules | Weighted formula, not LLM judgment. |
| Schedule conflicts | Backend rules | Date/time overlap is exact. |
| Offer transitions | Backend rules | Only allowed workflow changes are accepted. |
| Risk indicator | Python weighted heuristic | Current code has no trained predictor. |
| Mock interview feedback | LLM path | Evaluates free-text answers; may be wrong. |

## 7. Things I should NOT falsely claim

- Do not say semantic embeddings are currently working.
- Do not claim a trained ML model or an accuracy number.
- Do not say readiness or matching weights were scientifically validated.
- Do not say AI makes final placement decisions.
- Do not say a schema validator proves extracted facts are true.
- Do not claim logout or password reset revokes existing JWTs.
- Do not claim uploads are malware-scanned.
- Do not claim notifications are pushed to phones/email.
- Do not claim JD PDF upload exists: no such route appears in the job router.
- Do not claim multi-tenant isolation or 100,000-user scale has been proven.
- Do not call deployment live based only on a hardcoded URL.
- Do not claim formal fairness audits or appeal flow unless separately verified.

## 8. Last-minute revision: question → file → function

| Judge asks | Open | Function |
|---|---|---|
| Where is JWT signed? | `backend/src/services/auth.service.js` | `loginUser()` |
| Where is JWT verified? | `backend/src/middleware/auth.middleware.js` | `protect()` |
| Where is password hashed? | `backend/src/services/auth.service.js` | `hashPassword()` |
| Where is OTP made/hashed/checked? | `backend/src/services/auth.otp.service.js` | `createOtp()`, `hashOtp()`, `verifyOtp()` |
| Where are roles checked? | `backend/src/middleware/auth.middleware.js` | `authorize()` |
| Where is resume uploaded? | `backend/src/controllers/student.controller.js` | `uploadResume()` |
| Where is Cloudinary called? | `backend/src/services/cloudinary.service.js` | `uploadBuffer()` |
| Where is resume parsed? | `backend/src/services/ai.service.js` | `parseResumeText()` |
| Where does Groq HTTP call happen? | `backend/src/services/ai/groq.adapter.js` | `callGroq()` |
| Where is resume output validated? | `backend/src/validators/resumeSchema.validator.js` | `validateResumeOutput()` |
| Where is JD output validated? | `backend/src/validators/jdSchema.validator.js` | `validateJdOutput()` |
| Where is eligibility checked? | `backend/src/services/matching/matching.engine.js` | `checkEligibility()` |
| Where is match score made? | `backend/src/services/matching/matching.engine.js` | `matchStudentToJob()` |
| Where is readiness made? | `backend/src/services/readiness/readiness.engine.js` | `calculateReadiness()` |
| Where are assessment points calculated? | `backend/src/services/careerPractice.service.js` | `calculateAssessmentScores()` |
| Where are interview answers evaluated? | `backend/src/services/mockInterview.evaluation.service.js` | `evaluateInterview()` |
| Where is an application created? | `backend/src/services/application.service.js` | `createApplication()` |
| Where is interval overlap checked? | `backend/src/services/scheduling/scheduling.engine.js` | `overlaps()` |
| Where are offer steps checked? | `backend/src/services/offer.transitions.js` | `canTransition()` |
| Where are notifications stored? | `backend/src/services/notification.service.js` | `notify()` |
| Where are placement stats made? | `backend/src/services/analytics/placement.analytics.service.js` | `getPlacementAnalytics()` |
| Where is risk calculated? | `ml-service/app.py` | `_risk_for_student()` |

> Final rule: explain the feature in plain language, open the named function, and point to the code that proves what you just said.

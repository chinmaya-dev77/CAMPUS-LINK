# CampusLink — Implementation Plan

**Project:** CampusLink — AI-Powered Campus-to-Corporate Placement Intelligence & Management Platform  
**Version:** 1.1  
**Status:** Implementation Ready  
**Architecture:** Modular Monolith  
**Frontend:** HTML + CSS + Vanilla JavaScript  
**Backend:** Node.js + Express  
**Database:** MongoDB + Mongoose  
**AI:** Provider-neutral LLM + Embeddings  
**ML:** Python + Scikit-learn  

---

# 1. Purpose

This document converts the CampusLink PRD, system architecture, database schema, API specification, and AI rules into an executable development plan.

The objective is to ensure that the team does not start building disconnected features.

Development should follow the actual CampusLink workflow:

```text
Foundation
     ↓
Student Profile
     ↓
Resume → Profile → Readiness
     ↓
Recruiter → JD → Eligibility → Matching
     ↓
Drive → Shortlisting → Conflict Detection
     ↓
Applications
     ↓
Offers → Documents → Joining
     ↓
Analytics
     ↓
Demo Polish
```

The system should be developed as a sequence of working vertical slices.

---

# 2. Core Implementation Principle

CampusLink will not be built as:

```text
Backend first
      ↓
Frontend later
      ↓
AI at the end
```

Instead, development will follow:

```text
Feature
   ↓
Backend API
   ↓
Database
   ↓
AI/ML if required
   ↓
Frontend
   ↓
Integration
   ↓
Test
```

Every major milestone should produce something demonstrable.

The frontend should remain lightweight and should consume the REST APIs rather than containing core business logic.

---

# 3. Final Project Structure

Recommended repository:

```text
CAMPUSLINK/
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── API_SPEC.md
│   ├── AI_RULES.md
│   └── IMPLEMENTATION_PLAN.md
│
├── frontend/
│   ├── index.html
│   ├── student.html
│   ├── recruiter.html
│   ├── placement.html
│   │
│   ├── css/
│   │   ├── style.css
│   │   ├── dashboard.css
│   │   ├── forms.css
│   │   └── tables.css
│   │
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── student.js
│   │   ├── recruiter.js
│   │   ├── placement.js
│   │   ├── matching.js
│   │   ├── analytics.js
│   │   └── utils.js
│   │
│   └── assets/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── ai/
│   │   │   ├── matching/
│   │   │   ├── readiness/
│   │   │   ├── scheduling/
│   │   │   ├── offers/
│   │   │   └── analytics/
│   │   ├── utils/
│   │   ├── validators/
│   │   └── app.js
│   │
│   ├── uploads/
│   ├── tests/
│   └── package.json
│
├── ml-service/
│   ├── app.py
│   ├── models/
│   ├── services/
│   ├── schemas/
│   ├── training/
│   ├── requirements.txt
│   └── tests/
│
├── data/
│   ├── students.json
│   ├── recruiters.json
│   ├── jobs.json
│   ├── drives.json
│   └── seed.js
│
├── .env.example
├── .gitignore
└── README.md
```

The frontend intentionally uses static HTML pages, shared CSS, and modular JavaScript instead of a frontend framework.

---

# 4. Development Phases

The project will be implemented in the following phases:

| Phase | Objective | Priority |
|---|---|---|
| Phase 0 | Project foundation | Critical |
| Phase 1 | Authentication & roles | Critical |
| Phase 2 | Student profile | Critical |
| Phase 3 | Resume AI pipeline | Critical |
| Phase 4 | Readiness & skill gaps | Critical |
| Phase 5 | Recruiter + job creation | Critical |
| Phase 6 | JD AI pipeline | Critical |
| Phase 7 | Candidate matching | Critical |
| Phase 8 | Applications & drives | Critical |
| Phase 9 | Conflict-aware scheduling | Critical |
| Phase 10 | Offer tracking | Critical |
| Phase 11 | Analytics dashboard | Critical |
| Phase 12 | Notifications | Important |
| Phase 13 | ML risk prediction | Important |
| Phase 14 | UI polish & demo | Critical |
| Phase 15 | Testing & deployment | Critical |

---

# 5. Phase 0 — Project Foundation

## Objective

Create the basic application infrastructure before implementing business features.

### Backend

Initialize:

```bash
mkdir campuslink
cd campuslink

mkdir backend frontend ml-service data docs
```

Initialize Node project:

```bash
cd backend
npm init -y
```

Install initial dependencies as required:

```text
express
mongoose
cors
dotenv
cookie-parser
multer
```

Additional dependencies should be added only when their functionality is actually required.

### Frontend

Create the lightweight frontend structure:

```text
frontend/
├── index.html
├── student.html
├── recruiter.html
├── placement.html
├── css/
└── js/
```

No frontend framework is required.

The frontend should communicate with the backend using:

```text
fetch()
   ↓
REST API
   ↓
JSON response
   ↓
DOM update
```

### Database

Create MongoDB database:

```text
campuslink
```

Use Mongoose for:

```text
Schema definition
Validation
Models
Database queries
Indexes
```

### Environment

Create:

```text
.env
.env.example
```

Example:

```env
PORT=
MONGODB_URI=

AI_PROVIDER=
LLM_MODEL=
EMBEDDING_MODEL=

AI_API_KEY=

ML_SERVICE_URL=

JWT_SECRET=
```

No provider-specific implementation should be hardcoded into the application architecture.

---

# 6. Phase 1 — Authentication & Roles

## Objective

Establish the three major user types:

```text
Student
Recruiter
Placement Cell
```

User model:

```text
User
├── name
├── email
├── passwordHash
├── role
├── isActive
├── createdAt
└── updatedAt
```

Roles:

```text
STUDENT
RECRUITER
PLACEMENT
```

Implement:

```text
Register
Login
Authentication middleware
Role authorization
Logout/session handling
```

The backend must remain the source of truth for authorization.

### Frontend

Implement:

```text
Login page
Registration page
Role-based redirection
Logout
Authentication state
```

The frontend should never be trusted for authorization.

---

# 7. Phase 2 — Student Profile

## Objective

Allow students to create and manage their placement profile.

Student profile should contain:

```text
Personal information
Academic information
Skills
Projects
Certifications
Experience
Education
Resume
Readiness
Skill gaps
Placement status
```

### APIs

Implement the APIs defined in `API_SPEC.md`.

Core flow:

```text
Student Login
     ↓
Student Dashboard
     ↓
Profile
     ↓
Update Profile
```

### Frontend

Build:

```text
Student Dashboard
Student Profile
Skills Section
Projects Section
Resume Section
Readiness Section
```

Use reusable UI patterns:

```text
Cards
Forms
Tables
Badges
Buttons
Modals
Alerts
```

At this point the student dashboard should already be usable without AI.

---

# 8. Phase 3 — Resume AI Pipeline

## Objective

Convert an uploaded resume into structured student data.

Flow:

```text
PDF Upload
    ↓
Text Extraction
    ↓
LLM
    ↓
Structured JSON
    ↓
Schema Validation
    ↓
Normalization
    ↓
Student Profile
    ↓
MongoDB
```

Expected structured output:

```json
{
  "name": "",
  "email": "",
  "phone": "",
  "education": [],
  "skills": [],
  "projects": [],
  "certifications": [],
  "experience": []
}
```

## Important Rule

The LLM must not directly modify arbitrary database fields.

Use:

```text
LLM output
    ↓
Validation
    ↓
Normalization
    ↓
Database update
```

### AI Provider Abstraction

The application should call something conceptually like:

```text
Application Logic
       ↓
AI Service Interface
       ↓
Provider Adapter
       ↓
Selected AI Provider
```

This allows the AI provider to be changed later.

The implementation should not depend on a single provider.

---

# 9. Phase 4 — Student Readiness

## Objective

Calculate:

```text
Readiness Score
Skill Gaps
Employability Category
```

Prototype categories:

```text
0–49     → Not Ready
50–69    → Developing
70–84    → Ready
85–100   → Highly Employable
```

Readiness components:

```text
Technical Skills     30%
Projects             20%
Academic             20%
Assessment           15%
Interview            15%
```

Formula:

```text
Readiness Score =
Technical Skills × 0.30
+ Projects × 0.20
+ Academic × 0.20
+ Assessment × 0.15
+ Interview × 0.15
```

### Skill Gap

Compare:

```text
Student Skills
       ↓
Target Skills
       ↓
Missing / Weak Skills
```

The system should produce actionable recommendations such as:

```text
Missing:
- Spring Boot
- System Design

Recommended:
- Complete Spring Boot project
- Practice system-design fundamentals
- Take backend assessment
```

Recommendations may use the LLM for explanation, but the underlying missing-skill calculation should remain deterministic.

---


## 9.1 Detailed Readiness Scoring Methodology

The readiness engine produces a deterministic score from 0–100.

```text
Readiness Score =
    Technical Skills × 0.30
  + Projects × 0.20
  + Academic × 0.20
  + Assessment × 0.15
  + Interview × 0.15
```

Readiness categories:

- 0–49: Not Ready
- 50–69: Developing
- 70–84: Ready
- 85–100: Highly Employable

All component scores must be normalized to 0–100 before the final weighted calculation.

### 9.1.1 Technical Skills — 30%

Technical readiness uses the controlled skill-domain taxonomy documented in `AI_RULES.md`.

Each domain is evaluated using skill coverage and skill level.

```text
Domain Coverage =
(number of recognized student skills / total configured domain skills) × 100
```

Initial skill-level mapping:

```text
Beginner      = 40
Intermediate  = 70
Advanced      = 90
```

Domain score:

```text
Domain Score =
    Coverage × 0.70
  + Skill Level × 0.30
```

The Technical Skills Score is derived from the applicable domain scores. The initial prototype uses equal weighting across configured domains.

Skill gaps are deterministic:

```text
Target Skills
      ↓
Normalized Student Skills
      ↓
Matched / Missing / Weak Skills
```

The LLM may extract and normalize skills, but it must not calculate the technical score or decide the final skill gaps.

### 9.1.2 Projects — 20%

Projects measure practical implementation evidence rather than project count.

```text
Projects Score =
    Relevance × 0.40
  + Technical Depth × 0.25
  + Complexity × 0.20
  + Evidence × 0.15
```

**Relevance — 40%**

Measures how closely project technologies and outcomes relate to the target role and its normalized requirements.

**Technical Depth — 25%**

Considers concrete implementation evidence such as APIs, database usage, authentication, validation, integrations, testing, AI/ML components, or deployment.

**Complexity — 20%**

Considers the breadth of the implemented system, including multiple modules, workflows, integrations, role-based access, or other substantial functionality.

**Evidence — 15%**

Considers whether the project has sufficient structured information such as title, description, technologies, role, and implementation details.

Project quantity must not produce a proportional score increase. A single substantial project may provide stronger evidence than several trivial projects.

### 9.1.3 Academic — 20%

```text
Academic Score =
    CGPA Score × 0.70
  + Backlog Score × 0.20
  + Academic Trend × 0.10
```

CGPA normalization:

```text
CGPA Score = (CGPA / 10) × 100
```

Initial backlog mapping:

```text
0 backlogs → 100
1 backlog  → 75
2 backlogs → 50
3 backlogs → 30
4+         → 15
```

Academic trend must only be calculated when historical academic data exists. The system must not invent a trend from insufficient data.

### 9.1.4 Assessment — 15%

```text
Assessment Score =
    Technical Assessment × 0.70
  + Aptitude Assessment × 0.30
```

Assessment results must be normalized to 0–100 before aggregation.

Missing assessment data must be represented as missing evidence rather than interpreted as a score of zero or as evidence of poor ability.

### 9.1.5 Interview — 15%

```text
Interview Score =
    Technical Interview × 0.60
  + Communication × 0.25
  + Behavioral × 0.15
```

Interview components must be based on explicit evaluation criteria. The LLM must not directly determine the final interview score or readiness score.

### 9.1.6 Evidence Coverage

Readiness Score and Evidence Coverage are separate metrics.

Evidence Coverage represents how much relevant information is available for evaluating the student.

Example:

```text
Readiness Score: 78
Evidence Coverage: 63%

Available:
✓ Skills
✓ Projects
✓ Academic

Missing:
⚠ Assessment
⚠ Interview
```

Missing evidence must not automatically be interpreted as poor performance.

### 9.1.7 Explainability and Recommendations

The readiness API and dashboard should expose:

- Overall readiness score.
- Readiness category.
- Component scores.
- Strong and weak skill domains.
- Missing and weak skills.
- Project evidence.
- Missing assessment/interview evidence.
- Improvement recommendations.

The backend calculates the factual results. The LLM may convert those results into natural-language explanations and recommendations, but must not alter the underlying scores or decisions.

### 9.1.8 Readiness Responsibility Boundary

```text
Resume / Profile Data
        ↓
LLM: Extract + Normalize
        ↓
Structured Student Data
        ↓
Deterministic Readiness Engine
        ↓
Component Scores
        ↓
Final Readiness Score
        ↓
Category + Skill Gaps + Evidence Coverage
        ↓
LLM: Explain + Recommend
```

The LLM is not the source of truth for readiness decisions.

### 9.1.9 Phase 4 Implementation Deliverables

Phase 4 is complete only when all of the following work together:

```text
Student Profile
      ↓
Skill Domain Scoring
      ↓
Project Scoring
      ↓
Academic Scoring
      ↓
Assessment / Interview Scoring
      ↓
Final Readiness Score
      ↓
Category
      ↓
Skill Gaps
      ↓
Explainability
      ↓
Student Dashboard
```

Required backend responsibilities:

- Readiness service.
- Deterministic scoring functions.
- Skill-domain configuration.
- Skill normalization integration.
- Skill-gap calculation.
- Readiness API endpoint(s).
- Validation and edge-case handling.
- Tests for component and final-score calculations.

Required frontend responsibilities:

- Readiness score card.
- Category badge.
- Component-score breakdown.
- Skill-domain strengths/weaknesses.
- Skill gaps.
- Evidence coverage.
- Recommendations/explanation.

Do not begin Phase 5 until the Phase 4 vertical slice is functional and tested.

# 10. Phase 5 — Recruiter & Job Creation

## Objective

Allow recruiters to create jobs using two methods.

### Method A — Manual

Recruiter enters:

```text
Job title
Description
Required skills
Preferred skills
Minimum CGPA
Maximum backlogs
Branch eligibility
Experience
Certifications
Other requirements
```

### Method B — JD Upload

```text
JD PDF
   ↓
Text extraction
   ↓
LLM
   ↓
Structured requirements
   ↓
Validation
   ↓
Job document
```

Store the parsed requirements.

Do not repeatedly parse the same JD.

---

# 11. Phase 6 — JD AI Pipeline

The structured JD should contain:

```text
Role
Skills
Preferred skills
Academic requirements
Branch requirements
Experience
Certifications
Responsibilities
Other constraints
```

Example:

```json
{
  "role": "Backend Developer",
  "requiredSkills": [
    "Java",
    "Spring Boot",
    "MongoDB"
  ],
  "minimumCGPA": 7.5,
  "branches": [
    "CSE",
    "IT"
  ]
}
```

The backend validates this information before it is used for matching.

---

# 12. Phase 7 — Candidate Matching

This is one of the most important CampusLink components.

## Matching pipeline

```text
Job
 ↓
Eligibility Filter
 ↓
Eligible Students
 ↓
Skill Matching
 ↓
Semantic Matching
 ↓
Project Relevance
 ↓
Academic Fit
 ↓
Assessment/Profile Evidence
 ↓
Weighted Score
 ↓
Ranking
 ↓
Explanation
```

---

## 12.1 Eligibility

Eligibility is deterministic.

Example:

```text
CGPA >= required CGPA
AND
backlogs <= allowed backlogs
AND
branch ∈ allowed branches
```

Students failing eligibility should not be promoted by an LLM.

---

## 12.2 Matching Score

Initial weighting:

```text
Skill Match              40%
Semantic Match           25%
Project Relevance        15%
Academic Fit             10%
Assessment/Profile       10%
```

Formula:

```text
Match Score =
Skill × 0.40
+ Semantic × 0.25
+ Project × 0.15
+ Academic × 0.10
+ Assessment × 0.10
```

The backend calculates the final score.

---

# 13. Semantic Matching

Embeddings will be used for semantic similarity.

Example:

```text
Student Project:
"Built REST APIs using Node.js and Express"

Job Requirement:
"Backend development using server-side JavaScript frameworks"
```

Keyword matching may not recognize the relationship strongly.

Embeddings can capture semantic similarity.

For the initial prototype:

```text
Student embeddings
        ↓
MongoDB
```

A dedicated vector database is not required initially for the planned dataset size.

Embedding generation should happen when:

```text
Student profile changes
OR
Job requirements change
```

Otherwise cached embeddings should be reused.

---

# 14. Explainable Matching

Every candidate recommendation should provide reasons.

Example:

```text
Match Score: 87%

Why this candidate matches:

✓ Strong Java skill match
✓ Relevant backend project
✓ CGPA exceeds requirement
✓ Required branch
✓ Good assessment performance

Skill gaps:

! Limited Spring Boot experience
! No system-design project
```

The system should avoid producing:

```text
"AI says this candidate is best."
```

Instead:

```text
"Candidate scored 87% because..."
```

This makes the recommendation inspectable.

The explanation can be generated or enhanced by the LLM, but the underlying factors must remain available from deterministic backend calculations.

---

# 15. Phase 8 — Applications & Drives

## Application lifecycle

```text
Eligible
   ↓
Applied
   ↓
Shortlisted
   ↓
Interview
   ↓
Selected / Rejected
```

Applications connect:

```text
Student
Recruiter
Job
Drive
```

---

# 16. Drive Management

Placement cell should be able to create drives.

Drive information:

```text
Company
Role
Date
Start time
End time
Venue
Mode
Interview stages
Eligible students
Shortlisted students
Selected students
Status
```

Example:

```text
TCS Backend Developer Drive

Date: 15 Oct
Time: 10:00–14:00
Venue: Lab 2
Mode: Offline
```

---

# 17. Phase 9 — Conflict-Aware Scheduling

Scheduling must be deterministic.

The system checks:

```text
Student
   ↓
Existing drives
   ↓
Date/time overlap
   ↓
Conflict
```

Example:

```text
Student: Rahul

Drive A
10:00–12:00

Drive B
11:00–13:00

→ CONFLICT
```

The dashboard should clearly show:

```text
⚠ Scheduling Conflict

Rahul has been shortlisted for:

Company A — 10:00–12:00
Company B — 11:00–13:00
```

The placement cell can then resolve the conflict.

The conflict engine should remain deterministic and should not depend on an LLM.

---

# 18. Phase 10 — Offer Tracking

Offer lifecycle:

```text
Selected
   ↓
Offer Generated
   ↓
Offer Sent
   ↓
Accepted / Declined / Pending
   ↓
Documentation Pending
   ↓
Documents Verified
   ↓
Joining Confirmed
```

Offer information:

```text
Company
Role
CTC
Student
Offer status
Joining date
Documents
```

Student dashboard:

```text
Company: XYZ
Role: Backend Developer
CTC: ₹X LPA

Status:
✓ Offer Received
✓ Accepted
○ Documents
○ Joining
```

Offer state transitions must be controlled by backend business rules.

---

# 19. Phase 11 — Analytics

The placement dashboard should aggregate system data.

### Placement Analytics

```text
Total Students
Eligible Students
Applications
Shortlisted
Selected
Placed
Placement Rate
```

### Recruiter Analytics

```text
Active Recruiters
Open Jobs
Candidates Shortlisted
Selection Rate
Offers
```

### Skill Analytics

```text
Most demanded skills
Skill gaps
Branch-wise skill distribution
```

### Compensation Analytics

```text
Average CTC
Median CTC
Highest CTC
Role-wise CTC
```

### Drive Analytics

```text
Active Drives
Upcoming Drives
Completed Drives
Conflicts
```

---

# 20. Near-Real-Time Analytics

The prototype does not require a complex real-time infrastructure.

Use:

```text
MongoDB
    ↓
Aggregation queries
    ↓
Dashboard API
    ↓
Vanilla JavaScript
    ↓
DOM update
```

Dashboard data can be refreshed after important operations.

For example:

```text
Candidate selected
       ↓
Database updated
       ↓
Analytics queried again
       ↓
Dashboard reflects updated count
```

Do not introduce WebSockets unless the actual demo requires them.

For the hackathon prototype, normal API refreshes are sufficient.

---

# 21. Phase 12 — Notifications

Implement notifications for important events.

Examples:

```text
Application shortlisted
Interview scheduled
Drive changed
Offer received
Documents pending
Joining date approaching
```

Initial implementation can use:

```text
Notification collection
+
In-app notification panel
```

External SMS/WhatsApp integration is out of scope.

---

# 22. Phase 13 — Risk Prediction

Risk prediction is an optional intelligent layer after the core workflow works.

Potential inputs:

```text
CGPA
Failures
Attendance/absences
Assessment scores
Interview performance
Skill gaps
Application history
```

Potential output:

```text
Low Risk
Medium Risk
High Risk
```

Important:

This is a **prototype predictive model**, not a validated institutional prediction system.

The dashboard must communicate this appropriately.

---

# 23. Python ML Service

Node.js communicates with Python through HTTP.

```text
Node Backend
     ↓
HTTP Request
     ↓
Python ML Service
     ↓
Scikit-learn Model
     ↓
Prediction
     ↓
Node Backend
```

Example:

```text
POST /predict-risk
```

The ML service should remain small.

Do not build an independent microservice ecosystem.

---

# 24. Demo Dataset

Create a controlled synthetic dataset.

Target:

```text
Students:       ~200
Recruiters:     5–10
Jobs:           8–15
Drives:         3–5
Skills:         ~30–50
```

The dataset must deliberately contain different scenarios.

### Scenario A — Strong Candidate

```text
Eligible
Strong skills
Relevant projects
High match
```

### Scenario B — Eligible but Skill Gap

```text
Eligible
Moderate match
Missing important skills
```

### Scenario C — Academically Strong but Poor Job Fit

```text
High CGPA
Low technical relevance
```

### Scenario D — Ineligible

```text
CGPA below requirement
OR
wrong branch
OR
backlog condition
```

### Scenario E — Scheduling Conflict

A student should intentionally be shortlisted for two overlapping drives.

### Scenario F — Offer Lifecycle

At least one student should have:

```text
Selected
→ Offer Sent
→ Accepted
→ Documents Verified
→ Joining Confirmed
```

This makes the final demo much more convincing than random data.

---

# 25. Seed Strategy

Create:

```text
data/seed.js
```

The seed script should populate:

```text
Users
Students
Recruiters
Jobs
Drives
Applications
Offers
Assessments
Notifications
```

The team should be able to reset the demo database and recreate the complete scenario.

Example conceptual command:

```bash
npm run seed
```

---

# 26. Frontend Implementation Order

The frontend should follow the same workflow.

## Global

```text
Navbar
Sidebar
Loading states
Error states
Toast notifications
Modal
Table
Cards
Charts
Status badges
```

These should be implemented as reusable UI patterns using:

```text
HTML
CSS
Vanilla JavaScript
```

## Student

```text
Student Dashboard
Profile
Resume Upload
Readiness
Skill Gaps
Recommended Jobs
Applications
Offers
Notifications
```

## Recruiter

```text
Recruiter Dashboard
Create Job
Upload JD
Job Details
Candidate Ranking
Candidate Explanation
Drive Management
Applications
```

## Placement Cell

```text
Placement Dashboard
Students
Recruiters
Jobs
Drives
Conflicts
Offers
Analytics
Notifications
```

---

# 27. Frontend Design Principle

Do not build three completely unrelated applications.

Use a shared design system:

```text
Cards
Tables
Badges
Buttons
Forms
Modals
Charts
Navigation
```

Role-specific dashboards should use the same visual language.

### JavaScript organization

Keep frontend logic modular:

```text
api.js
→ API communication

auth.js
→ authentication/session handling

student.js
→ student dashboard logic

recruiter.js
→ recruiter dashboard logic

placement.js
→ placement dashboard logic

matching.js
→ matching-related rendering

analytics.js
→ analytics data and charts

utils.js
→ shared helpers
```

Do not place all frontend JavaScript into one large file.

---

# 28. API Implementation Order

Backend APIs should be implemented in this order:

```text
1. Auth
2. Student Profile
3. Resume Upload
4. Resume Parsing
5. Readiness
6. Recruiter
7. Jobs
8. JD Parsing
9. Eligibility
10. Matching
11. Applications
12. Drives
13. Conflict Detection
14. Offers
15. Notifications
16. Analytics
17. ML Risk Prediction
```

This order follows the actual dependency chain.

---

# 29. AI Implementation Order

Do not integrate all AI functionality simultaneously.

Use:

```text
AI Foundation
     ↓
Resume Parsing
     ↓
JD Parsing
     ↓
Embeddings
     ↓
Matching Explanation
     ↓
Readiness Recommendations
     ↓
Optional Risk Prediction
```

The AI provider should be selected only after evaluating:

```text
Structured output support
API availability
Free/low-cost limits
Rate limits
Latency
Context length
Resume quality
JD quality
Embedding availability
Node/Python compatibility
Demo reliability
```

The selected provider should be connected through the AI service abstraction rather than directly throughout the application.

---

# 30. AI Cost-Control Strategy

The prototype should minimize unnecessary AI calls.

### Bad

```text
Every dashboard load
       ↓
LLM call
```

### Good

```text
Resume uploaded
       ↓
Parse once
       ↓
Store structured profile
```

Similarly:

```text
JD uploaded
       ↓
Parse once
       ↓
Store requirements
```

And:

```text
Profile/JD changed
       ↓
Recalculate embedding
```

Otherwise:

```text
Reuse cached embedding
```

Explanations should be generated only when needed.

The application should not call an LLM for deterministic operations such as:

```text
Eligibility
Score calculation
Conflict detection
Offer state transitions
Database filtering
```

---

# 31. Team of 5

The team should have clear ownership rather than everyone touching everything.

Because the primary implementation responsibility is concentrated with the system lead, teammates should receive isolated, integration-friendly tasks.

## Member 1 — Backend / System Lead

**Primary owner: You**

Responsibilities:

```text
Backend architecture
Express setup
MongoDB + Mongoose
Core APIs
Database models
Business logic
Matching engine
Eligibility engine
Scheduling
Conflict detection
Offer lifecycle
AI orchestration
API contracts
Final integration
Code review
```

You will handle the majority of the core implementation.

Your responsibility is to make sure all modules work together as one coherent system.

You should not spend the majority of your time manually building every frontend screen.

---

## Member 2 — Frontend

Responsibilities:

```text
HTML pages
CSS styling
Vanilla JavaScript
Student dashboard
Recruiter dashboard
Placement dashboard
Forms
Tables
Cards
API integration
Responsive layout
```

This member should work against the API contracts you define.

They do not need to understand the entire backend implementation.

---

## Member 3 — AI / Data / ML

Responsibilities:

```text
Synthetic dataset
Resume/JD test samples
AI prompt experiments
Structured-output schemas
Embedding experiments
Readiness calculations
Python ML service
Risk model
AI evaluation
```

This person should work closely with you because AI outputs ultimately enter the backend.

The final integration of AI into production routes remains under the system lead.

---

## Member 4 — Workflow / Testing Support

Responsibilities:

```text
Drive data
Application workflow testing
Scheduling scenarios
Conflict test cases
Offer lifecycle test cases
Notification test cases
Demo scenario preparation
Data validation
```

This member focuses primarily on validating the workflows rather than independently redesigning the backend architecture.

---

## Member 5 — Analytics / QA / Deployment

Responsibilities:

```text
Analytics UI
Charts
Dashboard polish
Test cases
Bug tracking
Deployment support
README
Screenshots
Demo preparation
Presentation support
```

This role can shift heavily toward QA and integration near the end.

---

# 32. How You Should Work as System Lead

Because you are handling most of the implementation, avoid becoming the bottleneck.

Your workflow:

```text
Define
  ↓
Implement core
  ↓
Document API
  ↓
Give teammate isolated task
  ↓
Review
  ↓
Integrate
```

Do not do:

```text
Everyone asks you
       ↓
You write everything
       ↓
Everyone waits
```

Instead, establish interfaces early.

Example:

```text
POST /api/jobs/:id/match
```

Once the API contract is known, another teammate can build the frontend against the contract even while the backend implementation is evolving.

### Recommended ownership model

```text
YOU
│
├── Architecture
├── Backend
├── Database
├── Core APIs
├── AI integration
├── Matching
├── Scheduling
├── Offers
└── Final integration
│
├───────────────┬───────────────┬───────────────┐
▼               ▼               ▼               ▼
Frontend        AI/ML           Workflow        QA/Analytics
Member 2        Member 3        Member 4        Member 5
```

The team should support the system without creating multiple competing implementations of the same core feature.

---

# 33. Git Workflow

Use a simple branch structure.

```text
main
  ↓
develop
```

Feature branches:

```text
feature/auth
feature/student-profile
feature/resume-ai
feature/matching
feature/drives
feature/analytics
```

Commit style:

```text
feat: add student profile API
feat: implement candidate matching
fix: resolve drive conflict calculation
docs: update API specification
refactor: extract matching service
```

Avoid committing unfinished experimental code directly to `main`.

The system lead should review important merges before integration.

---

# 34. Integration Checkpoints

After each major phase, verify the complete flow.

### Checkpoint 1

```text
Register
→ Login
→ Dashboard
```

### Checkpoint 2

```text
Resume
→ Upload
→ Extract
→ Profile
```

### Checkpoint 3

```text
Profile
→ Readiness
→ Skill gaps
```

### Checkpoint 4

```text
Recruiter
→ JD
→ Requirements
```

### Checkpoint 5

```text
JD
→ Eligibility
→ Matching
→ Ranking
```

### Checkpoint 6

```text
Ranking
→ Shortlist
→ Drive
→ Conflict detection
```

### Checkpoint 7

```text
Selected
→ Offer
→ Documents
→ Joining
```

### Checkpoint 8

```text
All operations
→ Analytics dashboard
```

---

# 35. Testing Strategy

Testing should happen throughout development rather than at the end.

## Backend

Test:

```text
Authentication
Authorization
Validation
CRUD
Matching
Eligibility
Scheduling
Offer transitions
Analytics
```

## AI

Test:

```text
Valid resume
Messy resume
Missing information
Different resume formats
Valid JD
Poorly formatted JD
Missing requirements
Unexpected LLM output
```

## Matching

Test edge cases:

```text
100% skill match
0% skill match
Eligible but poor match
Ineligible candidate
Missing skills
Missing academic data
```

## Scheduling

Test:

```text
No conflict
Exact overlap
Partial overlap
Back-to-back drives
Multiple conflicts
```

## Frontend

Test:

```text
Loading state
Empty state
API failure
Invalid form
Successful form
Authentication failure
Role-based access
Mobile/responsive layout
Table rendering
Chart rendering
```

---

# 36. AI Failure Handling

AI must never become a single point of failure for the entire application.

If resume parsing fails:

```text
Upload
 ↓
Parsing failed
 ↓
Show error
 ↓
Allow manual profile entry
```

If JD parsing fails:

```text
JD upload
 ↓
Parsing failed
 ↓
Allow recruiter to enter requirements manually
```

If explanation generation fails:

```text
Matching still works
 ↓
Show deterministic factors
```

The core placement workflow must remain functional even when AI is unavailable.

---

# 37. Demo Reliability

The demo should never depend entirely on a live AI API.

Before the final demonstration:

```text
Generate profiles
Generate jobs
Generate matches
Generate drives
Generate offers
```

Where appropriate, cache AI-generated results.

The live AI interaction should be used where it creates visible value, especially:

```text
Resume → Profile
JD → Requirements
```

The rest of the demo can operate on stored structured data.

This prevents a temporary AI provider failure from breaking the entire demonstration.

---

# 38. Security Basics

At minimum:

```text
Passwords hashed
Secrets stored in .env
API keys never sent to frontend
Role authorization on backend
Uploaded files validated
Request validation
Error messages sanitized
```

Treat uploaded resumes and JDs as untrusted input.

Do not allow document text to override system instructions given to the LLM.

Use:

```text
Document
   ↓
Extraction
   ↓
Sanitization
   ↓
LLM
   ↓
Schema validation
   ↓
Backend normalization
   ↓
Database
```

---

# 39. Performance Priorities

The prototype should prioritize:

```text
Reliability
↓
Correctness
↓
Demo responsiveness
↓
Scalability
```

Do not prematurely optimize.

For 200 students, simple MongoDB queries and application-level matching are sufficient for the prototype.

Avoid introducing:

```text
Vector database
Microservices
WebSockets
Message queues
Kubernetes
Distributed caching
```

unless the actual prototype requires them.

---

# 40. What Must Be Finished Before the Hackathon

The following should already work:

## Student

```text
✓ Login
✓ Resume upload
✓ AI profile extraction
✓ Profile display
✓ Readiness score
✓ Skill gaps
✓ Job recommendations
✓ Applications
✓ Offer status
```

## Recruiter

```text
✓ Login
✓ Create job
✓ Upload JD
✓ AI requirement extraction
✓ Eligibility filtering
✓ Candidate ranking
✓ Match explanation
✓ Drive creation
```

## Placement Cell

```text
✓ Dashboard
✓ Students
✓ Recruiters
✓ Jobs
✓ Drives
✓ Conflict detection
✓ Offers
✓ Analytics
```

## System

```text
✓ Synthetic dataset
✓ AI provider integrated
✓ Embeddings working
✓ Matching working
✓ ML component if implemented
✓ Seed script
✓ Deployment
✓ Demo flow
```

---

# 41. What Should NOT Be Built Before the Core System

Do not allow optional features to consume the team's core development time.

Avoid initially:

```text
✗ Mobile application
✗ Blockchain
✗ WhatsApp integration
✗ LinkedIn integration
✗ External job portal integration
✗ Microservices
✗ Kubernetes
✗ Custom LLM
✗ Complex AI agents
✗ Full enterprise authentication
✗ Multi-campus architecture
```

These can be mentioned as future scope.

---

# 42. Definition of Done

A feature is considered complete only when:

```text
Backend
   ↓
Database
   ↓
API
   ↓
Frontend
   ↓
Validation
   ↓
Error handling
   ↓
Demo scenario
```

are all working.

A backend endpoint alone is not a completed feature.

For AI features:

```text
AI
 ↓
Validation
 ↓
Normalization
 ↓
Database
 ↓
API
 ↓
Frontend
```

must also work as one complete flow.

---

# 43. Final Demo Flow

The entire hackathon presentation should follow one connected story.

## Step 1 — Student

Rahul uploads his resume.

```text
Resume
 ↓
AI extraction
 ↓
Profile
 ↓
Readiness: 76
 ↓
Skill gaps
```

---

## Step 2 — Recruiter

Recruiter uploads a backend developer JD.

```text
JD
 ↓
AI extraction
 ↓
Requirements
```

---

## Step 3 — Matching

CampusLink processes the student pool.

```text
200 Students
      ↓
Eligibility
      ↓
Eligible Candidates
      ↓
Matching
      ↓
Ranking
```

Show:

```text
Candidate
Match Score
Why matched
Skill gaps
```

---

## Step 4 — Placement Cell

Placement cell sees:

```text
Shortlisted candidates
Active drives
Upcoming drives
Conflicts
```

---

## Step 5 — Conflict

Show an intentional scheduling conflict.

```text
Rahul
 ↓
Company A — 10:00
Company B — 11:00
 ↓
Conflict detected
```

---

## Step 6 — Offer

Show:

```text
Selected
 ↓
Offer Sent
 ↓
Accepted
 ↓
Documents Verified
 ↓
Joining Confirmed
```

---

## Step 7 — Analytics

Finish with:

```text
Placement Rate
Recruiter Activity
Skill Demand
Skill Gaps
Average CTC
Drive Conflicts
Offer Status
```

This demonstrates the complete:

```text
Profiling
   ↓
Matching
   ↓
Scheduling
   ↓
Notification
   ↓
Offer Tracking
   ↓
Analytics
```

workflow.

---

# 44. Implementation Priority Matrix

## P0 — Must Work

```text
Authentication
Student profile
Resume parsing
Readiness
Skill gaps
Recruiter jobs
JD parsing
Eligibility
Matching
Explainability
Applications
Drives
Conflict detection
Offers
Placement dashboard
Analytics
```

## P1 — Strongly Recommended

```text
Notifications
Job recommendations
Embedding-based matching
ML risk prediction
Assessment data
Better analytics
```

## P2 — Polish

```text
Advanced animations
Dark mode
Additional charts
Extra recommendation logic
Advanced filtering
```

## P3 — Future

```text
Mobile
Multi-campus
External job portals
LinkedIn
WhatsApp
Blockchain
Conversational assistant
```

---

# 45. Final Development Sequence

The actual development order should be:

```text
                    CAMPUSLINK
                        │
                        ▼
                PROJECT FOUNDATION
                        │
                        ▼
                 AUTH + ROLES
                        │
                        ▼
                 STUDENT PROFILE
                        │
                        ▼
                RESUME AI PIPELINE
                        │
                        ▼
              READINESS + SKILL GAP
                        │
                        ▼
                RECRUITER + JOBS
                        │
                        ▼
                  JD AI PIPELINE
                        │
                        ▼
              ELIGIBILITY ENGINE
                        │
                        ▼
               MATCHING ENGINE
                        │
                        ▼
            RANKING + EXPLAINABILITY
                        │
                        ▼
              APPLICATION WORKFLOW
                        │
                        ▼
                 DRIVE MANAGEMENT
                        │
                        ▼
              CONFLICT DETECTION
                        │
                        ▼
                 OFFER TRACKING
                        │
                        ▼
                   ANALYTICS
                        │
                        ▼
              NOTIFICATIONS + ML
                        │
                        ▼
                TESTING + POLISH
                        │
                        ▼
                    DEPLOYMENT
                        │
                        ▼
                  FINAL DEMO
```

---

# 46. The Most Important Rule

CampusLink is not fundamentally an:

```text
AI chatbot
```

and it is not merely:

```text
Resume screening software
```

The system should demonstrate a connected intelligence loop:

```text
STUDENT
   │
   │ profile/readiness
   ▼
CAMPUSLINK INTELLIGENCE ENGINE
   ▲
   │ matching/requirements
   │
RECRUITER
   │
   ▼
PLACEMENT WORKFLOW
   │
   ├── Drives
   ├── Conflicts
   ├── Applications
   ├── Offers
   └── Joining
   │
   ▼
ANALYTICS
   │
   ▼
Better placement decisions
```

The technical division remains:

```text
LLM
→ Understand unstructured information

Embeddings
→ Compare semantic meaning

ML
→ Predict patterns

Algorithms
→ Calculate scores and detect conflicts

Backend
→ Control the system and business rules

MongoDB
→ Store the source of truth

HTML + CSS + Vanilla JavaScript
→ Present the intelligence to users
```

This separation should remain intact throughout implementation.

---

# 47. Immediate Next Step

After this document is committed, **do not immediately start building random features**.

The next concrete implementation sequence is:

```text
1. Create repository
2. Create folder structure
3. Commit all docs
4. Initialize backend
5. Initialize frontend
6. Connect MongoDB
7. Create .env
8. Implement authentication
9. Create database models
10. Build first vertical slice:

       Student
          ↓
       Resume
          ↓
       Profile
          ↓
       Readiness
```

Once that vertical slice works end-to-end, move to:

```text
Recruiter
→ JD
→ Matching
```

Then:

```text
Drive
→ Conflict
→ Offer
```

Then:

```text
Analytics
→ Polish
→ Demo
```

**Do not move forward merely because the code compiles. Move forward when the complete user flow works.**
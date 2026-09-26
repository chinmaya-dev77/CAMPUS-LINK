# CampusLink
## AI-Powered Campus-to-Corporate Placement Intelligence & Management Platform

**Document:** System Architecture  
**Version:** 1.1  
**Status:** Draft for Team Review  
**Related Document:** PRD.md

---

# 1. Architecture Overview

CampusLink uses a **modular monolithic architecture** for the prototype.

The system consists of:

- HTML + CSS + Vanilla JavaScript web application
- Node.js + Express backend
- MongoDB database
- Provider-neutral LLM service
- Embedding-based semantic matching
- Python + Scikit-learn ML service

The Node.js backend acts as the central application layer. It manages the main business logic, REST APIs, database operations, AI orchestration, placement workflows, scheduling, matching, offers, and analytics.

AI and ML services are invoked only where they provide value. Deterministic backend logic is used for eligibility filtering, score calculations, conflict detection, scheduling, offer states, and analytics calculations.

The architecture is intentionally kept simple because the MVP is a web-based prototype using a controlled synthetic dataset of approximately 200 students.

The frontend intentionally avoids a heavy JavaScript framework. HTML, CSS, and Vanilla JavaScript are sufficient for the prototype and communicate with the backend through REST APIs.

---

# 2. High-Level Architecture

```text
                         HTML + CSS + JS
                           Web Application
                                │
                                │ REST APIs
                                ▼
                       ┌──────────────────┐
                       │ Node.js + Express│
                       │   Main Backend   │
                       └────────┬─────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
         ┌─────────┐       ┌──────────┐     ┌─────────────┐
         │ MongoDB │       │   LLM    │     │ Python ML   │
         │         │       │ Provider │     │  Service    │
         └─────────┘       └──────────┘     └─────────────┘
              │                 │                 │
              │            Resume/JD          Prediction
              │            Parsing             Risk Model
              │            Explanation         Analytics
              │
              └──────────────────────────────────────┐
                                                     │
                                              Placement
                                              Intelligence
                                                     │
                            ┌────────────────────────┼───────────────┐
                            ▼                        ▼               ▼
                       Matching                 Scheduling       Analytics
                            │                        │               │
                            ▼                        ▼               ▼
                       Ranking                  Conflicts       Dashboard
```

---

# 3. Technology Components

## 3.1 Frontend

**Technology:**

```text
HTML
CSS
Vanilla JavaScript
Charting Library
```

The frontend is responsible for:

- Student dashboard
- Recruiter dashboard
- Placement-cell dashboard
- Resume upload interface
- Job/JD upload interface
- Student profile visualization
- Readiness visualization
- Skill-gap visualization
- Candidate ranking
- Match explanations
- Drive scheduling interface
- Offer tracking
- Analytics dashboards
- Notifications

The frontend primarily displays data and collects user input.

Business-critical decisions remain in the backend.

### Frontend Design Principle

The frontend should remain lightweight.

It should use:

```text
HTML
    ↓
CSS
    ↓
Vanilla JavaScript
    ↓
REST API
```

The frontend does not require:

- React
- Redux
- React Router
- Large state-management libraries
- Heavy component frameworks

Reusable UI patterns should be implemented through shared HTML structures, CSS classes, and modular JavaScript functions.

---

## 3.2 Backend

**Technology:**

```text
Node.js
Express.js
REST APIs
```

The Node.js backend is the main application layer.

Responsibilities include:

- Authentication
- Student management
- Recruiter management
- Job management
- Application management
- Placement-drive management
- Eligibility filtering
- Candidate matching
- Candidate ranking
- Scheduling
- Conflict detection
- Offer tracking
- Notifications
- Analytics
- AI service orchestration
- Communication with the Python ML service

---

## 3.3 Database

**Technology:**

```text
MongoDB
Mongoose
```

MongoDB stores the application's persistent data.

The database will contain information such as:

```text
Users
Students
Recruiters
Jobs
Applications
Placement Drives
Offers
Assessments
Notifications
AI-generated profiles
Embeddings / AI metadata
```

The exact schemas and relationships are defined separately in:

```text
docs/DATABASE_SCHEMA.md
```

---

## 3.4 LLM

**Technology:**

```text
Selected LLM Provider
```

The specific LLM provider and model will be selected during implementation based on:

- Structured output support
- API availability
- Cost
- Free-tier or low-cost availability
- Rate limits
- Latency
- Context length
- Resume parsing quality
- JD parsing quality
- Node.js integration
- Demo reliability

The application must not be tightly coupled to one provider.

The LLM is used for language-understanding tasks such as:

- Resume understanding
- Job-description understanding
- Structured information extraction
- Natural-language explanations
- Preparation recommendations where sufficient information exists

The LLM should not independently determine:

- Final eligibility
- Final candidate score
- Scheduling conflicts
- Final scheduling decisions
- Offer status

Those operations remain controlled by deterministic backend logic.

---

## 3.5 Embeddings

Embeddings are used for semantic similarity.

They compare information such as:

```text
Student profile
Student projects
Student experience
        ↓
    Embedding
        ↓
Job description
Required skills
Role requirements
```

Embeddings allow the system to identify semantic relationships beyond exact keyword matching.

The exact embedding model will be selected during implementation and documented after testing.

The initial prototype does not require a dedicated vector database.

Embeddings may be persisted alongside relevant MongoDB records.

---

## 3.6 Machine Learning

**Technology:**

```text
Python
Scikit-learn
```

The Python service may handle:

- Readiness analysis
- Placement-risk prediction
- Predictive analytics

The ML service remains lightweight.

The model operates on the prototype's synthetic/simulated dataset and its limitations must be documented.

---

# 4. Architectural Principles

## 4.1 Backend as the Source of Truth

The backend is responsible for important business decisions.

The frontend must not independently determine:

```text
Eligibility
Match Scores
Drive Conflicts
Offer States
Placement Analytics
```

The frontend requests the required information from the backend.

---

## 4.2 Selective AI Usage

AI should only be used where it provides meaningful value.

```text
LLM
→ Language understanding

Embeddings
→ Semantic similarity

ML
→ Prediction

Backend algorithms
→ Deterministic decisions
```

This reduces unnecessary API usage and makes the system easier to explain.

---

## 4.3 LLM Does Not Replace Business Logic

The LLM may interpret unstructured information, but it does not control the placement workflow.

For example:

```text
JD
 ↓
LLM
 ↓
Structured Requirements
 ↓
Backend Eligibility Engine
 ↓
Eligible / Not Eligible
```

The LLM extracts the requirement.

The backend applies the rule.

---

## 4.4 Parse Once, Reuse Later

Expensive AI operations should not be repeatedly performed.

### Resume

```text
Resume PDF
 ↓
Text Extraction
 ↓
LLM
 ↓
Structured Profile
 ↓
MongoDB
```

After successful extraction, the stored structured profile should be reused.

### Job Description

```text
JD PDF
 ↓
Text Extraction
 ↓
LLM
 ↓
Structured Job
 ↓
MongoDB
```

The same principle applies to embeddings.

---

## 4.5 Explainability

Important AI-assisted outputs should expose their major contributing factors.

For candidate matching, the system should retain:

```text
Skill Match
Semantic Match
Project Relevance
Academic Fit
Assessment/Profile Evidence
```

This allows users to understand how the final score was produced.

---

## 4.6 Modular Monolith

CampusLink will use one main backend application rather than multiple independent microservices.

Conceptually:

```text
Node.js Backend
│
├── Student Module
├── Recruiter Module
├── Job Module
├── Application Module
├── Matching Module
├── Drive Module
├── Scheduling Module
├── Offer Module
├── Analytics Module
└── AI Integration Layer
```

This keeps development and deployment manageable for the prototype.

---

# 5. Backend Architecture

The backend follows a layered structure:

```text
                    Express Application
                            │
                            ▼
                          Routes
                            │
                            ▼
                       Controllers
                            │
                            ▼
                         Services
                            │
                 ┌──────────┼──────────┐
                 ▼          ▼          ▼
              Models      AI Layer   Utilities
                 │          │
                 ▼          ├── LLM Provider
              MongoDB       ├── Embeddings
                            └── Python ML
```

## 5.1 Routes

Routes define HTTP endpoints.

Examples:

```text
/api/auth
/api/students
/api/recruiters
/api/jobs
/api/applications
/api/drives
/api/offers
/api/analytics
```

Routes should primarily handle endpoint definitions and middleware.

---

## 5.2 Controllers

Controllers handle:

- Request parsing
- Calling appropriate services
- Response formatting
- HTTP status codes

Controllers should not contain large amounts of business logic.

---

## 5.3 Services

Services contain the main business logic.

Examples:

```text
resume.service.js
jd.service.js
matching.service.js
readiness.service.js
scheduling.service.js
offer.service.js
analytics.service.js
```

This keeps the backend maintainable.

---

## 5.4 Models

Models represent MongoDB data structures.

Examples:

```text
User
Student
Recruiter
Job
Application
Drive
Offer
Assessment
Notification
```

The exact schema definitions are documented separately.

---

# 6. AI Architecture

CampusLink uses multiple AI approaches rather than depending on a single AI system.

```text
                    CampusLink AI
                         │
             ┌───────────┼───────────┐
             │           │           │
             ▼           ▼           ▼
            LLM      Embeddings      ML
             │           │           │
             ▼           ▼           ▼
         Language     Semantic    Prediction
        Understanding Similarity
```

The LLM provider is configurable and should be replaceable without changing the rest of the application architecture.

---

# 7. Resume Processing Architecture

The resume-processing pipeline is:

```text
Student
   │
   │ PDF Upload
   ▼
HTML + JavaScript Frontend
   │
   │ POST Request
   ▼
Node.js Backend
   │
   ▼
PDF Text Extraction
   │
   ▼
LLM Provider
   │
   ▼
Structured JSON
   │
   ▼
Schema Validation
   │
   ▼
MongoDB
```

Example structured result:

```json
{
  "skills": [
    "Java",
    "SQL",
    "React"
  ],
  "projects": [
    {
      "title": "Food Delivery Platform",
      "technologies": [
        "Node.js",
        "MongoDB"
      ]
    }
  ],
  "certifications": [],
  "experience": [],
  "education": []
}
```

The structured profile becomes the primary representation used by the rest of the system.

---

# 8. Job Description Processing

Recruiters can either manually enter job requirements or upload a JD PDF.

Both paths should result in the same structured representation.

```text
Recruiter
    │
    ├──────────── Manual Job Form
    │                    │
    │                    ▼
    │              Structured Job
    │
    └──────────── JD PDF
                         │
                         ▼
                  Text Extraction
                         │
                         ▼
                    LLM Provider
                         │
                         ▼
                   Structured Job
                         │
                         ▼
                      MongoDB
```

Example:

```json
{
  "role": "Software Engineer",
  "requiredSkills": [
    "Java",
    "SQL",
    "DSA"
  ],
  "preferredSkills": [
    "Spring Boot",
    "Docker"
  ],
  "minimumCGPA": 7.5,
  "eligibleBranches": [
    "CSE",
    "IT"
  ]
}
```

---

# 9. Candidate Matching Architecture

Candidate matching uses a hybrid pipeline.

```text
                     Job
                      │
                      ▼
               Eligibility Filter
                      │
                      ▼
                Eligible Students
                      │
                      ▼
                 Skill Matching
                      │
                      ▼
                Semantic Matching
                      │
                      ▼
                 Project Relevance
                      │
                      ▼
                   Academic Fit
                      │
                      ▼
             Assessment/Profile Evidence
                      │
                      ▼
                 Weighted Score
                      │
                      ▼
                    Ranking
                      │
                      ▼
                  Explanation
```

---

# 10. Eligibility Engine

Eligibility is deterministic.

Example rules:

```text
CGPA >= minimum CGPA

AND

Branch ∈ eligible branches

AND

Backlog requirements satisfied

AND

Mandatory requirements satisfied
```

Candidates failing mandatory requirements are removed before ranking.

The LLM does not make the final eligibility decision.

---

# 11. Matching Engine

After eligibility filtering, the system calculates multiple matching factors.

## 11.1 Skill Match

```text
Required Skills
       vs
Student Skills
```

Example:

```text
Required:
Java
SQL
DSA
Spring Boot

Student:
Java
SQL
DSA
React

Skill Match = 3 / 4 = 75%
```

---

## 11.2 Semantic Match

The system calculates embedding similarity between relevant student information and job requirements.

Example:

```text
Semantic Similarity = 0.84
```

---

## 11.3 Project Relevance

Student projects are compared with the role requirements.

---

## 11.4 Academic Fit

Academic information is compared against role requirements.

---

## 11.5 Final Fit Score

Initial prototype formula:

```text
40% Skill Match
25% Semantic Match
15% Project Relevance
10% Academic Fit
10% Assessment / Profile Evidence
```

The weights are configurable prototype parameters and may be adjusted during testing.

---

# 12. Explainability Architecture

The ranking system should not return only:

```text
Rahul = 91%
```

Instead, the backend should retain the contributing factors.

Example:

```text
Candidate: Rahul Kumar

Final Match: 91%

Skill Match: 95%
Semantic Match: 88%
Project Relevance: 90%
Academic Fit: 100%
Assessment/Profile Evidence: 80%
```

The system can then provide:

```text
Strengths:
✓ Java
✓ SQL
✓ DSA
✓ Relevant project
✓ CGPA eligible

Skill Gap:
⚠ Spring Boot
```

The LLM may convert these already-computed factors into natural-language explanations.

The LLM does not calculate or override the final score.

---

# 13. Readiness Architecture

The readiness system receives structured student information.

```text
Student Profile
      │
      ├── Technical Skills
      ├── Projects
      ├── Academic Performance
      ├── Assessment
      └── Interview Performance
              │
              ▼
       Readiness Calculation
              │
              ▼
          Readiness Score
              │
              ▼
        Readiness Category
```

Initial prototype weighting:

```text
Technical Skills       30%
Projects               20%
Academic Performance   20%
Assessment             15%
Interview Performance  15%
```

The score should be accompanied by contributing factors and improvement areas.

The readiness score is a prototype decision-support indicator and is not a definitive measure of ability or future employment outcome.

---

# 14. Python ML Service Architecture

The Python ML service is kept separate from the main Node.js application.

```text
Node.js Backend
      │
      │ HTTP Request
      ▼
Python ML API
      │
      ▼
Scikit-learn Model
      │
      ▼
Prediction
      │
      ▼
JSON Response
      │
      ▼
Node.js Backend
      │
      ▼
MongoDB
```

Potential endpoints:

```text
POST /predict/readiness
POST /predict/risk
```

The Python service should remain focused on model execution and related preprocessing.

Application workflows remain controlled by Node.js.

---

# 15. Student Risk Prediction

The risk prediction system is optional for the MVP.

If implemented:

```text
Student Data
     │
     ▼
Feature Preparation
     │
     ▼
ML Model
     │
     ▼
Risk Output
     │
     ▼
Node.js
     │
     ▼
Dashboard
```

Risk outputs should be presented as model outputs rather than guarantees.

The model is based on synthetic or simulated data and is not statistically or institutionally validated.

---

# 16. Scheduling Architecture

Scheduling uses deterministic conflict detection.

```text
                  Placement Drives
                        │
                        ▼
                  Scheduling Engine
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
           Student     Venue     Panel
           Conflict   Conflict   Conflict
              │         │         │
              └─────────┼─────────┘
                        ▼
                  Conflict Result
```

The system should detect:

- Student assigned to overlapping drives
- Multiple drives using the same venue/time
- Resource conflicts
- Panel/interviewer conflicts where data is available

Example:

```text
10:00 AM

TCS    → Rahul
Amazon → Rahul

        ↓

Conflict Detected
```

Scheduling does not require an LLM.

---

# 17. Offer Tracking Architecture

Offer tracking follows a deterministic state machine.

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

The backend controls valid state transitions.

The frontend displays the current state.

---

# 18. Analytics Architecture

Analytics are generated from stored placement data.

```text
                     MongoDB
                        │
                        ▼
                 Analytics Service
                        │
                        ▼
                Aggregation / Calculation
                        │
                        ▼
                     REST API
                        │
                        ▼
                HTML + JavaScript
                        │
                        ▼
                  Charts / KPIs
```

Possible analytics include:

```text
Placement conversion
Branch-wise placement
Skill-wise outcomes
Recruiter engagement
Applications
Shortlists
Selections
Offers
Package statistics
Student risk categories
```

Analytics should use the latest stored structured data when requested or when relevant placement data changes.

The MVP does not require continuous streaming or event-processing infrastructure.

---

# 19. Near-Real-Time Data Flow

For the prototype, "near real time" means analytics are derived from the latest stored data rather than from a separate batch-processing pipeline.

Example:

```text
Offer Status Updated
        │
        ▼
     MongoDB
        │
        ▼
Analytics Calculation
        │
        ▼
   Dashboard Refresh
        │
        ▼
    Updated KPI
```

The prototype does not require:

```text
Kafka
Event Streaming
Complex Message Queues
Continuous Stream Processing
```

This keeps the implementation appropriate for the prototype scale.

---

# 20. Complete Student Flow

The complete student flow is:

```text
Student
   │
   ▼
Resume Upload
   │
   ▼
Text Extraction
   │
   ▼
LLM Parsing
   │
   ▼
Structured Profile
   │
   ▼
MongoDB
   │
   ├───────────────┐
   ▼               ▼
Readiness       Embeddings
   │               │
   ▼               ▼
Readiness       Semantic
Score            Matching
   │
   ▼
Skill Gaps
   │
   ▼
Job Recommendations
   │
   ▼
Applications / Drives
   │
   ▼
Offers
```

---

# 21. Complete Recruiter Flow

```text
Recruiter
    │
    ▼
Create / Upload Job
    │
    ▼
JD Processing
    │
    ▼
Structured Requirements
    │
    ▼
Eligibility Filtering
    │
    ▼
Eligible Students
    │
    ▼
Skill Matching
    │
    ▼
Semantic Matching
    │
    ▼
Project Relevance
    │
    ▼
Final Fit Score
    │
    ▼
Candidate Ranking
    │
    ▼
Explainable Results
    │
    ▼
Placement Drive
    │
    ▼
Selection
    │
    ▼
Offer
```

---

# 22. Complete Placement-Cell Flow

```text
Placement Officer
       │
       ▼
Command Dashboard
       │
       ├── Students
       ├── Recruiters
       ├── Drives
       ├── Applications
       ├── Selections
       ├── Offers
       └── Analytics
              │
              ▼
       Scheduling Engine
              │
              ▼
       Conflict Detection
              │
              ▼
       Offer Tracking
              │
              ▼
       Placement Analytics
```

---

# 23. Project Folder Architecture

The repository will use the following high-level structure:

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
│   │   └── forms.css
│   │
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── student.js
│   │   ├── recruiter.js
│   │   ├── placement.js
│   │   └── utils.js
│   │
│   └── assets/
│
├── backend/
│
├── ml-service/
│
├── data/
│
├── README.md
│
└── .gitignore
```

---

# 24. Backend Folder Architecture

```text
backend/
│
├── src/
│   │
│   ├── config/
│   │   ├── db.js
│   │   └── env.js
│   │
│   ├── models/
│   │   ├── User.js
│   │   ├── Student.js
│   │   ├── Recruiter.js
│   │   ├── Job.js
│   │   ├── Application.js
│   │   ├── Drive.js
│   │   ├── Offer.js
│   │   └── Notification.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── student.routes.js
│   │   ├── recruiter.routes.js
│   │   ├── job.routes.js
│   │   ├── application.routes.js
│   │   ├── drive.routes.js
│   │   ├── offer.routes.js
│   │   └── analytics.routes.js
│   │
│   ├── controllers/
│   │
│   ├── services/
│   │   ├── resume.service.js
│   │   ├── jd.service.js
│   │   ├── matching.service.js
│   │   ├── readiness.service.js
│   │   ├── scheduling.service.js
│   │   ├── offer.service.js
│   │   └── analytics.service.js
│   │
│   ├── ai/
│   │   ├── llm.service.js
│   │   ├── embedding.service.js
│   │   └── prompts/
│   │
│   ├── middleware/
│   │
│   ├── utils/
│   │
│   └── app.js
│
└── server.js
```

The LLM implementation should be accessed through `llm.service.js` rather than a provider-specific service name.

This allows the provider to be changed without restructuring the application.

---

# 25. Frontend Folder Architecture

Because CampusLink intentionally uses Vanilla JavaScript, the frontend does not require a `src/components`, `hooks`, `context`, or `App.jsx` structure.

```text
frontend/
│
├── index.html
├── student.html
├── recruiter.html
├── placement.html
│
├── css/
│   ├── style.css
│   ├── dashboard.css
│   ├── forms.css
│   └── tables.css
│
├── js/
│   ├── api.js
│   ├── auth.js
│   ├── student.js
│   ├── recruiter.js
│   ├── placement.js
│   ├── matching.js
│   ├── analytics.js
│   └── utils.js
│
└── assets/
    ├── images/
    └── icons/
```

### Frontend Responsibilities

`api.js`

```text
Centralized fetch/API functions
```

`auth.js`

```text
Login
Logout
Session handling
Role-based navigation
```

`student.js`

```text
Student dashboard
Profile
Resume upload
Readiness
Skill gaps
Applications
Offers
```

`recruiter.js`

```text
Job creation
JD upload
Candidate ranking
Drive management
```

`placement.js`

```text
Placement dashboard
Students
Recruiters
Drives
Conflicts
Offers
```

`matching.js`

```text
Candidate ranking display
Match factors
Skill gaps
Explanations
```

`analytics.js`

```text
Charts
KPIs
Analytics API integration
```

`utils.js`

```text
Shared UI helpers
Formatting
Loading states
Error handling
Status badges
```

---

# 26. ML Service Folder Architecture

```text
ml-service/
│
├── app.py
│
├── models/
│   ├── readiness_model.pkl
│   └── risk_model.pkl
│
├── schemas/
│
├── services/
│   ├── readiness.py
│   └── risk.py
│
└── requirements.txt
```

---

# 27. Deployment Architecture

The prototype deployment should remain simple.

```text
                         Internet
                            │
                            ▼
                   ┌─────────────────┐
                   │ HTML/CSS/JS App │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Node Backend   │
                   └────────┬────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          MongoDB      LLM Provider    ML Service
```

The architecture should avoid unnecessary infrastructure.

The MVP does not require:

```text
Kubernetes
Microservices
Complex event streaming
Custom LLM training
Enterprise infrastructure
```

---

# 28. Security Boundaries

Sensitive credentials must remain server-side.

```text
HTML + CSS + JS
        │
        │ No API secrets
        ▼
Node Backend
   │
   ├── LLM API Key
   ├── MongoDB Credentials
   └── ML Service Credentials
```

Requirements:

- API keys remain server-side.
- Secrets use environment variables.
- `.env` files are not committed.
- Uploaded files are validated.
- Backend APIs validate incoming data.
- AI outputs are validated before being stored or used.

---

# 29. Error Handling

The backend should handle failures at each external integration.

Example:

```text
LLM Failure
    ↓
Backend catches error
    ↓
Return controlled API response
    ↓
Frontend displays useful message
```

The system should not assume that:

```text
LLM always responds
ML service always responds
PDF extraction always succeeds
```

AI-generated structured output should be validated before being accepted.

If AI processing fails, the application should provide a fallback where practical.

For example:

```text
Resume Parsing Failure
        ↓
Allow Manual Profile Entry
```

or:

```text
JD Parsing Failure
        ↓
Allow Manual Job Requirement Entry
```

Core deterministic workflows should remain usable even if an AI service temporarily fails.

---

# 30. Architecture Decision Summary

| Area | Decision |
|---|---|
| Frontend | HTML + CSS + Vanilla JavaScript |
| Frontend Architecture | Lightweight multi-page web application |
| Backend | Node.js + Express |
| API Style | REST |
| Database | MongoDB + Mongoose |
| LLM | Provider-neutral / configurable |
| Semantic Matching | Embeddings |
| ML | Python + Scikit-learn |
| Architecture | Modular monolith |
| Eligibility | Deterministic backend |
| Matching | Hybrid skill + semantic + rule-based |
| Scheduling | Deterministic conflict engine |
| Analytics | MongoDB-derived backend calculations |
| Vector Database | Not required initially |
| Mobile | Future |
| Microservices | Out of scope |
| Kubernetes | Out of scope |

---

# 31. Core Architectural Principle

CampusLink should follow this principle:

> **LLM for understanding, embeddings for semantic similarity, ML for prediction, and deterministic backend logic for decisions and workflow.**

The architecture should provide:

**AI Intelligence + Deterministic Control + Explainable Results**

rather than allowing an AI model to independently control placement decisions.

The frontend should remain intentionally lightweight:

**HTML + CSS + JavaScript → REST APIs → Node.js → MongoDB / AI / ML**

This keeps the project practical for a small team where the majority of implementation is handled by the primary developer.
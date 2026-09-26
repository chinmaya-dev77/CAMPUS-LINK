# CampusLink

## AI-Powered Campus-to-Corporate Placement Intelligence \& Management Platform

**Document:** Product Requirements Document  
**Version:** 1.0  
**Status:** Draft for Team Review  
**Platform:** Web Application  
**Primary LLM Provider:** Groq  
**Demo Dataset:** 200 synthetic students

\---

# 1\. Product Overview

CampusLink is an AI-powered web platform designed to connect three major stakeholders in the campus placement ecosystem:

1. Students
2. Recruiters
3. College Placement Cells

The platform combines student readiness profiling, recruiter requirement analysis, candidate matching, explainable recommendations, drive scheduling, offer tracking, and placement analytics into one connected workflow.

The central idea is not simply to digitize placement records, but to create a shared placement intelligence system that helps:

* Students understand their placement readiness and skill gaps.
* Recruiters identify relevant candidates from a large student pool.
* Placement cells coordinate drives, monitor outcomes, and identify areas requiring attention.

The system follows the placement lifecycle:

**Profiling → Matching → Scheduling → Notification → Offer Tracking → Analytics**

\---

# 2\. Problem

Campus placement operations often involve large numbers of students, recruiters, placement drives, applications, schedules, documents, and offers.

The problem statement identifies several challenges:

* Placement information is often distributed across spreadsheets, emails, messaging groups, and manual processes.
* Students may lack a unified readiness profile and personalized skill-gap guidance.
* Recruiters may have difficulty identifying well-matched candidates from large candidate pools.
* Placement drives can create scheduling conflicts.
* Offer and joining information can require manual tracking.
* Placement cells may lack consolidated analytics about placement performance, skill demand, recruiter engagement, and students at risk of remaining unplaced.

CampusLink addresses these problems through a unified web platform with AI-assisted analysis and deterministic workflow automation.

\---

# 3\. Target Users

## 3.1 Student

Students use CampusLink to:

* Create or automatically generate their placement profile.
* Upload their resume.
* View extracted skills, projects, certifications, and academic information.
* Understand their readiness level.
* Identify skill gaps.
* Discover relevant placement opportunities.
* Understand why they match or do not match a particular role.
* Receive preparation recommendations.
* Track applications, drives, interviews, offers, and joining status.

## 3.2 Recruiter

Recruiters use CampusLink to:

* Create or upload job requirements.
* Define eligibility criteria.
* Analyze the available student pool.
* Filter candidates according to objective eligibility requirements.
* Rank candidates using skill and semantic matching.
* Understand why candidates were ranked.
* Manage placement drives.
* Track candidate progress and offers.

## 3.3 Placement Cell / Placement Officer

Placement officers use CampusLink to:

* Manage students and recruiters.
* Monitor active and upcoming drives.
* Detect scheduling conflicts.
* Monitor applications and selections.
* Track offers and documentation.
* Monitor placement statistics.
* Analyze branch-wise and skill-wise placement outcomes.
* Identify students requiring additional support.
* Monitor recruiter engagement.

\---

# 4\. Product Goal

The primary goal of CampusLink is:

> To provide a connected campus placement intelligence platform that improves candidate discovery for recruiters while giving students personalized readiness guidance and placement cells centralized operational visibility.

The system should reduce unnecessary manual effort while keeping important placement decisions explainable and traceable.

CampusLink should not replace human decision-making. AI-generated scores and recommendations should support users by providing structured information and explanations.

\---

# 5\. Technology Stack

## Frontend

* HTML
* CSS
* Vanilla JavaScript
* Charting library for analytics dashboards

## Backend

* Node.js
* Express.js
* REST APIs

## Database

* MongoDB

## AI

* Provider-neutral LLM
* Embeddings for semantic matching

## Machine Learning

* Python
* Scikit-learn

## Platform

* Web application

The architecture should allow a future mobile application to consume the same backend APIs.





# 6\. Core User Journey

The primary product workflow is:

```text
Student
   ↓
Resume Upload
   ↓
AI Profile Extraction
   ↓
Readiness + Skill Gap Analysis
   ↓
Recruiter Creates / Uploads Job
   ↓
Eligibility Filtering
   ↓
Skill + Semantic Matching
   ↓
Candidate Ranking
   ↓
Explainable Recommendations
   ↓
Placement Drive
   ↓
Conflict Detection / Scheduling
   ↓
Selection / Offer
   ↓
Offer \& Documentation Tracking
   ↓
Placement Analytics
```

The three user experiences are connected through the same underlying placement data.

\---

# 7\. MVP Scope

The MVP will focus on the following capabilities.

## Must Have

### Student

* Resume PDF upload.
* AI-assisted resume parsing.
* Student profile generation.
* Readiness score.
* Readiness category.
* Skill-gap identification.
* Recommended job opportunities.
* Explainable job-fit information.
* Application/drive status.

### Recruiter

* Manual job creation.
* Job Description PDF upload.
* AI-assisted JD parsing.
* Eligibility criteria extraction.
* Candidate eligibility filtering.
* Candidate matching and ranking.
* Explainable matching.
* Placement drive creation.

### Placement Cell

* Placement command dashboard.
* Student and recruiter overview.
* Drive management.
* Drive conflict detection.
* Offer tracking.
* Documentation status.
* Placement analytics.

### Shared Intelligence

* Structured resume extraction.
* Structured JD extraction.
* Skill matching.
* Semantic matching.
* Readiness calculation.
* Explainable recommendations.

## Should Have

If development time permits:

* Personalized preparation recommendations.
* At-risk student prediction.
* Recruiter follow-up suggestions.
* In-platform notifications.
* Additional analytics.

## Future

* Mobile application.
* Multi-campus deployment.
* Advanced conversational assistant.
* External job portal integrations.
* Advanced recommendation systems.

\---

# 8\. Student Features

## 8.1 Resume Upload

Students can upload a PDF resume.

The system extracts relevant information including:

* Skills
* Projects
* Technologies
* Certifications
* Experience
* Education-related information

The extracted information should be stored as structured profile data.

The original resume should not need to be sent to the LLM repeatedly after successful extraction.

## 8.2 Student Profile

Example profile:

```text
Name: Rahul Kumar
Branch: CSE
CGPA: 8.4

Skills:
Java
SQL
React
MongoDB

Projects:
Food Delivery Platform

Certifications:
AWS Cloud Practitioner
```

## 8.3 Readiness

Each student receives a readiness score and category.

Initial categories:

```text
0–49    → Not Ready
50–69   → Developing
70–84   → Ready
85–100  → Highly Employable
```

These thresholds are prototype methodology and should be documented rather than presented as universally validated employability standards.

## 7.4 Skill Gap

The system compares student capabilities with requirements for a selected target role.

Example:

```text
Target Role: Backend Developer

Matched:
✓ Java
✓ SQL
✓ REST APIs

Skill Gaps:
⚠ Spring Boot
⚠ Docker
```

## 7.5 Job Recommendations

Students can view relevant placement opportunities based on:

* Eligibility
* Skills
* Semantic relevance
* Projects
* Other available profile information

## 7.6 Preparation Recommendations

Where sufficient information exists, the system may recommend preparation areas such as:

```text
Improve Spring Boot
Practice SQL
Prepare DSA
Take mock interview
```

\---

# 9\. Recruiter Features

## 9.1 Job Creation

Recruiters can either:

1. Enter job requirements manually.
2. Upload a Job Description PDF.

Both workflows should produce the same structured job requirement representation.

## 8.2 Job Requirement Extraction

Example:

```json
{
  "role": "Software Engineer",
  "required\_skills": \[
    "Java",
    "SQL",
    "DSA"
  ],
  "preferred\_skills": \[
    "Spring Boot",
    "Docker"
  ],
  "minimum\_cgpa": 7.5,
  "eligible\_branches": \[
    "CSE",
    "IT"
  ]
}
```

## 9.3 Eligibility Filtering

Eligibility should primarily use deterministic backend rules.

Examples:

```text
CGPA >= minimum CGPA
Branch is eligible
Backlogs satisfy requirement
Required academic conditions are met
```

The LLM should not make the final eligibility decision.

## 9.4 Candidate Matching

After eligibility filtering, the system calculates candidate-job compatibility.

Example:

```text
Eligible Candidates: 74

Strong Matches:
1. Rahul Kumar       91%
2. Priya Sharma      88%
3. Ankit Das         86%
4. Sneha Patra       84%
```

## 9.5 Explainable Matching

The recruiter should be able to inspect the reasons behind a match.

Example:

```text
Candidate: Rahul Kumar

Strengths:
✓ Java
✓ SQL
✓ DSA
✓ Relevant backend project
✓ CGPA eligible

Skill Gap:
⚠ Spring Boot
```

The system should avoid presenting the ranking as an unexplained black-box decision.

## 9.6 Drive Management

Recruiters can create drives containing:

* Company
* Role
* Date
* Time
* Venue / mode
* Eligible candidates
* Interview stages

\---

# 10\. Placement Cell Features

## 10.1 Command Dashboard

The placement cell dashboard should provide a consolidated view of:

* Total registered students
* Placement-ready students
* Active drives
* Upcoming drives
* Offers
* Accepted offers
* Pending offers
* Placement conversion
* Branch-wise placement information
* Skill-wise information
* Recruiter pipeline
* Students requiring attention

## 10.2 Drive Management

Placement officers can:

* Create drives.
* View upcoming drives.
* Detect conflicts.
* Monitor student participation.
* View drive outcomes.

## 10.3 Student Monitoring

The system can highlight students who may require additional preparation based on the available profile and historical/synthetic data.

## 10.4 Recruiter Monitoring

The placement cell can track:

* Active recruiters
* Drives
* Applications
* Selections
* Offers
* Pending recruiter actions

\---

# 11\. AI Features

CampusLink will use AI selectively rather than applying an LLM to every operation.

## 11.1 LLM

An LLM provider will be selected based on structured-output support,
availability, cost, rate limits, latency, context length, and integration
requirements.

The selected LLM will be used for:

### Resume understanding

Resume text
    ↓
LLM
    ↓
Structured student profile

### JD understanding

JD text
    ↓
LLM
    ↓
Structured job requirements

### Explainable natural-language recommendations

The system may use an LLM to convert already-computed matching factors
into human-readable explanations.

The LLM should not independently determine eligibility or final
scheduling decisions.


## 11.2 Embeddings

Embeddings will be used to compare semantic similarity between:

* Student profile/project descriptions
* Job descriptions
* Required skills
* Relevant experience

This allows the system to identify relevant relationships beyond exact keyword matching.

## 11.3 Machine Learning

Python and Scikit-learn may be used for:

* Readiness analysis.
* Placement-risk prediction.
* Predictive analytics.

The ML component should use the available synthetic/historical-style dataset and its limitations should be clearly documented.

## 11.4 Deterministic Algorithms

Normal backend logic should be used for:

* Eligibility filtering.
* Score calculations.
* Conflict detection.
* Scheduling.
* Offer status.
* Analytics calculations.

This reduces unnecessary AI usage and improves reproducibility.

\---

# 12\. Matching Methodology

Candidate matching will use a hybrid approach.

## Stage 1 — Eligibility

Candidates who fail mandatory requirements are filtered out.

Example:

```text
CGPA
Branch
Backlogs
Mandatory requirements
```

## Stage 2 — Skill Match

Required skills are compared with student skills.

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

## Stage 3 — Semantic Match

Embedding similarity is calculated between relevant student information and job requirements.

Example:

```text
Semantic Similarity = 0.84
```

## Stage 4 — Project Relevance

Projects are compared with the role requirements.

## Stage 5 — Final Fit Score

Initial prototype formula:

```text
Final Fit Score =

40% Skill Match
25% Semantic Match
15% Project Relevance
10% Academic Fit
10% Assessment / Profile Evidence
```

The exact formula may be adjusted during testing.

The system must display the major factors contributing to the score.

\---

# 13\. Readiness Methodology

The readiness score will be calculated using structured student information.

Initial prototype weighting:

```text
Technical Skills       30%
Projects               20%
Academic Performance   20%
Assessment             15%
Interview Performance  15%
```

Output:

```text
0–49    Not Ready
50–69   Developing
70–84   Ready
85–100  Highly Employable
```

The score should be accompanied by contributing factors.

Example:

```text
Readiness: 76

Positive Factors:
✓ Strong technical skills
✓ Relevant project
✓ Good academic performance

Improvement Areas:
⚠ System design
⚠ Mock interview performance
```

The readiness score is intended as a prototype decision-support indicator, not a definitive measure of a student's ability or future employment outcome.


Skill Domain Intelligence

CampusLink should interpret skills at both the individual-skill and skill-domain levels.

A student does not need to explicitly state a domain such as "Web Development" for the system to recognize evidence of that capability.

For example:

```text
JavaScript
React
Node.js
Express.js
MongoDB
\---




# 14\. Scheduling

Scheduling will use deterministic conflict detection rather than an LLM.

The system should detect:

* Student assigned to overlapping drives.
* Multiple drives using the same venue/time.
* Resource conflicts.
* Panel/interviewer conflicts where data is available.

Example:

```text
10:00 AM

TCS      → Rahul
Amazon   → Rahul

Conflict Detected
```

The system may recommend or apply an alternative slot based on available scheduling constraints.

The scheduling system should prioritize predictable and explainable behavior.

\---

# 15\. Offer Tracking

The system should track the post-selection lifecycle.

Possible states:

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

Offer information may include:

* Company
* Role
* CTC/package
* Offer status
* Joining date
* Documentation status

The system should also support tracking of internship/PPO conversion where represented in the prototype dataset.

\---

# 16\. Analytics

The placement dashboard should provide analytics such as:

## Placement

* Overall placement conversion.
* Branch-wise conversion.
* Skill-wise placement outcomes.

## Recruiters

* Recruiter engagement.
* Number of drives.
* Applications.
* Shortlists.
* Selections.
* Offers.

## Compensation

* Average package.
* Highest package.
* Package trends.

## Student Risk

Potentially identify students requiring additional support based on the prototype's predictive model.

Example:

```text
High Risk: 28
Medium Risk: 46
Low Risk: 126
```

Risk predictions must be presented as model outputs based on available data rather than guarantees about individual students.



**Performance**:

&#x20;Near-Real-Time Analytics Analytics will be generated from the latest stored structured data when requested or when relevant placement data changes.  The MVP does not require continuous live streaming or event processing because the prototype dataset is limited in size.

\---

# 17\. Dataset

The prototype will use **synthetic data**.

Initial dataset target:

```text
Students:       200
Recruiters:     5–10
Jobs:           8–15
Placement Drives: 3–5
Skills:         approximately 30–50
```

The dataset should contain realistic variation.

Example student profiles should include:

* Different CGPAs.
* Different branches.
* Different skill combinations.
* Different project experiences.
* Different assessment performance.
* Different placement states.

The dataset should deliberately contain useful scenarios for demonstrating the system.

Examples:

```text
Student A
→ Strong match

Student B
→ Eligible but has skill gaps

Student C
→ Academically eligible but weak skill match

Student D
→ Not eligible

Student E
→ Shortlisted for two overlapping drives
```

The dataset should not be represented as real student data.

The problem statement permits demonstration using simulated or publicly available placement/recruitment datasets.

\---

# 18\. Non-Functional Requirements

## Performance

The application should provide responsive interaction for the prototype dataset.

Expensive AI operations should not occur unnecessarily.

## AI Efficiency

The system should:

* Parse a resume once and store the structured result.
* Parse a JD once and store the structured result.
* Avoid sending entire databases to the LLM.
* Avoid repeating unchanged LLM requests.
* Use deterministic code where possible.
* Cache or persist embeddings.
* Use structured JSON outputs from LLM calls.
* Keep prompts focused on the required task.

## Security

* API keys must remain server-side.
* Secrets must be stored using environment variables.
* `.env` files must not be committed.
* User-uploaded files should be validated.
* Backend APIs should validate incoming data.

## Maintainability

The backend should use clear separation between:

```text
Routes
Controllers
Services
Models
Utilities
```

The frontend should use reusable UI patterns, shared CSS classes,
and modular JavaScript files for common functionality.

## Explainability

Important AI-assisted outputs should expose their major contributing factors.

## Scalability

The prototype should use a REST API architecture so that a future mobile application can consume the same backend.

\---

# 19\. Out of Scope

The following will not be part of the MVP:

* Native Android/iOS application.
* Blockchain-based offer verification.
* LinkedIn integration.
* External job-portal integrations.
* WhatsApp integration.
* Full production-scale authentication infrastructure.
* Kubernetes.
* Microservice architecture.
* Training a custom large language model.
* Complex autonomous AI agents.
* Production-grade enterprise deployment.
* Real student personal data.

These features may be considered in future versions.

\---

# 20\. Success Criteria

The prototype will be considered successful if it can demonstrate the complete core workflow.

## Functional Success

The system should successfully demonstrate:

1. Student resume upload.
2. AI profile extraction.
3. Student readiness analysis.
4. Skill-gap identification.
5. Recruiter job creation/upload.
6. Eligibility filtering.
7. Candidate matching.
8. Explainable candidate ranking.
9. At least three simulated placement drives.
10. Drive conflict detection.
11. Offer tracking.
12. Placement dashboard.
13. Placement analytics.

## AI/ML Success

The team should be able to explain:

* Why an LLM is used.
* Why embeddings are used.
* Why ML is used.
* Why deterministic rules are used.
* How matching is calculated.
* How readiness is calculated.
* How model/matching performance is evaluated.

## Demonstration Success

The final demonstration should tell one connected story rather than presenting unrelated features.

\---

# 21\. Demo Scenario

The final demonstration will use a controlled dataset containing 200 synthetic students.

## Step 1 — Student

Upload:

```text
Rahul\_Kumar\_Resume.pdf
```

CampusLink extracts:

```text
Java
SQL
React
MongoDB
Projects
Education
```

The system calculates:

```text
Readiness: 76
Status: READY
```

and identifies:

```text
Skill Gap:
Spring Boot
System Design
```

\---

## Step 2 — Recruiter

Recruiter uploads:

```text
Software\_Engineer\_JD.pdf
```

CampusLink extracts:

```text
Java
SQL
DSA
Spring Boot

Minimum CGPA: 7.5
Eligible Branches: CSE / IT
```

\---

## Step 3 — Matching

The system processes the 200-student dataset.

```text
200 Students
      ↓
Eligibility Filtering
      ↓
74 Eligible
      ↓
Skill + Semantic Matching
      ↓
Top Candidates
```

Example:

```text
Rahul      91%
Priya      88%
Ankit      86%
Sneha      84%
```

\---

## Step 4 — Explainability

The recruiter opens Rahul's result.

```text
MATCH: 91%

✓ Java
✓ SQL
✓ DSA
✓ Relevant project
✓ CGPA eligible

⚠ Spring Boot gap
```

The system explains the factors contributing to the match.

\---

## Step 5 — Placement Drive

Three or more simulated drives are created.

Example:

```text
TCS       10:00 AM
Amazon    10:00 AM
Infosys   11:00 AM
```

Rahul is shortlisted for TCS and Amazon.

CampusLink detects:

```text
⚠ Student scheduling conflict
```

and provides an alternative scheduling arrangement based on available slots.

\---

## Step 6 — Selection \& Offer

Rahul is selected.

The placement officer updates:

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

\---

## Step 7 — Placement Command Center

The placement officer sees:

```text
Students             200
Placement Ready      137
Active Drives          3
Offers                42

Placement Conversion  68.5%

High-Risk Students    18
```

The officer can inspect branch, skill, recruiter, drive, offer, and student-level information.





21\. Implementation Phases



\## Phase 1 — Foundation

\- Project setup

\- Database setup

\- Core data models

\- Basic UI

\- Authentication



\## Phase 2 — Placement Core

\- Student profiles

\- Recruiter jobs

\- Applications

\- Placement drives

\- Offers



\## Phase 3 — AI Intelligence

\- Resume parsing

\- JD parsing

\- Skill extraction

\- Semantic matching

\- Candidate ranking

\- Explainability



\## Phase 4 — Placement Operations

\- Readiness analysis

\- Skill-gap analysis

\- Scheduling conflict detection

\- Notifications

\- Analytics



\## Phase 5 — Testing \& Demo

\- Generate 200-student dataset

\- Create 3–5 simulated drives

\- Evaluate matching and scoring

\- Test complete workflow

\- Deploy application

\- Prepare final demonstration







The following values are illustrative examples. During the final

demonstration, these values should be generated from the actual

prototype dataset and system calculations.





# Final Product Principle

CampusLink should follow one central principle:

> \*\*AI should assist placement decisions, not replace them.\*\*

The system should provide:

**Better information → Better matching → Better coordination → Better visibility**

rather than presenting AI-generated scores as unquestionable decisions.


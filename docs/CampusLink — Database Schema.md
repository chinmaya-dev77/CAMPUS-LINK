# CampusLink
## Database Schema

**Document:** Database Schema  
**Version:** 1.0  
**Status:** Draft for Team Review  
**Database:** MongoDB  
**Related Documents:**
- PRD.md
- ARCHITECTURE.md

---

# 1. Database Overview

CampusLink uses MongoDB as its primary persistent database.

The database stores information required for:

- Student profiles
- Recruiters
- Job requirements
- Applications
- Placement drives
- Candidate matching
- Readiness analysis
- Assessments
- Offers
- Documents
- Notifications
- Placement analytics

The database is designed around the placement lifecycle:

```text id="qjryxu"
Student
   ↓
Application
   ↓
Job
   ↓
Placement Drive
   ↓
Selection
   ↓
Offer
   ↓
Joining
```

AI-generated structured information is stored so that expensive AI processing does not need to be repeated unnecessarily.

---

# 2. Collections

The initial database contains the following collections:

```text id="fr35re"
users
students
recruiters
jobs
applications
drives
offers
assessments
notifications
```

Some AI-related information is stored inside the relevant documents rather than creating separate collections.

For example:

```text id="xgqk1n"
Student
 ├── readiness
 ├── skillProfile
 └── embeddings

Job
 ├── requirements
 └── embeddings
```

This keeps the prototype database simple.

---

# 3. Users Collection

The `users` collection handles authentication and user roles.

## Schema

```js id="9b8n9s"
{
  _id: ObjectId,

  name: String,

  email: String,

  passwordHash: String,

  role: String, // "student" | "recruiter" | "placement"

  isActive: Boolean,

  createdAt: Date,

  updatedAt: Date
}
```

## Role

Possible values:

```text id="x5h5eo"
student
recruiter
placement
```

The role determines which dashboard and permissions the user receives.

---

# 4. Students Collection

The `students` collection contains the placement profile of each student.

## Schema

```js id="yl8y5f"
{
  _id: ObjectId,

  userId: ObjectId,

  name: String,

  email: String,

  phone: String,

  branch: String,

  graduationYear: Number,

  cgpa: Number,

  backlogs: Number,

  resume: {
    fileName: String,
    fileUrl: String,
    uploadedAt: Date
  },

  skills: [
    {
      name: String,
      level: String
    }
  ],

  projects: [
    {
      title: String,
      description: String,
      technologies: [String],
      role: String
    }
  ],

  certifications: [
    {
      name: String,
      issuer: String,
      issueDate: Date
    }
  ],

  experience: [
    {
      company: String,
      role: String,
      description: String,
      startDate: Date,
      endDate: Date
    }
  ],

  education: [
    {
      institution: String,
      degree: String,
      field: String,
      startYear: Number,
      endYear: Number
    }
  ],

  readiness: {
    score: Number,
    category: String,
    technicalSkillsScore: Number,
    projectsScore: Number,
    academicScore: Number,
    assessmentScore: Number,
    interviewScore: Number,
    improvementAreas: [String],
    calculatedAt: Date
  },

  skillGaps: [
    {
      role: String,
      missingSkills: [String],
      identifiedAt: Date
    }
  ],

  embeddings: {
    profile: [Number],
    projects: [Number]
  },

  placementStatus: String,

  createdAt: Date,

  updatedAt: Date
}
```

---

# 5. Student Readiness

Readiness is stored inside the student document.

Example:

```js id="9btx4y"
{
  score: 76,

  category: "Ready",

  technicalSkillsScore: 82,

  projectsScore: 75,

  academicScore: 84,

  assessmentScore: 70,

  interviewScore: 68,

  improvementAreas: [
    "Spring Boot",
    "System Design"
  ],

  calculatedAt: ISODate(...)
}
```

The prototype readiness categories are:

```text id="wh0nha"
0–49    → Not Ready
50–69   → Developing
70–84   → Ready
85–100  → Highly Employable
```

These are prototype categories rather than universally validated employability standards.

---

# 6. Recruiters Collection

The `recruiters` collection represents companies/recruiter accounts.

## Schema

```js id="y6p4yy"
{
  _id: ObjectId,

  userId: ObjectId,

  companyName: String,

  recruiterName: String,

  email: String,

  phone: String,

  industry: String,

  companyDescription: String,

  website: String,

  createdAt: Date,

  updatedAt: Date
}
```

---

# 7. Jobs Collection

A job represents a recruitment requirement created by a recruiter.

## Schema

```js id="fz8k4h"
{
  _id: ObjectId,

  recruiterId: ObjectId,

  title: String,

  description: String,

  source: String, // "manual" | "pdf"

  jdFile: {
    fileName: String,
    fileUrl: String
  },

  requirements: {

    requiredSkills: [String],

    preferredSkills: [String],

    minimumCGPA: Number,

    eligibleBranches: [String],

    maximumBacklogs: Number,

    mandatoryRequirements: [String]
  },

  embeddings: {
    jobDescription: [Number],
    requiredSkills: [Number]
  },

  matchingWeights: {

    skillMatch: Number,

    semanticMatch: Number,

    projectRelevance: Number,

    academicFit: Number,

    assessmentEvidence: Number
  },

  status: String, // "draft" | "active" | "closed"

  createdAt: Date,

  updatedAt: Date
}
```

---

# 8. Job Requirements

Example:

```js id="kj4y8x"
{
  requiredSkills: [
    "Java",
    "SQL",
    "DSA"
  ],

  preferredSkills: [
    "Spring Boot",
    "Docker"
  ],

  minimumCGPA: 7.5,

  eligibleBranches: [
    "CSE",
    "IT"
  ],

  maximumBacklogs: 0,

  mandatoryRequirements: []
}
```

The structured requirement may be generated from a JD using Groq or entered manually.

Both workflows must produce the same structure.

---

# 9. Applications Collection

The `applications` collection connects students with jobs.

## Schema

```js id="0d3h7p"
{
  _id: ObjectId,

  studentId: ObjectId,

  jobId: ObjectId,

  recruiterId: ObjectId,

  driveId: ObjectId,

  status: String,

  eligibility: {
    isEligible: Boolean,

    reasons: [String]
  },

  matching: {

    finalScore: Number,

    skillMatch: Number,

    semanticMatch: Number,

    projectRelevance: Number,

    academicFit: Number,

    assessmentEvidence: Number,

    rank: Number,

    strengths: [String],

    skillGaps: [String]
  },

  appliedAt: Date,

  updatedAt: Date
}
```

---

# 10. Application Status

Possible states:

```text id="e83iqh"
Applied
Eligible
Ineligible
Shortlisted
Rejected
Interview
Selected
Offer
Withdrawn
```

The exact state transitions will be enforced by backend logic.

---

# 11. Matching Data

The matching result is stored inside the application.

Example:

```js id="1a4jv7"
{
  finalScore: 91,

  skillMatch: 95,

  semanticMatch: 88,

  projectRelevance: 90,

  academicFit: 100,

  assessmentEvidence: 80,

  rank: 1,

  strengths: [
    "Java",
    "SQL",
    "DSA",
    "Relevant backend project"
  ],

  skillGaps: [
    "Spring Boot"
  ]
}
```

This allows the recruiter to inspect why a candidate received the score.

---

# 12. Placement Drives Collection

A drive represents a scheduled recruitment event.

## Schema

```js id="n3w3z5"
{
  _id: ObjectId,

  jobId: ObjectId,

  recruiterId: ObjectId,

  companyName: String,

  role: String,

  date: Date,

  startTime: String,

  endTime: String,

  venue: String,

  mode: String, // "online" | "offline"

  interviewStages: [
    {
      name: String,
      order: Number
    }
  ],

  eligibleCandidates: [
    ObjectId
  ],

  shortlistedCandidates: [
    ObjectId
  ],

  selectedCandidates: [
    ObjectId
  ],

  status: String,

  conflicts: [
    {
      type: String,
      studentId: ObjectId,
      relatedDriveId: ObjectId,
      description: String
    }
  ],

  createdAt: Date,

  updatedAt: Date
}
```

---

# 13. Drive Status

Possible states:

```text id="g0k9wi"
Upcoming
Active
Completed
Cancelled
```

---

# 14. Scheduling Conflicts

Conflicts should be generated by deterministic backend logic.

Example:

```js id="bd9fce"
{
  type: "STUDENT_TIME_CONFLICT",

  studentId: ObjectId("..."),

  relatedDriveId: ObjectId("..."),

  description:
    "Student is scheduled for two drives during overlapping time periods."
}
```

Possible conflict types:

```text id="vifgwm"
STUDENT_TIME_CONFLICT
VENUE_TIME_CONFLICT
RESOURCE_CONFLICT
PANEL_CONFLICT
```

---

# 15. Offers Collection

The `offers` collection stores the post-selection lifecycle.

## Schema

```js id="a0g5qa"
{
  _id: ObjectId,

  studentId: ObjectId,

  recruiterId: ObjectId,

  jobId: ObjectId,

  driveId: ObjectId,

  companyName: String,

  role: String,

  ctc: Number,

  offerStatus: String,

  joiningDate: Date,

  documents: [
    {
      name: String,
      fileUrl: String,
      status: String
    }
  ],

  createdAt: Date,

  updatedAt: Date
}
```

---

# 16. Offer Status

The offer lifecycle is:

```text id="z7z0qg"
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

The backend should prevent invalid state transitions.

---

# 17. Assessments Collection

Assessments store aptitude, mock interview, or other evaluation results.

## Schema

```js id="r5o9kc"
{
  _id: ObjectId,

  studentId: ObjectId,

  type: String,

  score: Number,

  totalMarks: Number,

  percentage: Number,

  skillsEvaluated: [String],

  feedback: [String],

  takenAt: Date
}
```

Possible assessment types:

```text id="8ob3de"
Aptitude
Technical
Coding
Mock Interview
Soft Skills
```

---

# 18. Notifications Collection

Notifications support placement-related communication.

## Schema

```js id="z6z4ar"
{
  _id: ObjectId,

  userId: ObjectId,

  type: String,

  title: String,

  message: String,

  relatedEntity: {
    entityType: String,
    entityId: ObjectId
  },

  isRead: Boolean,

  createdAt: Date
}
```

Possible notification types:

```text id="zw5v9b"
Drive
Shortlist
Interview
Offer
Document
Announcement
Conflict
```

---

# 19. AI-Generated Data

AI-generated information should be stored as structured data.

For example:

```text id="sy0l7v"
Resume
   ↓
Groq
   ↓
Structured Profile
   ↓
Student.skills
Student.projects
Student.certifications
```

The raw LLM response should not become the application's source of truth.

The validated structured representation becomes the source used by application logic.

---

# 20. Embedding Storage

The initial prototype will store embeddings within the relevant student/job documents.

Student:

```js id="z5j2qa"
{
  embeddings: {
    profile: [Number],
    projects: [Number]
  }
}
```

Job:

```js id="s8q4s6"
{
  embeddings: {
    jobDescription: [Number],
    requiredSkills: [Number]
  }
}
```

A dedicated vector database is not required for the initial prototype.

If the system later grows significantly, vector storage can be reconsidered.

---

# 21. Relationships

The primary relationships are:

```text id="qf8rju"
User
 │
 ├──────── Student
 │
 ├──────── Recruiter
 │
 └──────── Placement Officer
```

Student:

```text id="h2fl8j"
Student
   │
   ├──── Applications
   │
   ├──── Assessments
   │
   ├──── Drives
   │
   └──── Offers
```

Recruiter:

```text id="wm7q70"
Recruiter
   │
   ├──── Jobs
   │
   ├──── Drives
   │
   └──── Offers
```

Job:

```text id="5kyr3b"
Job
   │
   ├──── Applications
   │
   └──── Placement Drive
```

---

# 22. Relationship Diagram

```text id="e5b3jc"
                    ┌───────────┐
                    │   User    │
                    └─────┬─────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        ┌───────────┐           ┌────────────┐
        │  Student  │           │ Recruiter  │
        └─────┬─────┘           └──────┬─────┘
              │                        │
              │                        ▼
              │                     ┌──────┐
              │                     │ Job  │
              │                     └──┬───┘
              │                        │
              ▼                        ▼
        ┌─────────────┐         ┌─────────────┐
        │ Application │────────▶│    Drive    │
        └─────────────┘         └──────┬──────┘
                                       │
                                       ▼
                                  ┌─────────┐
                                  │  Offer  │
                                  └─────────┘

Student ────────▶ Assessment
Student ────────▶ Notification
```

---

# 23. Indexing Strategy

Indexes should be added to fields frequently used for queries.

Initial indexes:

```text id="z9q2sh"
users.email

students.userId
students.branch
students.cgpa

recruiters.userId

jobs.recruiterId
jobs.status

applications.studentId
applications.jobId
applications.driveId
applications.status

drives.jobId
drives.recruiterId
drives.date

offers.studentId
offers.recruiterId
offers.offerStatus

assessments.studentId

notifications.userId
notifications.isRead
```

Unique indexes should be used where appropriate.

For example:

```text id="8l8f4v"
users.email → unique
```

---

# 24. Data Validation

Backend validation is required before data is stored.

Examples:

```text id="3d5f8u"
CGPA must be within valid range.

Backlogs cannot be negative.

Required job fields must be present.

Application must reference an existing student and job.

Offer must reference a valid selected candidate.

Drive end time must be after start time.
```

AI-generated structured data must also be validated before storage.

---

# 25. Synthetic Dataset Requirements

The prototype database will support approximately:

```text id="xv3rj1"
Students:        200
Recruiters:      5–10
Jobs:            8–15
Drives:          3–5
Skills:          30–50
```

The synthetic data should intentionally contain:

```text id="5h5x3h"
Strong matches
Eligible candidates with skill gaps
Academically eligible but weak matches
Ineligible candidates
Students with overlapping drives
Students with different readiness levels
Different placement outcomes
```

The data must not represent real student personal information.

---

# 26. Data Lifecycle

The main data lifecycle is:

```text id="d9g6v4"
Resume
   ↓
Student Profile
   ↓
Readiness
   ↓
Job Matching
   ↓
Application
   ↓
Placement Drive
   ↓
Selection
   ↓
Offer
   ↓
Joining
   ↓
Analytics
```

This lifecycle connects the three major CampusLink stakeholders.

---

# 27. Database Design Principles

CampusLink should follow these database principles:

### 1. Store structured AI output

Do not repeatedly parse the same resume or JD.

### 2. Keep business state explicit

Application, drive, and offer statuses should be stored explicitly.

### 3. Keep matching factors

Store individual matching factors rather than only the final score.

### 4. Keep prototype data simple

Do not introduce unnecessary collections or complex database infrastructure.

### 5. Validate all incoming data

Both user-generated and AI-generated data must be validated.

### 6. Use references for major entities

Students, recruiters, jobs, applications, drives, and offers should use MongoDB references where appropriate.

---

# 28. Database Decision Summary

| Component | Decision |
|---|---|
| Database | MongoDB |
| Students | Separate collection |
| Recruiters | Separate collection |
| Jobs | Separate collection |
| Applications | Separate collection |
| Drives | Separate collection |
| Offers | Separate collection |
| Assessments | Separate collection |
| Notifications | Separate collection |
| Readiness | Embedded in Student |
| Skill Gaps | Embedded in Student |
| Matching Factors | Embedded in Application |
| Embeddings | Stored with Student/Job |
| AI Raw Output | Not source of truth |
| Vector DB | Not required initially |
| Dataset | Synthetic |
| Target Students | 200 |

---

# 29. Database Principle

The database should represent the actual placement lifecycle:

**Student → Opportunity → Application → Drive → Selection → Offer → Joining → Analytics**

while keeping AI-generated information structured, reusable, explainable, and separate from deterministic business decisions.
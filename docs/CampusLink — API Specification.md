# CampusLink — API Specification

**Version:** 1.0  
**Status:** Draft for Implementation  
**Architecture:** React + Node.js/Express + MongoDB  
**AI:** Groq + Embeddings  
**ML:** Python/Scikit-learn service  
**API Style:** REST  
**Base Path:** `/api`

---

# 1. Purpose

This document defines the API contract between the CampusLink frontend, backend, AI processing components, ML service, and MongoDB.

The API is designed around the CampusLink workflow:

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

The Node.js/Express backend is the primary API layer and source of truth.

AI and ML services assist the backend but do not directly control business workflows.

---

# 2. API Design Principles

## 2.1 REST-based

All client-facing APIs use REST-style HTTP endpoints.

Example:

```text
GET    /api/jobs
POST   /api/jobs
GET    /api/jobs/:id
PATCH  /api/jobs/:id
DELETE /api/jobs/:id
```

---

## 2.2 Backend is the source of truth

The frontend must never directly modify MongoDB or make business decisions.

```text
React
  ↓
Express API
  ↓
Services
  ↓
MongoDB / AI / ML
```

---

## 2.3 AI is selective

Groq is used for tasks such as:

- Resume understanding
- JD understanding
- Skill extraction
- Natural-language explanations
- Recommendation text

AI must not be responsible for:

- Final eligibility decisions
- Final matching score calculation
- Scheduling conflicts
- Offer status transitions
- Database authorization
- Critical business rules

---

## 2.4 Structured responses

Successful responses should follow a consistent structure.

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Job not found"
  }
}
```

---

# 3. Base URL

Development:

```text
http://localhost:5000/api
```

Production:

```text
/api
```

The frontend should use an environment variable:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

---

# 4. Authentication

Authentication is required for protected APIs.

## 4.1 Register

```http
POST /api/auth/register
```

### Request

```json
{
  "name": "Rahul Kumar",
  "email": "rahul@example.com",
  "password": "password123",
  "role": "student"
}
```

Supported roles:

```text
student
recruiter
placement
```

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "name": "Rahul Kumar",
      "email": "rahul@example.com",
      "role": "student"
    }
  },
  "message": "Registration successful"
}
```

---

# 5. Authentication APIs

## POST `/api/auth/login`

Authenticates a user.

### Request

```json
{
  "email": "rahul@example.com",
  "password": "password123"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "token": "JWT_TOKEN",
    "user": {
      "id": "user_123",
      "name": "Rahul Kumar",
      "email": "rahul@example.com",
      "role": "student"
    }
  }
}
```

---

## GET `/api/auth/me`

Returns the currently authenticated user.

### Response

```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "Rahul Kumar",
    "email": "rahul@example.com",
    "role": "student"
  }
}
```

---

# 6. Student APIs

## GET `/api/students/:id`

Returns the student's complete profile.

### Response

```json
{
  "success": true,
  "data": {
    "id": "student_123",
    "name": "Rahul Kumar",
    "email": "rahul@example.com",
    "branch": "CSE",
    "graduationYear": 2027,
    "cgpa": 8.5,
    "backlogs": 0,
    "skills": [
      "Java",
      "JavaScript",
      "React",
      "Node.js",
      "MongoDB"
    ],
    "projects": [],
    "certifications": [],
    "readiness": {
      "score": 76,
      "category": "Ready"
    },
    "skillGaps": [
      "Spring Boot",
      "System Design"
    ]
  }
}
```

---

## PATCH `/api/students/:id`

Updates editable student information.

### Request

```json
{
  "phone": "9876543210",
  "branch": "CSE",
  "cgpa": 8.6,
  "backlogs": 0
}
```

---

# 7. Resume APIs

## POST `/api/students/:id/resume`

Uploads a student's resume.

### Content Type

```text
multipart/form-data
```

### Request

```text
resume: resume.pdf
```

### Processing flow

```text
PDF
 ↓
Text Extraction
 ↓
Groq Resume Parser
 ↓
Structured Profile
 ↓
Validation
 ↓
MongoDB
 ↓
Embedding Generation
```

### Response

```json
{
  "success": true,
  "data": {
    "resume": {
      "fileName": "rahul_resume.pdf",
      "status": "processed"
    },
    "profile": {
      "skills": ["Java", "React", "Node.js"],
      "projects": [],
      "certifications": [],
      "experience": []
    }
  },
  "message": "Resume processed successfully"
}
```

---

## GET `/api/students/:id/resume`

Returns the student's stored resume information.

---

# 8. Readiness APIs

## POST `/api/students/:id/readiness/analyze`

Runs the readiness analysis.

### Flow

```text
Student Profile
      ↓
Readiness Engine
      ↓
Technical Skills
Projects
Academic
Assessment
Interview
      ↓
Weighted Score
      ↓
Category + Skill Gaps
```

### Response

```json
{
  "success": true,
  "data": {
    "score": 76,
    "category": "Ready",
    "breakdown": {
      "technicalSkills": 82,
      "projects": 75,
      "academic": 85,
      "assessment": 68,
      "interview": 70
    },
    "skillGaps": [
      "Spring Boot",
      "System Design"
    ],
    "recommendations": [
      "Complete a Spring Boot project",
      "Practice system design fundamentals"
    ]
  }
}
```

---

## GET `/api/students/:id/readiness`

Returns the most recent readiness result.

---

## GET `/api/students/:id/skill-gaps`

Returns identified skill gaps.

### Response

```json
{
  "success": true,
  "data": {
    "skillGaps": [
      {
        "skill": "Spring Boot",
        "priority": "high",
        "reason": "Required by several target roles"
      },
      {
        "skill": "System Design",
        "priority": "medium",
        "reason": "Frequently required for software engineering roles"
      }
    ]
  }
}
```

---

# 9. Student Job Recommendation APIs

## GET `/api/students/:id/recommendations`

Returns jobs relevant to the student.

### Response

```json
{
  "success": true,
  "data": [
    {
      "jobId": "job_123",
      "title": "Software Engineer",
      "company": "TechCorp",
      "matchScore": 84,
      "eligibility": true,
      "strengths": [
        "Java",
        "React",
        "Problem Solving"
      ],
      "skillGaps": [
        "Spring Boot"
      ]
    }
  ]
}
```

---

# 10. Recruiter APIs

## POST `/api/recruiters`

Creates a recruiter profile.

### Request

```json
{
  "companyName": "TechCorp",
  "industry": "Technology",
  "contactName": "HR Manager",
  "contactEmail": "hr@techcorp.com"
}
```

---

## GET `/api/recruiters/:id`

Returns recruiter information.

---

## PATCH `/api/recruiters/:id`

Updates recruiter information.

---

# 11. Job APIs

## POST `/api/jobs`

Creates a job manually.

### Request

```json
{
  "recruiterId": "rec_123",
  "title": "Software Engineer",
  "description": "Looking for software engineering graduates",
  "requirements": {
    "branches": ["CSE", "IT"],
    "minimumCGPA": 7.0,
    "maximumBacklogs": 0,
    "skills": [
      "Java",
      "Spring Boot",
      "SQL"
    ],
    "certifications": [],
    "experience": "Fresher"
  }
}
```

---

## POST `/api/jobs/upload-jd`

Uploads a Job Description PDF.

### Content Type

```text
multipart/form-data
```

### Flow

```text
JD PDF
 ↓
Text Extraction
 ↓
Groq JD Parser
 ↓
Structured Requirements
 ↓
Validation
 ↓
MongoDB
 ↓
Embedding
```

### Response

```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "status": "processed",
    "requirements": {
      "branches": ["CSE", "IT"],
      "minimumCGPA": 7.0,
      "skills": [
        "Java",
        "Spring Boot",
        "SQL"
      ]
    }
  }
}
```

---

## GET `/api/jobs`

Returns available jobs.

### Optional query parameters

```text
/api/jobs?status=active
/api/jobs?recruiterId=rec_123
```

---

## GET `/api/jobs/:id`

Returns complete job information.

---

## PATCH `/api/jobs/:id`

Updates job information.

---

## DELETE `/api/jobs/:id`

Removes/deactivates a job.

---

# 12. Eligibility API

## POST `/api/jobs/:id/check-eligibility`

Checks students against deterministic eligibility requirements.

### Request

```json
{
  "studentIds": [
    "student_1",
    "student_2",
    "student_3"
  ]
}
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "studentId": "student_1",
      "eligible": true,
      "reasons": []
    },
    {
      "studentId": "student_2",
      "eligible": false,
      "reasons": [
        "CGPA below minimum requirement"
      ]
    }
  ]
}
```

Eligibility must be calculated by backend rules.

The LLM must not make the final eligibility decision.

---

# 13. Matching APIs

## POST `/api/jobs/:id/match`

Runs candidate matching for a job.

### Request

```json
{
  "studentIds": [
    "student_1",
    "student_2",
    "student_3"
  ]
}
```

If `studentIds` is omitted, the backend may evaluate all eligible students.

### Matching flow

```text
Students
   ↓
Eligibility Filter
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

### Matching weights

```text
Skill Match                 40%
Semantic Match              25%
Project Relevance           15%
Academic Fit                10%
Assessment/Profile Evidence 10%
```

### Response

```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "totalCandidates": 200,
    "eligibleCandidates": 74,
    "matchedCandidates": [
      {
        "studentId": "student_41",
        "rank": 1,
        "matchScore": 91,
        "factors": {
          "skillMatch": 95,
          "semanticMatch": 90,
          "projectRelevance": 92,
          "academicFit": 85,
          "assessmentEvidence": 88
        },
        "strengths": [
          "Java",
          "SQL",
          "Backend development"
        ],
        "skillGaps": [
          "Spring Boot"
        ]
      }
    ]
  }
}
```

---

# 14. Candidate Ranking API

## GET `/api/jobs/:id/candidates`

Returns ranked candidates for a job.

### Query parameters

```text
/api/jobs/job_123/candidates?limit=20
/api/jobs/job_123/candidates?minScore=70
```

### Response

```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "candidates": [
      {
        "rank": 1,
        "studentId": "student_41",
        "name": "Rahul Kumar",
        "matchScore": 91,
        "eligible": true,
        "strengths": [
          "Java",
          "SQL"
        ],
        "skillGaps": [
          "Spring Boot"
        ]
      }
    ]
  }
}
```

---

# 15. Match Explanation API

## GET `/api/jobs/:jobId/candidates/:studentId/explanation`

Returns an explanation for a student's match.

### Response

```json
{
  "success": true,
  "data": {
    "matchScore": 91,
    "summary": "Strong match for the role",
    "strengths": [
      "Strong Java experience",
      "Relevant backend project",
      "Meets academic eligibility"
    ],
    "gaps": [
      "Limited Spring Boot experience"
    ]
  }
}
```

The explanation may be generated or refined using Groq, but the underlying score must come from the matching engine.

---

# 16. Application APIs

## POST `/api/applications`

Creates an application.

### Request

```json
{
  "studentId": "student_123",
  "jobId": "job_123",
  "driveId": "drive_123"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "applicationId": "app_123",
    "status": "Applied"
  }
}
```

---

## GET `/api/applications/:id`

Returns application details.

---

## GET `/api/students/:id/applications`

Returns all applications for a student.

---

## GET `/api/jobs/:id/applications`

Returns applications for a job.

---

## PATCH `/api/applications/:id/status`

Updates application status.

Example:

```json
{
  "status": "Shortlisted"
}
```

Possible statuses:

```text
Applied
Eligible
Shortlisted
Interview
Selected
Rejected
Withdrawn
```

---

# 17. Drive APIs

## POST `/api/drives`

Creates a placement drive.

### Request

```json
{
  "jobId": "job_123",
  "recruiterId": "rec_123",
  "companyName": "TechCorp",
  "role": "Software Engineer",
  "date": "2026-10-15",
  "startTime": "10:00",
  "endTime": "16:00",
  "venue": "Seminar Hall",
  "mode": "offline",
  "interviewStages": [
    "Aptitude",
    "Technical",
    "HR"
  ]
}
```

---

## GET `/api/drives`

Returns placement drives.

### Filters

```text
/api/drives?status=scheduled
/api/drives?date=2026-10-15
```

---

## GET `/api/drives/:id`

Returns drive details.

---

## PATCH `/api/drives/:id`

Updates drive information.

---

## DELETE `/api/drives/:id`

Cancels/deactivates a drive.

---

# 18. Scheduling & Conflict APIs

## POST `/api/drives/:id/check-conflicts`

Checks for scheduling conflicts.

### Request

```json
{
  "studentIds": [
    "student_1",
    "student_2",
    "student_3"
  ]
}
```

### Conflict types

```text
STUDENT_OVERLAP
VENUE_OVERLAP
PANEL_OVERLAP
RESOURCE_OVERLAP
```

### Response

```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "type": "STUDENT_OVERLAP",
        "studentId": "student_41",
        "existingDriveId": "drive_10",
        "newDriveId": "drive_12",
        "message": "Student is scheduled for overlapping drives"
      }
    ]
  }
}
```

Conflict detection is deterministic.

---

## GET `/api/drives/conflicts`

Returns currently detected scheduling conflicts.

---

# 19. Shortlisting API

## POST `/api/drives/:id/shortlist`

Creates or updates the shortlist for a drive.

### Request

```json
{
  "studentIds": [
    "student_41",
    "student_72",
    "student_105"
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "driveId": "drive_123",
    "shortlisted": 3
  }
}
```

---

# 20. Offer APIs

## POST `/api/offers`

Creates an offer record.

### Request

```json
{
  "studentId": "student_41",
  "recruiterId": "rec_123",
  "jobId": "job_123",
  "driveId": "drive_123",
  "company": "TechCorp",
  "role": "Software Engineer",
  "ctc": 800000,
  "joiningDate": "2027-07-01"
}
```

### Initial status

```text
Selected
```

---

## GET `/api/offers`

Returns offers.

### Filters

```text
/api/offers?studentId=student_41
/api/offers?status=Accepted
/api/offers?company=TechCorp
```

---

## GET `/api/offers/:id`

Returns offer details.

---

## PATCH `/api/offers/:id/status`

Updates offer status.

### Request

```json
{
  "status": "Accepted"
}
```

Allowed lifecycle:

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

The backend should validate legal state transitions.

---

## PATCH `/api/offers/:id/documents`

Updates document status.

### Request

```json
{
  "documents": [
    {
      "name": "Resume",
      "status": "verified"
    },
    {
      "name": "ID Proof",
      "status": "pending"
    }
  ]
}
```

---

# 21. Assessment APIs

## POST `/api/assessments`

Creates an assessment result.

### Request

```json
{
  "studentId": "student_41",
  "type": "aptitude",
  "score": 82,
  "maxScore": 100
}
```

---

## GET `/api/students/:id/assessments`

Returns assessment history.

---

## PATCH `/api/assessments/:id`

Updates an assessment.

---

# 22. Notification APIs

## POST `/api/notifications`

Creates a notification.

### Request

```json
{
  "userId": "user_123",
  "type": "DRIVE_UPDATE",
  "title": "Interview Scheduled",
  "message": "Your technical interview is scheduled for 10:00 AM."
}
```

---

## GET `/api/notifications`

Returns notifications for the authenticated user.

---

## PATCH `/api/notifications/:id/read`

Marks a notification as read.

---

# 23. Analytics APIs

Analytics are primarily calculated from MongoDB data.

---

## GET `/api/analytics/overview`

Returns placement-cell overview.

### Response

```json
{
  "success": true,
  "data": {
    "totalStudents": 200,
    "activeRecruiters": 8,
    "activeJobs": 12,
    "activeDrives": 4,
    "studentsPlaced": 82,
    "offersAccepted": 71,
    "averageCTC": 650000
  }
}
```

---

## GET `/api/analytics/branches`

Returns branch-wise placement statistics.

### Response

```json
{
  "success": true,
  "data": [
    {
      "branch": "CSE",
      "students": 80,
      "placed": 42,
      "placementRate": 52.5
    }
  ]
}
```

---

## GET `/api/analytics/skills`

Returns skill demand and availability.

### Response

```json
{
  "success": true,
  "data": [
    {
      "skill": "Java",
      "studentCount": 112,
      "jobDemand": 9,
      "gap": 0
    }
  ]
}
```

---

## GET `/api/analytics/compensation`

Returns compensation statistics.

```json
{
  "success": true,
  "data": {
    "averageCTC": 650000,
    "highestCTC": 1200000,
    "lowestCTC": 350000,
    "distribution": []
  }
}
```

---

## GET `/api/analytics/risk`

Returns prototype student-risk information.

```json
{
  "success": true,
  "data": [
    {
      "studentId": "student_52",
      "riskLevel": "high",
      "riskScore": 78,
      "factors": [
        "Low assessment performance",
        "Multiple skill gaps"
      ]
    }
  ]
}
```

Risk predictions are prototype outputs based on the available synthetic/simulated data and are not statistically or institutionally validated.

---

# 24. AI/ML Internal APIs

These endpoints are primarily backend/service-to-service APIs.

They should not normally be exposed directly to the public frontend.

---

## POST `/api/ai/parse-resume`

### Request

```json
{
  "text": "Extracted resume text..."
}
```

### Response

```json
{
  "skills": [],
  "projects": [],
  "certifications": [],
  "education": [],
  "experience": []
}
```

---

## POST `/api/ai/parse-jd`

### Request

```json
{
  "text": "Extracted job description..."
}
```

### Response

```json
{
  "title": "Software Engineer",
  "skills": [
    "Java",
    "Spring Boot",
    "SQL"
  ],
  "minimumCGPA": 7,
  "branches": [
    "CSE",
    "IT"
  ]
}
```

---

## POST `/api/ai/explain-match`

### Request

```json
{
  "studentProfile": {},
  "jobRequirements": {},
  "matchingFactors": {}
}
```

### Response

```json
{
  "summary": "Strong match for the role",
  "strengths": [],
  "gaps": [],
  "recommendations": []
}
```

---

# 25. ML Service API

The Python ML service is separate from the public frontend API.

Node communicates with it internally.

```text
Node.js
   ↓ HTTP
Python ML Service
   ↓
Scikit-learn Model
```

---

## POST `/predict/readiness`

### Request

```json
{
  "technicalSkills": 82,
  "projects": 75,
  "academic": 85,
  "assessment": 68,
  "interview": 70
}
```

### Response

```json
{
  "score": 76,
  "category": "Ready"
}
```

---

## POST `/predict/risk`

### Request

```json
{
  "cgpa": 6.8,
  "assessmentScore": 52,
  "skillGapCount": 5,
  "applicationCount": 2
}
```

### Response

```json
{
  "riskScore": 72,
  "riskLevel": "high"
}
```

The exact ML features and model depend on the final prototype dataset and model implementation.

---

# 26. Error Handling

All APIs should return a consistent error structure.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "CGPA must be between 0 and 10",
    "details": []
  }
}
```

## Common error codes

```text
VALIDATION_ERROR
AUTHENTICATION_REQUIRED
AUTHORIZATION_FAILED
RESOURCE_NOT_FOUND
DUPLICATE_RESOURCE
FILE_UPLOAD_ERROR
AI_PROCESSING_ERROR
ML_SERVICE_ERROR
CONFLICT_DETECTED
INVALID_STATE_TRANSITION
INTERNAL_SERVER_ERROR
```

---

# 27. HTTP Status Codes

| Status | Meaning |
|---|---|
| 200 | Successful request |
| 201 | Resource created |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Permission denied |
| 404 | Resource not found |
| 409 | Conflict |
| 422 | Validation failure |
| 500 | Internal server error |
| 503 | AI/ML service unavailable |

---

# 28. Role-Based Access

The backend must enforce role permissions.

### Student

Can:

```text
View own profile
Upload own resume
View own readiness
View recommendations
Apply to eligible jobs
View applications
View drives
View own offers
View notifications
```

### Recruiter

Can:

```text
Manage recruiter profile
Create jobs
Upload JDs
View candidate rankings
View candidate explanations
Create/manage drives
Shortlist candidates
Manage offers
```

### Placement Cell

Can:

```text
View students
View recruiters
Manage jobs
Manage drives
Detect conflicts
View applications
Manage offers
View analytics
Manage notifications
```

The frontend may hide unavailable actions, but authorization must ultimately be enforced by the backend.

---

# 29. Core API Flow — Student

```text
POST /auth/register
        ↓
POST /students/:id/resume
        ↓
AI parses resume
        ↓
Student profile stored
        ↓
POST /students/:id/readiness/analyze
        ↓
Readiness calculated
        ↓
GET /students/:id/skill-gaps
        ↓
GET /students/:id/recommendations
        ↓
POST /applications
```

---

# 30. Core API Flow — Recruiter

```text
POST /jobs
       OR
POST /jobs/upload-jd
       ↓
JD parsed
       ↓
Requirements stored
       ↓
POST /jobs/:id/check-eligibility
       ↓
POST /jobs/:id/match
       ↓
GET /jobs/:id/candidates
       ↓
Candidate explanation
       ↓
POST /drives
       ↓
POST /drives/:id/check-conflicts
       ↓
POST /drives/:id/shortlist
```

---

# 31. Core API Flow — Placement Cell

```text
GET /analytics/overview
        ↓
GET /drives
        ↓
GET /drives/conflicts
        ↓
GET /applications
        ↓
GET /offers
        ↓
GET /analytics/branches
        ↓
GET /analytics/skills
        ↓
GET /analytics/risk
```

---

# 32. End-to-End Demo Flow

The complete hackathon demonstration should exercise the APIs in this sequence:

```text
1. Student uploads resume
          ↓
2. Resume parsed
          ↓
3. Student profile generated
          ↓
4. Readiness calculated
          ↓
5. Skill gaps identified
          ↓
6. Recruiter uploads JD
          ↓
7. JD parsed
          ↓
8. Eligibility calculated
          ↓
9. Candidates matched
          ↓
10. Candidates ranked
          ↓
11. Reasons displayed
          ↓
12. Drive created
          ↓
13. Conflict detected
          ↓
14. Shortlist generated
          ↓
15. Interview/drive conducted
          ↓
16. Candidate selected
          ↓
17. Offer created
          ↓
18. Offer accepted
          ↓
19. Documents verified
          ↓
20. Analytics updated
```

---

# 33. API Layer Structure

The backend should follow this structure:

```text
backend/
│
├── routes/
│   ├── auth.routes.js
│   ├── student.routes.js
│   ├── recruiter.routes.js
│   ├── job.routes.js
│   ├── application.routes.js
│   ├── drive.routes.js
│   ├── offer.routes.js
│   ├── assessment.routes.js
│   ├── analytics.routes.js
│   ├── notification.routes.js
│   └── ai.routes.js
│
├── controllers/
│
├── services/
│   ├── resume.service.js
│   ├── jd.service.js
│   ├── matching.service.js
│   ├── readiness.service.js
│   ├── scheduling.service.js
│   ├── offer.service.js
│   └── analytics.service.js
│
├── models/
│
├── middleware/
│   ├── auth.middleware.js
│   ├── role.middleware.js
│   ├── error.middleware.js
│   └── upload.middleware.js
│
├── ai/
│   ├── groq.service.js
│   ├── embedding.service.js
│   └── prompts/
│
├── utils/
│
└── server.js
```

---

# 34. Important Implementation Rule

Controllers should remain thin.

Bad:

```text
Route
 ↓
Huge controller
 ↓
Everything happens here
```

Preferred:

```text
Route
 ↓
Controller
 ↓
Service
 ├── Database
 ├── AI
 ├── Matching
 └── Validation
 ↓
Response
```

Example:

```javascript
router.post(
    "/jobs/:id/match",
    authMiddleware,
    roleMiddleware("recruiter", "placement"),
    matchCandidates
);
```

Controller:

```javascript
const matchCandidates = async (req, res, next) => {
    try {
        const result = await matchingService.matchCandidates(
            req.params.id,
            req.body.studentIds
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};
```

Business logic belongs inside the service layer.

---

# 35. API Security Rules

1. Secrets must never be sent to React.
2. Groq API keys remain server-side.
3. ML service should not be publicly exposed.
4. Passwords must never be returned in API responses.
5. Role authorization must happen on the backend.
6. Uploaded files must be validated.
7. User-provided text must be sanitized where necessary.
8. API errors must not expose stack traces in production.
9. Matching and eligibility results must be generated server-side.
10. Students must not be able to modify recruiter or placement-cell data.

---

# 36. API Performance Rules

For the prototype:

- Do not repeatedly parse the same resume.
- Do not repeatedly parse the same JD.
- Cache/store extracted structured data.
- Cache embeddings.
- Avoid sending the entire student database to Groq.
- Perform deterministic eligibility filtering before expensive semantic matching.
- Perform matching in batches where appropriate.
- Store calculated match results instead of recalculating on every page load.
- Use MongoDB indexes for frequently queried fields.

Recommended matching flow:

```text
200 students
     ↓
Eligibility filter
     ↓
~70–100 eligible
     ↓
Embedding/skill comparison
     ↓
Top candidates
     ↓
Explanation generation only when needed
```

This reduces unnecessary AI calls.

---

# 37. API Versioning

Initial prototype:

```text
/api/...
```

Future production version:

```text
/api/v1/...
```

Versioning is intentionally kept simple for the hackathon prototype.

---

# 38. Final API Architecture

```text
                    React
                      │
                      ▼
              Node + Express
                      │
       ┌──────────────┼──────────────┐
       │              │              │
       ▼              ▼              ▼
   MongoDB          Groq       Python ML
       │              │              │
       │         Resume/JD       Prediction
       │         Explanation
       │
       ▼
Placement Intelligence
       │
 ┌─────┼──────┬─────────┬─────────┐
 ▼     ▼      ▼         ▼         ▼
Match Schedule Offers Analytics Notifications
```

---

# 39. API Design Principle

The CampusLink backend follows one central rule:

> **AI understands, algorithms calculate, and the backend decides according to defined business rules.**

Therefore:

```text
Groq
→ Understands unstructured information

Embeddings
→ Measure semantic similarity

ML
→ Produces predictive signals

Deterministic backend
→ Eligibility
→ Matching score calculation
→ Scheduling
→ Offer lifecycle
→ Permissions
→ Workflow
```

This keeps the system explainable, controllable, and suitable for the hackathon prototype.
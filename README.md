# CampusLink

**AI-Powered Campus-to-Corporate Placement Intelligence & Management Platform**

CampusLink is a platform designed to connect three major stakeholders in the campus placement ecosystem: Students, Recruiters, and College Placement Cells. The system relies on a modular monolith architecture using Node.js for backend logic, MongoDB for data storage, standard HTML/JS for the frontend, and provider-neutral AI abstractions along with Python for ML models.

## Project Structure

- `frontend/`: HTML, CSS, Vanilla JS
- `backend/`: Node.js Express API and Mongoose models
- `ml-service/`: Python Flask service for Scikit-learn models
- `docs/`: Product Requirements, System Architecture, API Specs, AI Rules, Implementation Plan
- `data/`: Synthetic JSON datasets and DB seeding script

## Running the Application

### 1. Database

Ensure MongoDB is running locally or provide a valid URI in `backend/.env`.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```
The API server will run on `http://localhost:5000`.

### 3. Frontend

The frontend consists of static HTML files. No build tools are required. You can serve them using any simple static file server:

```bash
cd frontend
# Using Python
python -m http.server 3000
# OR using Node.js
npx serve -p 3000
```
Open `http://localhost:3000/index.html` in your browser.

### 4. ML Service

*Note: The ML service functionality is implemented in Phase 13.*

```bash
cd ml-service
python -m venv venv
# Windows: venv\Scripts\activate | Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```
The ML service will run on `http://localhost:8000`.

## Architecture Note

See the `docs/` directory for exhaustive documentation of the APIs, schemas, AI rules, and overall architecture.

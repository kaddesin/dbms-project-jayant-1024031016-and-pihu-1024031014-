# 🎓 University Examination & Result Processing System
### UCS310 — DBMS Project | Thapar Institute of Engineering & Technology
**Group:** Jayant Kaushik (1024031016) & Pihu (1024031014) | Batch 2C72 | Sem 4, Jan–June 2026  
**Submitted to:** Ms. Gayatri Saxena

---

## Prerequisites
- Node.js v16+
- PostgreSQL 13+
- npm

---

## Setup in 3 Steps

### Step 1 — Create the database & load the schema

```bash
# Open psql as the postgres superuser
psql -U postgres

# Inside psql:
CREATE DATABASE exam_db;
\c exam_db
\i path/to/your/dbms_project.sql    -- Run your full SQL file here
\q
```

### Step 2 — Configure DB credentials

Edit `.env` in the project folder:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exam_db
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD_HERE
PORT=3000
```

### Step 3 — Install dependencies and start

```bash
cd exam-system
npm install
npm start
```

Open your browser at → **http://localhost:3000**

---

## Project Structure
```
exam-system/
├── server.js          ← Express + PostgreSQL API server
├── package.json
├── .env               ← DB credentials (do not commit this)
└── public/
    └── index.html     ← Full interactive frontend
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/kpi` | Dashboard summary numbers |
| GET | `/api/students` | All students (filter: dept, status, search) |
| GET | `/api/students/:id/subjects` | Subject-wise marks for one student |
| GET | `/api/departments` | Department stats & pass rates |
| GET | `/api/departments/:dept/students` | Students in a department |
| GET | `/api/toppers` | Top SGPA per dept per semester |
| GET | `/api/toppers/overall?limit=10` | Overall top N students |
| GET | `/api/backlogs` | All F-grade subjects |
| GET | `/api/analytics/grades` | Grade distribution |
| GET | `/api/analytics/subjects` | Subject-wise averages |
| GET | `/api/analytics/dept-pass` | Pass % per department |
| GET | `/api/analytics/sgpa-distribution` | SGPA bucket distribution |
| GET | `/api/analytics/internal-external` | Scatter data for marks |
| GET | `/api/schema` | Live DB schema from information_schema |
| POST | `/api/result/process/:sid/:sem` | Re-run ProcessResult procedure |

---

## Features
- **Live DB connection** — all data fetched from your PostgreSQL database in real time
- **Student search & filter** — by department, pass/fail status, and name
- **Subject-wise marks** — internal + external breakdown with grades for every student
- **Department analytics** — pass rates, avg SGPA, topper lists
- **Backlog tracker** — all failed subjects across all students
- **Analytics charts** — grade distribution, SGPA histogram, scatter plot, subject averages
- **Live DB schema** — pulled directly from PostgreSQL's `information_schema`
- **Triggers & procedures** displayed — validate_marks, calculate_total, ProcessResult, etc.

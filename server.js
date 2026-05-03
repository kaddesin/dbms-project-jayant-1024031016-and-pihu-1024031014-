// ============================================================
//  UNIVERSITY EXAM RESULT SYSTEM — Express + PostgreSQL Server
//  Run: node server.js
//  Requires: npm install express pg cors
// ============================================================

const express = require('express');
const { Pool }  = require('pg');
const cors      = require('cors');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database connection ──────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌  DB connection failed:', err.message);
    console.error('    Make sure PostgreSQL is running and DB credentials are correct.');
    process.exit(1);
  }
  release();
  console.log('✅  Connected to PostgreSQL');
});

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper ───────────────────────────────────────────────────
const query = (sql, params = []) => pool.query(sql, params);

// ============================================================
//  API ROUTES
// ============================================================

// GET /api/kpi  — summary numbers for the dashboard
app.get('/api/kpi', async (req, res) => {
  try {
    const totalStudents = await query('SELECT COUNT(*) AS cnt FROM Student');
    const passCount     = await query("SELECT COUNT(*) AS cnt FROM Result WHERE ResultStatus='PASS'");
    const failCount     = await query("SELECT COUNT(*) AS cnt FROM Result WHERE ResultStatus='FAIL'");
    const subjectCount  = await query('SELECT COUNT(*) AS cnt FROM Subject');
    const examCount     = await query('SELECT COUNT(*) AS cnt FROM Exam');

    res.json({
      totalStudents : parseInt(totalStudents.rows[0].cnt),
      passCount     : parseInt(passCount.rows[0].cnt),
      failCount     : parseInt(failCount.rows[0].cnt),
      subjectCount  : parseInt(subjectCount.rows[0].cnt),
      examCount     : parseInt(examCount.rows[0].cnt),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/students?dept=&status=&search=  — full result cards
app.get('/api/students', async (req, res) => {
  try {
    const { dept, status, search } = req.query;
    let sql = `
      SELECT
        st.StudentID   AS studentid,
        st.Name        AS name,
        d.DeptName     AS dept,
        st.Year        AS year,
        r.Semester     AS semester,
        r.SGPA         AS sgpa,
        r.CGPA         AS cgpa,
        r.ResultStatus AS status,
        ROUND(
          SUM(m.TotalMarks)::NUMERIC * 100 / (COUNT(m.SubjectID) * 100), 2
        )                AS pct
      FROM Student st
      JOIN Department d  ON st.DeptID   = d.DeptID
      JOIN Result     r  ON st.StudentID = r.StudentID
      JOIN Marks      m  ON st.StudentID = m.StudentID
      JOIN Subject    s  ON m.SubjectID  = s.SubjectID
                        AND s.Semester   = r.Semester
      WHERE 1=1
    `;
    const params = [];
    if (dept)   { params.push(dept);          sql += ` AND d.DeptName = $${params.length}`; }
    if (status) { params.push(status);        sql += ` AND r.ResultStatus = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND st.Name ILIKE $${params.length}`; }
    sql += ' GROUP BY st.StudentID, st.Name, d.DeptName, st.Year, r.Semester, r.SGPA, r.CGPA, r.ResultStatus ORDER BY d.DeptName, r.SGPA DESC';

    const students = await query(sql, params);
    res.json(students.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/students/:id/subjects  — per-student subject breakdown
app.get('/api/students/:id/subjects', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT
        sub.SubjectName                  AS subjectname,
        sub.Credits                      AS credits,
        m.InternalMarks                  AS internal,
        m.ExternalMarks                  AS external,
        m.TotalMarks                     AS total,
        GetGrade(m.TotalMarks, 100)      AS grade,
        GetGradePoint(m.TotalMarks, 100) AS gradepoint
      FROM Marks m
      JOIN Subject sub ON m.SubjectID = sub.SubjectID
      WHERE m.StudentID = $1
      ORDER BY sub.Semester, sub.SubjectName
    `, [id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/departments  — dept summary stats
app.get('/api/departments', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        d.DeptName                                                          AS dept,
        d.HOD                                                               AS hod,
        COUNT(DISTINCT st.StudentID)                                        AS totalstudents,
        SUM(CASE WHEN r.ResultStatus='PASS' THEN 1 ELSE 0 END)             AS passed,
        SUM(CASE WHEN r.ResultStatus='FAIL' THEN 1 ELSE 0 END)             AS failed,
        ROUND(AVG(r.SGPA), 2)                                              AS avgsgpa,
        ROUND(AVG(r.CGPA), 2)                                              AS avgcgpa,
        ROUND(
          SUM(CASE WHEN r.ResultStatus='PASS' THEN 1 ELSE 0 END)::NUMERIC
          * 100 / COUNT(DISTINCT st.StudentID), 2
        )                                                                   AS passpct
      FROM Department d
      JOIN Student    st ON d.DeptID    = st.DeptID
      JOIN Result     r  ON st.StudentID = r.StudentID
      GROUP BY d.DeptName, d.HOD
      ORDER BY passpct DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/departments/:dept/students  — students for one dept
app.get('/api/departments/:dept/students', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        st.StudentID   AS studentid,
        st.Name        AS name,
        st.Year        AS year,
        r.Semester     AS semester,
        r.SGPA         AS sgpa,
        r.CGPA         AS cgpa,
        r.ResultStatus AS status,
        ROUND(SUM(m.TotalMarks)::NUMERIC * 100 / (COUNT(m.SubjectID) * 100), 2) AS pct
      FROM Student     st
      JOIN Department  d  ON st.DeptID    = d.DeptID
      JOIN Result      r  ON st.StudentID  = r.StudentID
      JOIN Marks       m  ON st.StudentID  = m.StudentID
      JOIN Subject     s  ON m.SubjectID   = s.SubjectID AND s.Semester = r.Semester
      WHERE d.DeptName = $1
      GROUP BY st.StudentID, st.Name, st.Year, r.Semester, r.SGPA, r.CGPA, r.ResultStatus
      ORDER BY r.SGPA DESC
    `, [req.params.dept]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/toppers  — best SGPA per dept per semester
app.get('/api/toppers', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT ON (d.DeptName, r.Semester)
        d.DeptName   AS dept,
        r.Semester   AS semester,
        st.Name      AS name,
        r.SGPA       AS sgpa,
        r.CGPA       AS cgpa,
        ROUND(SUM(m.TotalMarks)::NUMERIC * 100 / (COUNT(m.SubjectID) * 100), 2) AS pct
      FROM Result     r
      JOIN Student    st ON r.StudentID  = st.StudentID
      JOIN Department d  ON st.DeptID   = d.DeptID
      JOIN Marks      m  ON r.StudentID  = m.StudentID
      JOIN Subject    s  ON m.SubjectID  = s.SubjectID AND s.Semester = r.Semester
      GROUP BY d.DeptName, r.Semester, st.Name, r.SGPA, r.CGPA
      ORDER BY d.DeptName, r.Semester, r.SGPA DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/toppers/overall?limit=10
app.get('/api/toppers/overall', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await query(`
      SELECT
        st.StudentID   AS studentid,
        st.Name        AS name,
        d.DeptName     AS dept,
        r.Semester     AS semester,
        r.SGPA         AS sgpa,
        r.CGPA         AS cgpa,
        ROUND(SUM(m.TotalMarks)::NUMERIC * 100 / (COUNT(m.SubjectID) * 100), 2) AS pct
      FROM Result     r
      JOIN Student    st ON r.StudentID  = st.StudentID
      JOIN Department d  ON st.DeptID   = d.DeptID
      JOIN Marks      m  ON r.StudentID  = m.StudentID
      JOIN Subject    s  ON m.SubjectID  = s.SubjectID AND s.Semester = r.Semester
      GROUP BY st.StudentID, st.Name, d.DeptName, r.Semester, r.SGPA, r.CGPA
      ORDER BY r.SGPA DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/backlogs  — students with F grades
app.get('/api/backlogs', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        st.Name                          AS name,
        d.DeptName                       AS dept,
        sub.SubjectName                  AS subjectname,
        m.InternalMarks                  AS internal,
        m.ExternalMarks                  AS external,
        m.TotalMarks                     AS total,
        r.SGPA                           AS sgpa,
        r.ResultStatus                   AS status
      FROM Result     r
      JOIN Student    st  ON r.StudentID  = st.StudentID
      JOIN Department d   ON st.DeptID   = d.DeptID
      JOIN Marks      m   ON r.StudentID  = m.StudentID
      JOIN Subject    sub ON m.SubjectID  = sub.SubjectID
                         AND sub.Semester = r.Semester
      WHERE r.ResultStatus = 'FAIL'
        AND GetGrade(m.TotalMarks, 100) = 'F'
      ORDER BY st.Name, sub.SubjectName
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/grades  — grade distribution
app.get('/api/analytics/grades', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        GetGrade(m.TotalMarks, 100) AS grade,
        COUNT(*)                    AS cnt
      FROM Marks m
      GROUP BY GetGrade(m.TotalMarks, 100)
      ORDER BY cnt DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/subjects  — subject-wise averages
app.get('/api/analytics/subjects', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        sub.SubjectName                           AS subjectname,
        sub.Semester                              AS semester,
        ROUND(AVG(m.InternalMarks), 2)            AS avginternal,
        ROUND(AVG(m.ExternalMarks), 2)            AS avgexternal,
        ROUND(AVG(m.TotalMarks),    2)            AS avgtotal,
        MAX(m.TotalMarks)                         AS highest,
        MIN(m.TotalMarks)                         AS lowest
      FROM Marks   m
      JOIN Subject sub ON m.SubjectID = sub.SubjectID
      GROUP BY sub.SubjectName, sub.Semester
      ORDER BY sub.Semester, sub.SubjectName
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/dept-pass  — pass % per dept
app.get('/api/analytics/dept-pass', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        d.DeptName                                                              AS dept,
        COUNT(*)                                                                AS total,
        SUM(CASE WHEN r.ResultStatus='PASS' THEN 1 ELSE 0 END)                AS passed,
        SUM(CASE WHEN r.ResultStatus='FAIL' THEN 1 ELSE 0 END)                AS failed,
        ROUND(
          SUM(CASE WHEN r.ResultStatus='PASS' THEN 1 ELSE 0 END)::NUMERIC
          * 100 / COUNT(*), 2
        )                                                                       AS passpct
      FROM Result r
      JOIN Student    st ON r.StudentID = st.StudentID
      JOIN Department d  ON st.DeptID   = d.DeptID
      GROUP BY d.DeptName
      ORDER BY passpct DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/sgpa-distribution
app.get('/api/analytics/sgpa-distribution', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        CASE
          WHEN SGPA = 0           THEN '0 (Fail)'
          WHEN SGPA < 5           THEN '4–5'
          WHEN SGPA < 6           THEN '5–6'
          WHEN SGPA < 7           THEN '6–7'
          WHEN SGPA < 8           THEN '7–8'
          WHEN SGPA < 9           THEN '8–9'
          ELSE                         '9–10'
        END                AS bucket,
        COUNT(*)           AS cnt
      FROM Result
      GROUP BY bucket
      ORDER BY MIN(SGPA)
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/analytics/internal-external  — scatter data
app.get('/api/analytics/internal-external', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        st.Name          AS name,
        d.DeptName       AS dept,
        m.InternalMarks  AS internal,
        m.ExternalMarks  AS external,
        m.TotalMarks     AS total
      FROM Marks      m
      JOIN Student    st  ON m.StudentID = st.StudentID
      JOIN Department d   ON st.DeptID   = d.DeptID
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/schema  — table metadata from information_schema
app.get('/api/schema', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        table_name,
        column_name,
        data_type,
        character_maximum_length,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('department','course','student','subject','faculty','exam','marks','result')
      ORDER BY table_name, ordinal_position
    `);
    // Group by table
    const schema = {};
    result.rows.forEach(row => {
      if (!schema[row.table_name]) schema[row.table_name] = [];
      schema[row.table_name].push({
        column  : row.column_name,
        type    : row.data_type,
        nullable: row.is_nullable === 'YES',
      });
    });
    res.json(schema);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/result/process/:studentId/:semester  — re-run ProcessResult
app.post('/api/result/process/:studentId/:semester', async (req, res) => {
  try {
    await query('CALL ProcessResult($1, $2)', [req.params.studentId, req.params.semester]);
    res.json({ message: 'Result processed successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catch-all → serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎓  Exam System running at http://localhost:${PORT}\n`);
});

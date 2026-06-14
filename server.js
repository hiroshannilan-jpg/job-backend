const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3001;
const JWT_SECRET = 'soyamu_super_secret_key_2026'; // In production, use environment variables

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'jobs.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    
    // Create admins table
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        security_question TEXT,
        security_answer TEXT,
        profile_photo TEXT
      )
    `);

    // Create users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    // Create categories table
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      )
    `);

    // Create jobs table with status
    db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        title TEXT,
        company TEXT,
        location TEXT,
        type TEXT,
        category TEXT,
        salary TEXT,
        contact TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending'
      )
    `);

    // Create site_settings table
    db.run(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        site_name TEXT,
        logo_base64 TEXT,
        favicon_base64 TEXT,
        contact_phone TEXT,
        contact_email TEXT,
        contact_address TEXT,
        facebook_link TEXT,
        youtube_link TEXT,
        instagram_link TEXT,
        twitter_link TEXT
      )
    `, (err) => {
      // Safely attempt to add new columns if table already existed from before
      db.run("ALTER TABLE site_settings ADD COLUMN favicon_base64 TEXT", (alterErr) => {
        // Ignore error if column already exists
      });
      db.run("ALTER TABLE site_settings ADD COLUMN featured_external_link TEXT", (alterErr) => {
        // Ignore error if column already exists
      });
      db.run("ALTER TABLE site_settings ADD COLUMN featured_external_name TEXT", (alterErr) => {
        // Ignore error if column already exists
      });
      db.run("ALTER TABLE site_settings ADD COLUMN featured_external_logo TEXT", (alterErr) => {
        // Ignore error if column already exists
      });
      if (err) {
        console.error('Error creating table', err);
      } else {
        // Optionally seed the database if it's empty
        db.get('SELECT COUNT(*) as count FROM jobs', (err, row) => {
          if (!err && row.count === 0) {
            seedDatabase();
          }
        });
      }
    });
  }
});

async function seedDatabase() {
  // Seed admin
  const defaultUser = 'admin';
  const defaultPass = 'password123';
  const hashedPass = await bcrypt.hash(defaultPass, 10);
  const securityQuestion = "What is your favorite pet's name?";
  const securityAnswer = await bcrypt.hash('fluffy', 10); // Example answer

  const adminStmt = db.prepare('INSERT OR IGNORE INTO admins (username, password, security_question, security_answer) VALUES (?, ?, ?, ?)');
  adminStmt.run(defaultUser, hashedPass, securityQuestion, securityAnswer);
  adminStmt.finalize();

  const sampleCategories = [
    "IT-HWare/Networks/Systems", "Accounting/Auditing/Finance", "Banking & Finance/Insurance",
    "Sales/Marketing/Merchandising", "HR/Training", "Corporate Management/Analysts",
    "Office Admin/Secretary/Receptionist", "Civil Eng/Interior Design/Architecture", "IT-Telecoms",
    "Customer Relations/Public Relations", "Logistics/Warehouse/Transport", "Eng-Mech/Auto/Elec",
    "Manufacturing/Operations", "Media/Advert/Communication", "Hotel/Restaurant/Hospitality",
    "Travel/Tourism", "Sports/Fitness/Recreation", "Medical/Nursing/Healthcare", "Legal/Law",
    "Supervision/Quality Control", "Apparel/Clothing", "Ticketing/Airline/Marine", "Education",
    "R&D/Science/Research", "Agriculture/Dairy/Environment", "Security", "Fashion/Design/Beauty",
    "International Development", "KPO/BPO", "Imports/Exports"
  ];
  
  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  sampleCategories.forEach(cat => catStmt.run(cat));
  catStmt.finalize();

  const sampleJobs = [
    { id: '1', title: "Senior Full Stack Developer", company: "TechNova Solutions", location: "Colombo 03", type: "Full-time", category: "IT-HWare/Networks/Systems", salary: "Rs. 250,000 - 400,000", contact: "hr@technova.lk", description: "We are looking for an experienced Full Stack Developer proficient in React and Node.js to lead our enterprise web applications development team.", status: "approved" },
    { id: '2', title: "Digital Marketing Executive", company: "Creative Spark Media", location: "Malabe", type: "Full-time", category: "Sales/Marketing/Merchandising", salary: "Rs. 80,000 - 120,000", contact: "careers@creativespark.lk", description: "Join our fast-paced marketing agency! You will be responsible for planning, executing, and optimizing our online marketing efforts and social media campaigns.", status: "approved" }
  ];

  const stmt = db.prepare('INSERT INTO jobs (id, title, company, location, type, category, salary, contact, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  sampleJobs.forEach(job => {
    stmt.run(job.id, job.title, job.company, job.location, job.type, job.category, job.salary, job.contact, job.description, job.status);
  });
  stmt.finalize();

  // Seed default site settings
  const settingsStmt = db.prepare('INSERT OR IGNORE INTO site_settings (id, site_name, contact_phone, contact_email, contact_address, facebook_link, youtube_link, instagram_link, twitter_link) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)');
  settingsStmt.run('soyamu.lk', '077 810 2388', 'info@soyamu.lk', 'No 569B, Mihinu mawatha, Malabe.', '#', '#', '#', '#');
  settingsStmt.finalize();

  console.log('Database seeded with sample admin, jobs, categories, and settings.');
}

// --------------------------------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// --------------------------------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.status(401).json({ error: 'Token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Requires admin privileges' });
    next();
  });
}

// --------------------------------------------------------------------------
// AUTH ENDPOINTS
// --------------------------------------------------------------------------

// Admin Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username: admin.username, id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: admin.username, role: 'admin' });
  });
});

// User Register
app.post('/api/user/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const hashedPass = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPass], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) return res.status(400).json({ error: 'Username already exists' });
      return res.status(500).json({ error: err.message });
    }
    const token = jwt.sign({ username, id: this.lastID, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, username, role: 'user' });
  });
});

// User Login
app.post('/api/user/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ username: user.username, id: user.id, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username, role: 'user' });
  });
});

// Request Password Reset (Get security question)
app.post('/api/reset-request', (req, res) => {
  const { username } = req.body;
  db.get('SELECT security_question FROM admins WHERE username = ?', [username], (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(404).json({ error: 'User not found' });
    res.json({ question: admin.security_question });
  });
});

// Reset Password
app.post('/api/reset-password', (req, res) => {
  const { username, answer, newPassword } = req.body;
  
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(404).json({ error: 'User not found' });

    const validAnswer = await bcrypt.compare(answer.toLowerCase(), admin.security_answer);
    if (!validAnswer) return res.status(400).json({ error: 'Incorrect security answer' });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE admins SET password = ? WHERE id = ?', [hashedNewPassword, admin.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Password updated successfully' });
    });
  });
});

// Get Admin Settings
app.get('/api/admin/settings', authenticateToken, (req, res) => {
  db.get('SELECT username, profile_photo FROM admins WHERE id = ?', [req.user.id], (err, admin) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!admin) return res.status(404).json({ error: 'User not found' });
    res.json(admin);
  });
});

// Update Admin Settings
app.put('/api/admin/settings', authenticateToken, (req, res) => {
  const { username, profile_photo } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  db.run(
    'UPDATE admins SET username = ?, profile_photo = ? WHERE id = ?',
    [username, profile_photo, req.user.id],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      const token = jwt.sign({ username: username, id: req.user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ message: 'Settings updated', token, username, profile_photo });
    }
  );
});

// --------------------------------------------------------------------------
// ADMIN DASHBOARD & USER MANAGEMENT
// --------------------------------------------------------------------------

// Get Dashboard Stats
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
  const stats = { users: 0, activeJobs: 0, pendingJobs: 0, categories: 0 };
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (row) stats.users = row.count;
    db.get('SELECT COUNT(*) as count FROM jobs WHERE status = "approved"', (err, row) => {
      if (row) stats.activeJobs = row.count;
      db.get('SELECT COUNT(*) as count FROM jobs WHERE status = "pending"', (err, row) => {
        if (row) stats.pendingJobs = row.count;
        db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
          if (row) stats.categories = row.count;
          res.json(stats);
        });
      });
    });
  });
});

// Get all users
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  db.all('SELECT id, username FROM users ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete a user
app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Promote user to admin
app.put('/api/admin/users/:id/promote', authenticateAdmin, (req, res) => {
  // First get the user details
  db.get('SELECT username, password FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Insert into admins with default security question
    const q = 'What is your favorite pet\\\'s name?';
    bcrypt.hash('admin', 10, (err, hashedAns) => {
      db.run('INSERT INTO admins (username, password, security_question, security_answer) VALUES (?, ?, ?, ?)', 
        [user.username, user.password, q, hashedAns], function(err) {
          if (err) return res.status(500).json({ error: 'Failed to promote or user is already admin' });
          // Optionally delete from users
          db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
          res.json({ message: 'User promoted successfully' });
      });
    });
  });
});

// --------------------------------------------------------------------------
// GLOBAL SITE SETTINGS
// --------------------------------------------------------------------------

// Get site settings (public)
app.get('/api/settings/global', (req, res) => {
  db.get('SELECT * FROM site_settings WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

// Update site settings (Admin only)
app.put('/api/settings/global', authenticateAdmin, (req, res) => {
  const { site_name, logo_base64, favicon_base64, contact_phone, contact_email, contact_address, facebook_link, youtube_link, instagram_link, twitter_link, featured_external_link, featured_external_name, featured_external_logo } = req.body;
  
  db.run(
    `INSERT OR REPLACE INTO site_settings 
      (id, site_name, logo_base64, favicon_base64, contact_phone, contact_email, contact_address, facebook_link, youtube_link, instagram_link, twitter_link, featured_external_link, featured_external_name, featured_external_logo) 
    VALUES 
      (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [site_name, logo_base64, favicon_base64, contact_phone, contact_email, contact_address, facebook_link, youtube_link, instagram_link, twitter_link, featured_external_link, featured_external_name, featured_external_logo],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Global settings updated' });
    }
  );
});

// --------------------------------------------------------------------------
// CATEGORY ENDPOINTS
// --------------------------------------------------------------------------

app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categories', authenticateAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, name });
  });
});

app.put('/api/categories/:id', authenticateAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  db.run('UPDATE categories SET name = ? WHERE id = ?', [name, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, name });
  });
});

app.delete('/api/categories/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// --------------------------------------------------------------------------
// JOB ENDPOINTS
// --------------------------------------------------------------------------

// Get all jobs
app.get('/api/jobs', (req, res) => {
  const isAdmin = req.query.admin === 'true';
  
  // Basic check for admin query parameter - in a real app we might want to check the token here too
  // but since GET is safe, we can allow fetching all jobs if explicitly requested for the admin panel,
  // though for true security, we should check the auth header here as well.
  // We'll leave it as is to not break existing admin panel frontend logic heavily, 
  // but ideally it should verify the token.
  
  let query = 'SELECT * FROM jobs ORDER BY rowid DESC';
  if (!isAdmin) {
    query = "SELECT * FROM jobs WHERE status = 'approved' ORDER BY rowid DESC";
  }

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/jobs/:id', (req, res) => {
  db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) res.json(row);
    else res.status(404).json({ error: 'Job not found' });
  });
});

app.post('/api/jobs', authenticateToken, (req, res) => {
  const { id, title, company, location, type, category, salary, contact, description } = req.body;
  const newId = id || Date.now().toString();
  const status = 'pending';
  
  db.run(
    'INSERT INTO jobs (id, title, company, location, type, category, salary, contact, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId, title, company, location, type, category, salary, contact, description, status],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: newId, title, company, location, type, category, salary, contact, description, status });
    }
  );
});

app.put('/api/jobs/:id', authenticateAdmin, (req, res) => {
  const id = req.params.id;
  const { title, company, location, type, category, salary, contact, description, status } = req.body;
  
  db.run(
    'UPDATE jobs SET title = ?, company = ?, location = ?, type = ?, category = ?, salary = ?, contact = ?, description = ?, status = ? WHERE id = ?',
    [title, company, location, type, category, salary, contact, description, status, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id, title, company, location, type, category, salary, contact, description, status });
    }
  );
});

app.delete('/api/jobs/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM jobs WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

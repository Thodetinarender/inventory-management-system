require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const { getDatabase } = require('./src/db');
const authRouter = require('./src/routes/auth');
const productsRouter = require('./src/routes/products');
const dashboardRouter = require('./src/routes/dashboard');
const settingsRouter = require('./src/routes/settings');
const { seed } = require('./src/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const db = getDatabase();

// Auto-seed initial demo dataset if fresh database
try {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (!row || row.count === 0) {
    seed().catch(err => console.error('Initial seeding notice:', err));
  }
} catch (err) {
  // Silent catch on bootstrap
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// App API endpoints
app.use('/api/auth', authRouter(db));
app.use('/api/products', productsRouter(db));
app.use('/api/dashboard', dashboardRouter(db));
app.use('/api/settings', settingsRouter(db));

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Client SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, db };

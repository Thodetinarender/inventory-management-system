const express = require('express');
const crypto = require('crypto');
const { hashPassword, verifyPassword, createToken, requireAuth } = require('../auth');

function authRouter(db) {
  const router = express.Router();

  // Register new tenant and admin user
  router.post('/signup', async (req, res) => {
    try {
      const { email, password, confirmPassword, organizationName } = req.body;

      if (!email || !password || !organizationName) {
        return res.status(400).json({
          success: false,
          error: 'Please provide email, password, and organization name.'
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: 'Invalid email address.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
      }

      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'Passwords do not match.' });
      }

      const cleanOrg = organizationName.trim();
      if (!cleanOrg) {
        return res.status(400).json({ success: false, error: 'Organization name cannot be empty.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existing) {
        return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      }

      const orgId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const passwordHash = await hashPassword(password);

      db.prepare(`
        INSERT INTO organizations (id, name, default_low_stock_threshold, created_at, updated_at)
        VALUES (?, ?, 5, ?, ?)
      `).run(orgId, cleanOrg, timestamp, timestamp);

      db.prepare(`
        INSERT INTO users (id, organization_id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, orgId, cleanEmail, passwordHash, timestamp);

      const token = createToken({
        id: userId,
        email: cleanEmail,
        organizationId: orgId,
        organizationName: cleanOrg
      });

      return res.status(201).json({
        success: true,
        token,
        user: {
          id: userId,
          email: cleanEmail,
          organizationId: orgId,
          organizationName: cleanOrg
        }
      });
    } catch (err) {
      console.error('Registration failed:', err);
      return res.status(500).json({ success: false, error: 'Could not complete registration.' });
    }
  });

  // User login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const record = db.prepare(`
        SELECT u.id, u.email, u.password_hash, u.organization_id, o.name as organization_name, o.default_low_stock_threshold
        FROM users u
        JOIN organizations o ON u.organization_id = o.id
        WHERE u.email = ?
      `).get(cleanEmail);

      if (!record) {
        return res.status(401).json({ success: false, error: 'Incorrect email or password.' });
      }

      const valid = await verifyPassword(password, record.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Incorrect email or password.' });
      }

      const token = createToken({
        id: record.id,
        email: record.email,
        organizationId: record.organization_id,
        organizationName: record.organization_name
      });

      return res.json({
        success: true,
        token,
        user: {
          id: record.id,
          email: record.email,
          organizationId: record.organization_id,
          organizationName: record.organization_name,
          defaultLowStockThreshold: record.default_low_stock_threshold
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, error: 'Login service encountered an issue.' });
    }
  });

  // Fetch current user session
  router.get('/me', requireAuth, (req, res) => {
    try {
      const user = db.prepare(`
        SELECT u.id, u.email, u.organization_id, o.name as organization_name, o.default_low_stock_threshold
        FROM users u
        JOIN organizations o ON u.organization_id = o.id
        WHERE u.id = ? AND u.organization_id = ?
      `).get(req.user.id, req.user.organizationId);

      if (!user) {
        return res.status(404).json({ success: false, error: 'User profile not found.' });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          organizationId: user.organization_id,
          organizationName: user.organization_name,
          defaultLowStockThreshold: user.default_low_stock_threshold
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Unable to retrieve user data.' });
    }
  });

  return router;
}

module.exports = authRouter;

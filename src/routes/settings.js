const express = require('express');
const { requireAuth } = require('../auth');

function settingsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  // Retrieve tenant configuration
  router.get('/', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const org = db.prepare(`
        SELECT id, name, default_low_stock_threshold, created_at, updated_at
        FROM organizations
        WHERE id = ?
      `).get(orgId);

      if (!org) {
        return res.status(404).json({ success: false, error: 'Organization not found.' });
      }

      return res.json({
        success: true,
        data: {
          id: org.id,
          name: org.name,
          defaultLowStockThreshold: org.default_low_stock_threshold !== null ? org.default_low_stock_threshold : 5,
          createdAt: org.created_at,
          updatedAt: org.updated_at
        }
      });
    } catch (err) {
      console.error('Settings fetch error:', err);
      return res.status(500).json({ success: false, error: 'Could not load settings.' });
    }
  });

  // Update tenant configuration
  router.put('/', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const { name, defaultLowStockThreshold } = req.body;

      const current = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
      if (!current) {
        return res.status(404).json({ success: false, error: 'Organization not found.' });
      }

      let threshold = current.default_low_stock_threshold;
      if (defaultLowStockThreshold !== undefined && defaultLowStockThreshold !== null && defaultLowStockThreshold !== '') {
        const parsed = parseInt(defaultLowStockThreshold, 10);
        if (isNaN(parsed) || parsed < 0) {
          return res.status(400).json({ success: false, error: 'Default threshold must be a positive integer.' });
        }
        threshold = parsed;
      }

      let orgName = current.name;
      if (name !== undefined && name !== null) {
        const cleanName = name.trim();
        if (!cleanName) {
          return res.status(400).json({ success: false, error: 'Organization name cannot be empty.' });
        }
        orgName = cleanName;
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE organizations
        SET name = ?, default_low_stock_threshold = ?, updated_at = ?
        WHERE id = ?
      `).run(orgName, threshold, now, orgId);

      const updated = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);

      return res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          id: updated.id,
          name: updated.name,
          defaultLowStockThreshold: updated.default_low_stock_threshold,
          updatedAt: updated.updated_at
        }
      });
    } catch (err) {
      console.error('Update settings failed:', err);
      return res.status(500).json({ success: false, error: 'Could not update settings.' });
    }
  });

  return router;
}

module.exports = settingsRouter;

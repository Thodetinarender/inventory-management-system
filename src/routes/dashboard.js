const express = require('express');
const { requireAuth } = require('../auth');

function dashboardRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    try {
      const orgId = req.user.organizationId;

      const org = db.prepare('SELECT id, name, default_low_stock_threshold FROM organizations WHERE id = ?').get(orgId);
      const threshold = org && org.default_low_stock_threshold !== null ? org.default_low_stock_threshold : 5;

      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_products,
          COALESCE(SUM(quantity_on_hand), 0) as total_quantity_on_hand,
          COALESCE(SUM(quantity_on_hand * cost_price), 0) as total_cost_valuation,
          COALESCE(SUM(quantity_on_hand * selling_price), 0) as total_retail_valuation,
          COALESCE(SUM(CASE WHEN quantity_on_hand <= 0 THEN 1 ELSE 0 END), 0) as out_of_stock_count,
          COALESCE(SUM(CASE WHEN quantity_on_hand <= COALESCE(low_stock_threshold, ?) THEN 1 ELSE 0 END), 0) as low_stock_count
        FROM products
        WHERE organization_id = ?
      `).get(threshold, orgId);

      const lowStockProducts = db.prepare(`
        SELECT 
          id,
          name,
          sku,
          quantity_on_hand,
          low_stock_threshold,
          COALESCE(low_stock_threshold, ?) as effective_threshold,
          selling_price,
          updated_at
        FROM products
        WHERE organization_id = ?
          AND quantity_on_hand <= COALESCE(low_stock_threshold, ?)
        ORDER BY quantity_on_hand ASC, name ASC
      `).all(threshold, orgId, threshold);

      const recentHistory = db.prepare(`
        SELECT 
          a.id, a.change_amount, a.previous_quantity, a.new_quantity, 
          a.note, a.updated_by, a.created_at,
          p.name as product_name, p.sku as product_sku
        FROM stock_adjustments a
        JOIN products p ON a.product_id = p.id
        WHERE a.organization_id = ?
        ORDER BY a.created_at DESC
        LIMIT 6
      `).all(orgId);

      return res.json({
        success: true,
        data: {
          organization: {
            id: org.id,
            name: org.name,
            defaultLowStockThreshold: threshold
          },
          summary: {
            totalProducts: stats.total_products || 0,
            totalQuantityOnHand: stats.total_quantity_on_hand || 0,
            lowStockCount: stats.low_stock_count || 0,
            outOfStockCount: stats.out_of_stock_count || 0,
            totalCostValuation: Math.round((stats.total_cost_valuation || 0) * 100) / 100,
            totalRetailValuation: Math.round((stats.total_retail_valuation || 0) * 100) / 100
          },
          lowStockItems: lowStockProducts,
          recentAdjustments: recentHistory
        }
      });
    } catch (err) {
      console.error('Dashboard load failed:', err);
      return res.status(500).json({ success: false, error: 'Could not load dashboard.' });
    }
  });

  return router;
}

module.exports = dashboardRouter;

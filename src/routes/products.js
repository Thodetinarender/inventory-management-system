const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../auth');

function productsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  function getOrgThreshold(orgId) {
    const org = db.prepare('SELECT default_low_stock_threshold FROM organizations WHERE id = ?').get(orgId);
    return org && org.default_low_stock_threshold !== null ? org.default_low_stock_threshold : 5;
  }

  // Get all products with optional search and stock filters
  router.get('/', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const defaultThreshold = getOrgThreshold(orgId);
      const { search, filter } = req.query;

      let sql = `
        SELECT 
          p.id, p.organization_id, p.name, p.sku, p.description, 
          p.quantity_on_hand, p.cost_price, p.selling_price, 
          p.low_stock_threshold, p.last_updated_by, p.created_at, p.updated_at,
          COALESCE(p.low_stock_threshold, ?) as effective_threshold,
          CASE 
            WHEN p.quantity_on_hand <= COALESCE(p.low_stock_threshold, ?) THEN 1 
            ELSE 0 
          END as is_low_stock
        FROM products p
        WHERE p.organization_id = ?
      `;
      const params = [defaultThreshold, defaultThreshold, orgId];

      if (search && search.trim()) {
        const query = `%${search.trim().toLowerCase()}%`;
        sql += ` AND (LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.description, '')) LIKE ?)`;
        params.push(query, query, query);
      }

      if (filter === 'low_stock') {
        sql += ` AND p.quantity_on_hand <= COALESCE(p.low_stock_threshold, ?)`;
        params.push(defaultThreshold);
      } else if (filter === 'out_of_stock') {
        sql += ` AND p.quantity_on_hand <= 0`;
      } else if (filter === 'in_stock') {
        sql += ` AND p.quantity_on_hand > COALESCE(p.low_stock_threshold, ?)`;
        params.push(defaultThreshold);
      }

      sql += ` ORDER BY p.updated_at DESC, p.created_at DESC`;

      const list = db.prepare(sql).all(...params);

      return res.json({
        success: true,
        data: list,
        meta: {
          total: list.length,
          defaultThreshold
        }
      });
    } catch (err) {
      console.error('Failed to query products:', err);
      return res.status(500).json({ success: false, error: 'Could not fetch products list.' });
    }
  });

  // Get product by id
  router.get('/:id', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const defaultThreshold = getOrgThreshold(orgId);

      const product = db.prepare(`
        SELECT 
          p.*,
          COALESCE(p.low_stock_threshold, ?) as effective_threshold,
          CASE 
            WHEN p.quantity_on_hand <= COALESCE(p.low_stock_threshold, ?) THEN 1 
            ELSE 0 
          END as is_low_stock
        FROM products p
        WHERE p.id = ? AND p.organization_id = ?
      `).get(defaultThreshold, defaultThreshold, req.params.id, orgId);

      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
      }

      const adjustments = db.prepare(`
        SELECT * FROM stock_adjustments 
        WHERE product_id = ? AND organization_id = ?
        ORDER BY created_at DESC LIMIT 10
      `).all(req.params.id, orgId);

      return res.json({
        success: true,
        data: {
          ...product,
          history: adjustments
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to retrieve product details.' });
    }
  });

  // Create new product
  router.post('/', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const userEmail = req.user.email;
      const { name, sku, description, quantityOnHand, costPrice, sellingPrice, lowStockThreshold } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Product name is required.' });
      }
      if (!sku || !sku.trim()) {
        return res.status(400).json({ success: false, error: 'SKU is required.' });
      }

      const cleanName = name.trim();
      const cleanSku = sku.trim().toUpperCase();

      const existingSku = db.prepare('SELECT id FROM products WHERE organization_id = ? AND sku = ?').get(orgId, cleanSku);
      if (existingSku) {
        return res.status(409).json({ success: false, error: `SKU "${cleanSku}" is already taken in your organization.` });
      }

      const qty = parseInt(quantityOnHand, 10);
      const stock = isNaN(qty) ? 0 : Math.max(0, qty);

      const cost = costPrice !== undefined && costPrice !== null && costPrice !== '' ? parseFloat(costPrice) : null;
      const price = sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== '' ? parseFloat(sellingPrice) : null;
      const threshold = lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== ''
        ? Math.max(0, parseInt(lowStockThreshold, 10))
        : null;

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO products (
          id, organization_id, name, sku, description,
          quantity_on_hand, cost_price, selling_price, low_stock_threshold,
          last_updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        orgId,
        cleanName,
        cleanSku,
        description ? description.trim() : null,
        stock,
        isNaN(cost) ? null : cost,
        isNaN(price) ? null : price,
        isNaN(threshold) ? null : threshold,
        userEmail,
        now,
        now
      );

      if (stock > 0) {
        db.prepare(`
          INSERT INTO stock_adjustments (
            id, organization_id, product_id, change_amount, previous_quantity, new_quantity, note, updated_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          orgId,
          id,
          stock,
          0,
          stock,
          'Opening inventory',
          userEmail,
          now
        );
      }

      const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: created
      });
    } catch (err) {
      console.error('Create product failed:', err);
      return res.status(500).json({ success: false, error: 'Could not create product.' });
    }
  });

  // Update existing product
  router.put('/:id', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const userEmail = req.user.email;
      const productId = req.params.id;
      const { name, sku, description, quantityOnHand, costPrice, sellingPrice, lowStockThreshold } = req.body;

      const existing = db.prepare('SELECT * FROM products WHERE id = ? AND organization_id = ?').get(productId, orgId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Product name cannot be empty.' });
      }
      if (!sku || !sku.trim()) {
        return res.status(400).json({ success: false, error: 'SKU cannot be empty.' });
      }

      const cleanName = name.trim();
      const cleanSku = sku.trim().toUpperCase();

      const duplicate = db.prepare('SELECT id FROM products WHERE organization_id = ? AND sku = ? AND id != ?').get(orgId, cleanSku, productId);
      if (duplicate) {
        return res.status(409).json({ success: false, error: `SKU "${cleanSku}" belongs to another product.` });
      }

      const qty = parseInt(quantityOnHand, 10);
      const stock = isNaN(qty) ? existing.quantity_on_hand : Math.max(0, qty);

      const cost = costPrice !== undefined && costPrice !== null && costPrice !== '' ? parseFloat(costPrice) : null;
      const price = sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== '' ? parseFloat(sellingPrice) : null;
      const threshold = lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== ''
        ? Math.max(0, parseInt(lowStockThreshold, 10))
        : null;

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE products SET
          name = ?,
          sku = ?,
          description = ?,
          quantity_on_hand = ?,
          cost_price = ?,
          selling_price = ?,
          low_stock_threshold = ?,
          last_updated_by = ?,
          updated_at = ?
        WHERE id = ? AND organization_id = ?
      `).run(
        cleanName,
        cleanSku,
        description !== undefined ? (description ? description.trim() : null) : existing.description,
        stock,
        isNaN(cost) ? null : cost,
        isNaN(price) ? null : price,
        isNaN(threshold) ? null : threshold,
        userEmail,
        now,
        productId,
        orgId
      );

      if (stock !== existing.quantity_on_hand) {
        const delta = stock - existing.quantity_on_hand;
        db.prepare(`
          INSERT INTO stock_adjustments (
            id, organization_id, product_id, change_amount, previous_quantity, new_quantity, note, updated_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          orgId,
          productId,
          delta,
          existing.quantity_on_hand,
          stock,
          'Direct quantity update from edit form',
          userEmail,
          now
        );
      }

      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

      return res.json({
        success: true,
        message: 'Product updated successfully',
        data: updated
      });
    } catch (err) {
      console.error('Update product error:', err);
      return res.status(500).json({ success: false, error: 'Could not update product.' });
    }
  });

  // Adjust stock level (+/- delta)
  router.post('/:id/adjust-stock', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const userEmail = req.user.email;
      const productId = req.params.id;
      const { adjustment, note } = req.body;

      const delta = parseInt(adjustment, 10);
      if (isNaN(delta) || delta === 0) {
        return res.status(400).json({ success: false, error: 'Please specify a non-zero adjustment amount.' });
      }

      const product = db.prepare('SELECT * FROM products WHERE id = ? AND organization_id = ?').get(productId, orgId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
      }

      const newStock = product.quantity_on_hand + delta;
      if (newStock < 0) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock. Current is ${product.quantity_on_hand}, cannot remove ${Math.abs(delta)}.`
        });
      }

      const now = new Date().toISOString();

      db.prepare(`
        UPDATE products SET
          quantity_on_hand = ?,
          last_updated_by = ?,
          updated_at = ?
        WHERE id = ? AND organization_id = ?
      `).run(newStock, userEmail, now, productId, orgId);

      db.prepare(`
        INSERT INTO stock_adjustments (
          id, organization_id, product_id, change_amount, previous_quantity, new_quantity, note, updated_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        orgId,
        productId,
        delta,
        product.quantity_on_hand,
        newStock,
        note ? note.trim() : (delta > 0 ? `Stock addition (+${delta})` : `Stock reduction (${delta})`),
        userEmail,
        now
      );

      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

      return res.json({
        success: true,
        message: `Inventory updated (${delta > 0 ? '+' : ''}${delta}). Current stock: ${newStock}`,
        data: updated
      });
    } catch (err) {
      console.error('Stock adjustment error:', err);
      return res.status(500).json({ success: false, error: 'Unable to adjust stock.' });
    }
  });

  // Delete product
  router.delete('/:id', (req, res) => {
    try {
      const orgId = req.user.organizationId;
      const productId = req.params.id;

      const product = db.prepare('SELECT * FROM products WHERE id = ? AND organization_id = ?').get(productId, orgId);
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found.' });
      }

      db.prepare('DELETE FROM products WHERE id = ? AND organization_id = ?').run(productId, orgId);

      return res.json({
        success: true,
        message: `Product "${product.name}" (${product.sku}) removed.`
      });
    } catch (err) {
      console.error('Delete error:', err);
      return res.status(500).json({ success: false, error: 'Could not delete product.' });
    }
  });

  return router;
}

module.exports = productsRouter;

const crypto = require('crypto');
const { getDatabase } = require('./db');
const { hashPassword } = require('./auth');

async function seed() {
  const db = getDatabase();
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id, organization_id FROM users WHERE email = ?').get('demo@stockflow.com');
  let orgId;
  let userId;

  if (existing) {
    orgId = existing.organization_id;
    userId = existing.id;
    db.prepare('DELETE FROM products WHERE organization_id = ?').run(orgId);
    db.prepare('DELETE FROM stock_adjustments WHERE organization_id = ?').run(orgId);
  } else {
    orgId = crypto.randomUUID();
    userId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO organizations (id, name, default_low_stock_threshold, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(orgId, 'Apex Retailers Ltd', 5, now, now);

    const passwordHash = await hashPassword('password123');
    db.prepare(`
      INSERT INTO users (id, organization_id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, orgId, 'demo@stockflow.com', passwordHash, now);
  }

  const catalog = [
    {
      name: 'Wireless Ergonomic Keyboard',
      sku: 'KB-WL-001',
      description: 'Bluetooth 5.0 rechargeable keyboard with split layout',
      quantityOnHand: 28,
      costPrice: 950.00,
      sellingPrice: 1999.00,
      lowStockThreshold: 10
    },
    {
      name: 'Ultra HD 4K Webcam 60FPS',
      sku: 'CAM-4K-002',
      description: 'Dual microphone noise cancellation webcam',
      quantityOnHand: 4,
      costPrice: 1800.00,
      sellingPrice: 3499.00,
      lowStockThreshold: 8
    },
    {
      name: 'USB-C Multiport Docking Station',
      sku: 'DOCK-UC-003',
      description: '100W PD passthrough, dual HDMI, Gigabit Ethernet',
      quantityOnHand: 2,
      costPrice: 1400.00,
      sellingPrice: 2899.00,
      lowStockThreshold: null
    },
    {
      name: 'Noise-Cancelling Over-Ear Headphones',
      sku: 'AUD-NC-004',
      description: 'Active noise cancellation with 40h battery life',
      quantityOnHand: 15,
      costPrice: 2400.00,
      sellingPrice: 4999.00,
      lowStockThreshold: 6
    },
    {
      name: 'High-Speed Braided USB-C Cable (2m)',
      sku: 'CAB-UC-005',
      description: 'Durable nylon braided 100W charging cable',
      quantityOnHand: 85,
      costPrice: 120.00,
      sellingPrice: 399.00,
      lowStockThreshold: 20
    },
    {
      name: 'Vertical Ergonomic Optical Mouse',
      sku: 'MOU-VERT-006',
      description: 'Natural handshake position 6-button wireless mouse',
      quantityOnHand: 0,
      costPrice: 450.00,
      sellingPrice: 999.00,
      lowStockThreshold: 5
    },
    {
      name: 'Aluminum Laptop Stand (Adjustable)',
      sku: 'STND-AL-007',
      description: 'Foldable ergonomic laptop riser for desk setup',
      quantityOnHand: 3,
      costPrice: 550.00,
      sellingPrice: 1299.00,
      lowStockThreshold: 5
    },
    {
      name: 'Mechanical Gaming Keyboard RGB',
      sku: 'KB-MECH-008',
      description: 'Linear red switches, per-key RGB backlighting',
      quantityOnHand: 19,
      costPrice: 1600.00,
      sellingPrice: 3299.00,
      lowStockThreshold: 5
    }
  ];

  for (const item of catalog) {
    const prodId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO products (
        id, organization_id, name, sku, description,
        quantity_on_hand, cost_price, selling_price, low_stock_threshold,
        last_updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prodId,
      orgId,
      item.name,
      item.sku,
      item.description,
      item.quantityOnHand,
      item.costPrice,
      item.sellingPrice,
      item.lowStockThreshold,
      'demo@stockflow.com',
      now,
      now
    );

    db.prepare(`
      INSERT INTO stock_adjustments (
        id, organization_id, product_id, change_amount, previous_quantity, new_quantity, note, updated_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      orgId,
      prodId,
      item.quantityOnHand,
      0,
      item.quantityOnHand,
      'Opening stock entry',
      'demo@stockflow.com',
      now
    );
  }

  console.log(`Database seeded with ${catalog.length} items for Apex Retailers Ltd.`);
  console.log('Credentials: demo@stockflow.com / password123');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seed };

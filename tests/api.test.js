const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { initDatabase } = require('../src/db');
const authRouter = require('../src/routes/auth');
const productsRouter = require('../src/routes/products');
const dashboardRouter = require('../src/routes/dashboard');
const settingsRouter = require('../src/routes/settings');

function makeRequest(app, method, url, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers['authorization'] = `Bearer ${token}`;

    const [path, queryString] = url.split('?');
    const req = {
      method,
      url,
      path,
      headers,
      body: body || {},
      query: {},
      params: {}
    };

    if (queryString) {
      const q = new URLSearchParams(queryString);
      q.forEach((v, k) => { req.query[k] = v; });
    }

    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      setHeader(name, val) {
        this.headers[name] = val;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, body: data });
      },
      send(data) {
        resolve({ status: this.statusCode, body: data });
      }
    };

    app.handle(req, res, (err) => {
      if (err) reject(err);
      else resolve({ status: res.statusCode, body: null });
    });
  });
}

function setupTestServer() {
  const db = initDatabase(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter(db));
  app.use('/api/products', productsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/settings', settingsRouter(db));
  return { app, db };
}

test('Inventory API Integration Suite', async (t) => {
  const { app, db } = setupTestServer();

  let tokenOrg1 = null;
  let tokenOrg2 = null;
  let createdProductId = null;

  await t.test('User registration and organization onboarding', async () => {
    const res1 = await makeRequest(app, 'POST', '/api/auth/signup', {
      organizationName: 'Alpha Retailers',
      email: 'owner@alpha.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res1.body.success, true);
    assert.ok(res1.body.token);
    assert.strictEqual(res1.body.user.organizationName, 'Alpha Retailers');
    tokenOrg1 = res1.body.token;

    const res2 = await makeRequest(app, 'POST', '/api/auth/signup', {
      organizationName: 'Beta Electronics',
      email: 'owner@beta.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    assert.strictEqual(res2.status, 201);
    assert.ok(res2.body.token);
    assert.notStrictEqual(res1.body.user.organizationId, res2.body.user.organizationId);
    tokenOrg2 = res2.body.token;

    // Reject duplicate email
    const duplicate = await makeRequest(app, 'POST', '/api/auth/signup', {
      organizationName: 'Duplicate Store',
      email: 'owner@alpha.com',
      password: 'password123',
      confirmPassword: 'password123'
    });
    assert.strictEqual(duplicate.status, 409);
  });

  await t.test('User authentication and JWT issuance', async () => {
    const res = await makeRequest(app, 'POST', '/api/auth/login', {
      email: 'owner@alpha.com',
      password: 'password123'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.email, 'owner@alpha.com');
  });

  await t.test('Product creation and SKU uniqueness per tenant', async () => {
    const res = await makeRequest(app, 'POST', '/api/products', {
      name: 'Wireless Mouse',
      sku: 'MOU-01',
      description: 'Ergonomic optical mouse',
      quantityOnHand: 15,
      costPrice: 450.00,
      sellingPrice: 999.00,
      lowStockThreshold: 5
    }, tokenOrg1);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Wireless Mouse');
    assert.strictEqual(res.body.data.sku, 'MOU-01');
    createdProductId = res.body.data.id;

    // Duplicate SKU in same org rejected
    const dupRes = await makeRequest(app, 'POST', '/api/products', {
      name: 'Another Mouse',
      sku: 'MOU-01',
      quantityOnHand: 2
    }, tokenOrg1);
    assert.strictEqual(dupRes.status, 409);

    // Same SKU in different tenant allowed
    const org2Res = await makeRequest(app, 'POST', '/api/products', {
      name: 'Beta Mouse',
      sku: 'MOU-01',
      quantityOnHand: 50
    }, tokenOrg2);
    assert.strictEqual(org2Res.status, 201);
  });

  await t.test('Cross-tenant data isolation', async () => {
    const list1 = await makeRequest(app, 'GET', '/api/products', null, tokenOrg1);
    assert.strictEqual(list1.status, 200);
    assert.strictEqual(list1.body.data.length, 1);
    assert.strictEqual(list1.body.data[0].name, 'Wireless Mouse');

    const list2 = await makeRequest(app, 'GET', '/api/products', null, tokenOrg2);
    assert.strictEqual(list2.status, 200);
    assert.strictEqual(list2.body.data.length, 1);
    assert.strictEqual(list2.body.data[0].name, 'Beta Mouse');

    const crossRead = await makeRequest(app, 'GET', `/api/products/${createdProductId}`, null, tokenOrg2);
    assert.strictEqual(crossRead.status, 404);
  });

  await t.test('Stock adjustments and boundary validation', async () => {
    const addRes = await makeRequest(app, 'POST', `/api/products/${createdProductId}/adjust-stock`, {
      adjustment: 10,
      note: 'Shipment received'
    }, tokenOrg1);

    assert.strictEqual(addRes.status, 200);
    assert.strictEqual(addRes.body.data.quantity_on_hand, 25);

    const subRes = await makeRequest(app, 'POST', `/api/products/${createdProductId}/adjust-stock`, {
      adjustment: -20,
      note: 'Order dispatch'
    }, tokenOrg1);

    assert.strictEqual(subRes.status, 200);
    assert.strictEqual(subRes.body.data.quantity_on_hand, 5);

    const failRes = await makeRequest(app, 'POST', `/api/products/${createdProductId}/adjust-stock`, {
      adjustment: -10
    }, tokenOrg1);
    assert.strictEqual(failRes.status, 400);
  });

  await t.test('Dashboard metrics and low stock calculation', async () => {
    const dash = await makeRequest(app, 'GET', '/api/dashboard', null, tokenOrg1);
    assert.strictEqual(dash.status, 200);
    assert.strictEqual(dash.body.data.summary.totalProducts, 1);
    assert.strictEqual(dash.body.data.summary.totalQuantityOnHand, 5);
    assert.strictEqual(dash.body.data.summary.lowStockCount, 1);
    assert.strictEqual(dash.body.data.lowStockItems.length, 1);
    assert.strictEqual(dash.body.data.lowStockItems[0].id, createdProductId);
  });

  await t.test('Tenant settings and default threshold fallback', async () => {
    await makeRequest(app, 'POST', '/api/products', {
      name: 'USB Cable',
      sku: 'CAB-01',
      quantityOnHand: 4
    }, tokenOrg1);

    let dash = await makeRequest(app, 'GET', '/api/dashboard', null, tokenOrg1);
    assert.strictEqual(dash.body.data.summary.lowStockCount, 2);

    const setRes = await makeRequest(app, 'PUT', '/api/settings', {
      name: 'Alpha Retail Corp',
      defaultLowStockThreshold: 3
    }, tokenOrg1);
    assert.strictEqual(setRes.status, 200);
    assert.strictEqual(setRes.body.data.defaultLowStockThreshold, 3);
    assert.strictEqual(setRes.body.data.name, 'Alpha Retail Corp');

    dash = await makeRequest(app, 'GET', '/api/dashboard', null, tokenOrg1);
    assert.strictEqual(dash.body.data.summary.lowStockCount, 1);
  });

  await t.test('Product updates and deletion', async () => {
    const updateRes = await makeRequest(app, 'PUT', `/api/products/${createdProductId}`, {
      name: 'Wireless Mouse v2',
      sku: 'MOU-02',
      quantityOnHand: 30,
      costPrice: 500,
      sellingPrice: 1099,
      lowStockThreshold: 10
    }, tokenOrg1);

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.data.name, 'Wireless Mouse v2');
    assert.strictEqual(updateRes.body.data.sku, 'MOU-02');

    const delRes = await makeRequest(app, 'DELETE', `/api/products/${createdProductId}`, null, tokenOrg1);
    assert.strictEqual(delRes.status, 200);

    const checkRes = await makeRequest(app, 'GET', `/api/products/${createdProductId}`, null, tokenOrg1);
    assert.strictEqual(checkRes.status, 404);
  });
});

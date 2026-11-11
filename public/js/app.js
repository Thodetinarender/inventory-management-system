// Global Application State
let state = {
  token: localStorage.getItem('stockflow_token') || null,
  user: JSON.parse(localStorage.getItem('stockflow_user') || 'null'),
  currentView: 'dashboard',
  products: [],
  dashboardData: null,
  productFilter: 'all',
  productSearchTerm: '',
  selectedProductForDelete: null
};

// Modal references
let addProductModal = null;
let editProductModal = null;
let adjustStockModal = null;
let deleteProductModal = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof bootstrap !== 'undefined') {
    addProductModal = new bootstrap.Modal(document.getElementById('modal-add-product'));
    editProductModal = new bootstrap.Modal(document.getElementById('modal-edit-product'));
    adjustStockModal = new bootstrap.Modal(document.getElementById('modal-adjust-stock'));
    deleteProductModal = new bootstrap.Modal(document.getElementById('modal-delete-product'));
  }

  if (state.token && state.user) {
    verifySession();
  } else {
    showAuthView();
  }
});

// API client wrapper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, options);
  const data = await res.json();

  if (res.status === 401) {
    handleLogout('Session expired. Please sign in again.');
    throw new Error(data.error || 'Unauthorized');
  }

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Navigation & views
function navigate(viewName) {
  if (!state.token && viewName !== 'auth') {
    showAuthView();
    return;
  }

  state.currentView = viewName;

  document.getElementById('view-auth').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-products').style.display = 'none';
  document.getElementById('view-settings').style.display = 'none';

  ['dashboard', 'products', 'settings'].forEach(v => {
    const el = document.getElementById(`nav-${v}`);
    if (el) el.classList.toggle('active', v === viewName);
  });

  if (viewName === 'dashboard') {
    document.getElementById('view-dashboard').style.display = 'block';
    loadDashboard();
  } else if (viewName === 'products') {
    document.getElementById('view-products').style.display = 'block';
    loadProducts();
  } else if (viewName === 'settings') {
    document.getElementById('view-settings').style.display = 'block';
    loadSettings();
  }
}

function updateNavUI() {
  const navLinks = document.getElementById('nav-links');
  const authSection = document.getElementById('nav-auth-section');

  if (state.token && state.user) {
    navLinks.style.display = 'flex';
    authSection.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-light text-dark border px-2 py-1">
          <i class="bi bi-building me-1 text-primary"></i> ${escapeHtml(state.user.organizationName || 'Store')}
        </span>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
            <i class="bi bi-person-circle me-1"></i> ${escapeHtml(state.user.email)}
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li><a class="dropdown-item small" href="#" onclick="navigate('settings'); return false;"><i class="bi bi-gear me-2"></i> Settings</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item small text-danger" href="#" onclick="handleLogout(); return false;"><i class="bi bi-box-arrow-right me-2"></i> Sign Out</a></li>
          </ul>
        </div>
      </div>
    `;
  } else {
    navLinks.style.display = 'none';
    authSection.innerHTML = `
      <button class="btn btn-sm btn-outline-primary" onclick="showAuthView('login')">Sign In</button>
      <button class="btn btn-sm btn-primary" onclick="showAuthView('signup')">Sign Up</button>
    `;
  }
}

// Authentication handlers
function showAuthView(form = 'login') {
  document.getElementById('view-auth').style.display = 'flex';
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-products').style.display = 'none';
  document.getElementById('view-settings').style.display = 'none';
  updateNavUI();
  toggleAuthForm(form);
}

function toggleAuthForm(form) {
  const isLogin = form === 'login';
  document.getElementById('form-login').style.display = isLogin ? 'block' : 'none';
  document.getElementById('form-signup').style.display = isLogin ? 'none' : 'block';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-signup').classList.toggle('active', !isLogin);
  hideAuthAlert();
}

function showAuthAlert(msg) {
  const alert = document.getElementById('auth-alert');
  alert.textContent = msg;
  alert.style.display = 'block';
}

function hideAuthAlert() {
  document.getElementById('auth-alert').style.display = 'none';
}

async function verifySession() {
  try {
    const res = await apiRequest('/api/auth/me');
    if (res.success && res.user) {
      state.user = res.user;
      localStorage.setItem('stockflow_user', JSON.stringify(res.user));
      updateNavUI();
      navigate('dashboard');
    }
  } catch (err) {
    handleLogout();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  hideAuthAlert();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await apiRequest('/api/auth/login', 'POST', { email, password });
    if (res.success) {
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('stockflow_token', res.token);
      localStorage.setItem('stockflow_user', JSON.stringify(res.user));
      showToast('Signed in successfully.', 'success');
      updateNavUI();
      navigate('dashboard');
    }
  } catch (err) {
    showAuthAlert(err.message || 'Invalid email or password.');
  }
}

async function fillDemoAndLogin() {
  document.getElementById('login-email').value = 'demo@stockflow.com';
  document.getElementById('login-password').value = 'password123';
  toggleAuthForm('login');
  try {
    const res = await apiRequest('/api/auth/login', 'POST', {
      email: 'demo@stockflow.com',
      password: 'password123'
    });
    if (res.success) {
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('stockflow_token', res.token);
      localStorage.setItem('stockflow_user', JSON.stringify(res.user));
      showToast('Signed in to demo store.', 'success');
      updateNavUI();
      navigate('dashboard');
    }
  } catch (err) {
    showAuthAlert('Demo account could not be found. Please seed the database.');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  hideAuthAlert();
  const organizationName = document.getElementById('signup-org').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('signup-confirm-password').value;

  if (password !== confirmPassword) {
    showAuthAlert('Passwords do not match.');
    return;
  }

  try {
    const res = await apiRequest('/api/auth/signup', 'POST', {
      organizationName,
      email,
      password,
      confirmPassword
    });

    if (res.success) {
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('stockflow_token', res.token);
      localStorage.setItem('stockflow_user', JSON.stringify(res.user));
      showToast('Account created successfully.', 'success');
      updateNavUI();
      navigate('dashboard');
    }
  } catch (err) {
    showAuthAlert(err.message || 'Registration failed.');
  }
}

function handleLogout(msg) {
  state.token = null;
  state.user = null;
  localStorage.removeItem('stockflow_token');
  localStorage.removeItem('stockflow_user');
  showAuthView('login');
  if (msg) showToast(msg, 'info');
}

// Dashboard statistics
async function loadDashboard() {
  try {
    const res = await apiRequest('/api/dashboard');
    if (!res.success) return;

    state.dashboardData = res.data;
    const { summary, lowStockItems, organization, recentAdjustments } = res.data;

    document.getElementById('dash-greeting').textContent = `${organization.name} - Inventory Overview`;

    document.getElementById('kpi-total-products').textContent = (summary.totalProducts || 0).toLocaleString();
    document.getElementById('kpi-total-units').textContent = (summary.totalQuantityOnHand || 0).toLocaleString();
    document.getElementById('kpi-low-stock').textContent = (summary.lowStockCount || 0).toLocaleString();
    document.getElementById('kpi-low-stock-subtext').textContent = summary.outOfStockCount > 0 
      ? `(${summary.outOfStockCount} out of stock)` 
      : 'Stock levels healthy';

    document.getElementById('kpi-retail-value').textContent = formatCurrency(summary.totalRetailValuation);
    document.getElementById('kpi-cost-subtext').textContent = `Cost valuation: ${formatCurrency(summary.totalCostValuation)}`;

    const lowStockTbody = document.getElementById('low-stock-table-body');
    const lowStockEmpty = document.getElementById('low-stock-empty');
    document.getElementById('low-stock-count-badge').textContent = `${lowStockItems.length} items`;

    if (!lowStockItems || lowStockItems.length === 0) {
      lowStockTbody.innerHTML = '';
      lowStockEmpty.style.display = 'block';
    } else {
      lowStockEmpty.style.display = 'none';
      lowStockTbody.innerHTML = lowStockItems.map(item => `
        <tr>
          <td class="fw-semibold text-dark">${escapeHtml(item.name)}</td>
          <td><span class="sku-badge">${escapeHtml(item.sku)}</span></td>
          <td>
            <span class="badge ${item.quantity_on_hand <= 0 ? 'badge-stock-out' : 'badge-stock-low'} fs-6 px-2 py-1">
              ${item.quantity_on_hand} units
            </span>
          </td>
          <td class="text-secondary">
            ${item.low_stock_threshold !== null ? item.low_stock_threshold : `<span class="text-muted">${item.effective_threshold} (Default)</span>`}
          </td>
          <td>
            ${item.quantity_on_hand <= 0 
              ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Out of Stock</span>' 
              : '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Low Stock</span>'}
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-warning fw-medium" onclick="openAdjustStockModal('${item.id}', '${escapeAttr(item.name)}', '${escapeAttr(item.sku)}', ${item.quantity_on_hand})">
              <i class="bi bi-arrow-left-right me-1"></i> Adjust
            </button>
          </td>
        </tr>
      `).join('');
    }

    const activityTbody = document.getElementById('recent-activity-body');
    if (recentAdjustments && recentAdjustments.length > 0) {
      activityTbody.innerHTML = recentAdjustments.map(adj => `
        <tr>
          <td class="text-muted small">${new Date(adj.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td class="fw-medium">${escapeHtml(adj.product_name)} <span class="sku-badge ms-1">${escapeHtml(adj.product_sku)}</span></td>
          <td>
            <span class="badge ${adj.change_amount > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">
              ${adj.change_amount > 0 ? '+' : ''}${adj.change_amount}
            </span>
          </td>
          <td class="small text-muted">${adj.previous_quantity} → <strong>${adj.new_quantity}</strong></td>
          <td class="small text-secondary">${escapeHtml(adj.note || '-')}</td>
          <td class="small text-muted">${escapeHtml(adj.updated_by || 'Admin')}</td>
        </tr>
      `).join('');
    } else {
      activityTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3 small">No recent stock activity.</td></tr>`;
    }

  } catch (err) {
    showToast('Failed to load dashboard: ' + err.message, 'danger');
  }
}

// Product list & actions
async function loadProducts() {
  try {
    let url = `/api/products?`;
    if (state.productFilter && state.productFilter !== 'all') {
      url += `filter=${encodeURIComponent(state.productFilter)}&`;
    }
    if (state.productSearchTerm) {
      url += `search=${encodeURIComponent(state.productSearchTerm)}&`;
    }

    const res = await apiRequest(url);
    if (!res.success) return;

    state.products = res.data;
    renderProductsTable();
  } catch (err) {
    showToast('Failed to load products: ' + err.message, 'danger');
  }
}

function handleProductSearch() {
  state.productSearchTerm = document.getElementById('product-search-input').value.trim();
  loadProducts();
}

function setProductFilter(filterName) {
  state.productFilter = filterName;
  ['all', 'low_stock', 'out_of_stock', 'in_stock'].forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (btn) btn.classList.toggle('active', f === filterName);
  });
  loadProducts();
}

function renderProductsTable() {
  const tbody = document.getElementById('products-table-body');
  const empty = document.getElementById('products-empty');

  if (!state.products || state.products.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = state.products.map(p => {
    let badgeClass = 'badge-stock-healthy';
    let statusText = 'In Stock';

    if (p.quantity_on_hand <= 0) {
      badgeClass = 'badge-stock-out';
      statusText = 'Out of Stock';
    } else if (p.is_low_stock) {
      badgeClass = 'badge-stock-low';
      statusText = 'Low Stock';
    }

    return `
      <tr>
        <td>
          <div class="fw-bold text-dark">${escapeHtml(p.name)}</div>
          ${p.description ? `<div class="small text-muted text-truncate" style="max-width: 280px;">${escapeHtml(p.description)}</div>` : ''}
        </td>
        <td><span class="sku-badge">${escapeHtml(p.sku)}</span></td>
        <td>
          <span class="badge ${badgeClass} fs-6 px-2 py-1">
            ${p.quantity_on_hand} units
          </span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-1">
            <span class="badge ${p.quantity_on_hand <= 0 ? 'bg-danger-subtle text-danger' : (p.is_low_stock ? 'bg-warning-subtle text-warning-emphasis' : 'bg-success-subtle text-success')}">
              ${statusText}
            </span>
            <span class="small text-muted" title="Reorder threshold">
              (≤ ${p.low_stock_threshold !== null ? p.low_stock_threshold : `${p.effective_threshold} default`})
            </span>
          </div>
        </td>
        <td class="fw-semibold">${p.selling_price !== null ? formatCurrency(p.selling_price) : '<span class="text-muted">-</span>'}</td>
        <td class="text-secondary small">${p.cost_price !== null ? formatCurrency(p.cost_price) : '<span class="text-muted">-</span>'}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-warning" title="Adjust Stock" onclick="openAdjustStockModal('${p.id}', '${escapeAttr(p.name)}', '${escapeAttr(p.sku)}', ${p.quantity_on_hand})">
              <i class="bi bi-arrow-left-right"></i>
            </button>
            <button class="btn btn-outline-secondary" title="Edit" onclick="openEditProductModal('${p.id}')">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-danger" title="Delete" onclick="openDeleteProductModal('${p.id}', '${escapeAttr(p.name)}', '${escapeAttr(p.sku)}')">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Product modals
function openAddProductModal() {
  document.getElementById('form-add-product').reset();
  document.getElementById('add-product-alert').style.display = 'none';
  if (addProductModal) addProductModal.show();
}

async function handleCreateProduct(e) {
  e.preventDefault();
  const alertEl = document.getElementById('add-product-alert');
  alertEl.style.display = 'none';

  const payload = {
    name: document.getElementById('add-name').value,
    sku: document.getElementById('add-sku').value,
    description: document.getElementById('add-desc').value,
    quantityOnHand: document.getElementById('add-qty').value,
    lowStockThreshold: document.getElementById('add-threshold').value,
    costPrice: document.getElementById('add-cost').value,
    sellingPrice: document.getElementById('add-price').value
  };

  try {
    const res = await apiRequest('/api/products', 'POST', payload);
    if (res.success) {
      if (addProductModal) addProductModal.hide();
      showToast(`Product "${res.data.name}" added.`, 'success');
      loadProducts();
    }
  } catch (err) {
    alertEl.textContent = err.message || 'Could not add product.';
    alertEl.style.display = 'block';
  }
}

async function openEditProductModal(id) {
  const alertEl = document.getElementById('edit-product-alert');
  alertEl.style.display = 'none';

  try {
    const res = await apiRequest(`/api/products/${id}`);
    if (!res.success) return;
    const p = res.data;

    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-sku').value = p.sku;
    document.getElementById('edit-desc').value = p.description || '';
    document.getElementById('edit-qty').value = p.quantity_on_hand;
    document.getElementById('edit-threshold').value = p.low_stock_threshold !== null ? p.low_stock_threshold : '';
    document.getElementById('edit-cost').value = p.cost_price !== null ? p.cost_price : '';
    document.getElementById('edit-price').value = p.selling_price !== null ? p.selling_price : '';

    if (editProductModal) editProductModal.show();
  } catch (err) {
    showToast('Failed to load product: ' + err.message, 'danger');
  }
}

async function handleUpdateProduct(e) {
  e.preventDefault();
  const alertEl = document.getElementById('edit-product-alert');
  alertEl.style.display = 'none';

  const id = document.getElementById('edit-id').value;
  const payload = {
    name: document.getElementById('edit-name').value,
    sku: document.getElementById('edit-sku').value,
    description: document.getElementById('edit-desc').value,
    quantityOnHand: document.getElementById('edit-qty').value,
    lowStockThreshold: document.getElementById('edit-threshold').value,
    costPrice: document.getElementById('edit-cost').value,
    sellingPrice: document.getElementById('edit-price').value
  };

  try {
    const res = await apiRequest(`/api/products/${id}`, 'PUT', payload);
    if (res.success) {
      if (editProductModal) editProductModal.hide();
      showToast(`Product "${res.data.name}" updated.`, 'success');
      loadProducts();
    }
  } catch (err) {
    alertEl.textContent = err.message || 'Could not update product.';
    alertEl.style.display = 'block';
  }
}

function openAdjustStockModal(id, name, sku, currentQty) {
  document.getElementById('form-adjust-stock').reset();
  document.getElementById('adjust-alert').style.display = 'none';

  document.getElementById('adj-product-id').value = id;
  document.getElementById('adj-current-qty').value = currentQty;
  document.getElementById('adj-display-current-qty').textContent = currentQty;
  document.getElementById('adj-product-name').textContent = name;
  document.getElementById('adj-product-sku').textContent = sku;
  document.getElementById('adj-preview-text').textContent = 'Resulting Stock: ' + currentQty + ' units';

  if (adjustStockModal) adjustStockModal.show();
}

function setAdjustment(amount) {
  document.getElementById('adj-units').value = amount;
  previewAdjustedStock();
}

function previewAdjustedStock() {
  const current = parseInt(document.getElementById('adj-current-qty').value, 10) || 0;
  const change = parseInt(document.getElementById('adj-units').value, 10);
  const preview = document.getElementById('adj-preview-text');

  if (isNaN(change)) {
    preview.textContent = `Resulting Stock: ${current} units`;
    preview.className = 'form-text small';
    return;
  }

  const result = current + change;
  if (result < 0) {
    preview.textContent = `Invalid: Stock cannot be negative (${result} units)`;
    preview.className = 'form-text small text-danger fw-semibold';
  } else {
    preview.textContent = `Resulting Stock: ${current} → ${result} units (${change > 0 ? '+' : ''}${change})`;
    preview.className = 'form-text small text-success fw-semibold';
  }
}

async function handleAdjustStockSubmit(e) {
  e.preventDefault();
  const alertEl = document.getElementById('adjust-alert');
  alertEl.style.display = 'none';

  const id = document.getElementById('adj-product-id').value;
  const adjustment = parseInt(document.getElementById('adj-units').value, 10);
  const note = document.getElementById('adj-note').value;

  if (isNaN(adjustment) || adjustment === 0) {
    alertEl.textContent = 'Please enter a valid non-zero adjustment.';
    alertEl.style.display = 'block';
    return;
  }

  try {
    const res = await apiRequest(`/api/products/${id}/adjust-stock`, 'POST', { adjustment, note });
    if (res.success) {
      if (adjustStockModal) adjustStockModal.hide();
      showToast(res.message, 'success');
      if (state.currentView === 'dashboard') {
        loadDashboard();
      } else {
        loadProducts();
      }
    }
  } catch (err) {
    alertEl.textContent = err.message || 'Could not adjust stock.';
    alertEl.style.display = 'block';
  }
}

function openDeleteProductModal(id, name, sku) {
  state.selectedProductForDelete = { id, name, sku };
  document.getElementById('delete-product-name').textContent = name;
  document.getElementById('delete-product-sku').textContent = sku;
  if (deleteProductModal) deleteProductModal.show();
}

async function executeDeleteProduct() {
  if (!state.selectedProductForDelete) return;
  const { id, name } = state.selectedProductForDelete;

  try {
    const res = await apiRequest(`/api/products/${id}`, 'DELETE');
    if (res.success) {
      if (deleteProductModal) deleteProductModal.hide();
      showToast(`Product "${name}" was deleted.`, 'success');
      loadProducts();
    }
  } catch (err) {
    showToast('Failed to delete product: ' + err.message, 'danger');
  } finally {
    state.selectedProductForDelete = null;
  }
}

// Settings handlers
async function loadSettings() {
  try {
    const res = await apiRequest('/api/settings');
    if (!res.success) return;

    document.getElementById('settings-org-name').value = res.data.name;
    document.getElementById('settings-threshold').value = res.data.defaultLowStockThreshold;
    document.getElementById('settings-status').style.display = 'none';
  } catch (err) {
    showToast('Failed to load settings: ' + err.message, 'danger');
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const name = document.getElementById('settings-org-name').value;
  const defaultLowStockThreshold = document.getElementById('settings-threshold').value;

  try {
    const res = await apiRequest('/api/settings', 'PUT', { name, defaultLowStockThreshold });
    if (res.success) {
      state.user.organizationName = res.data.name;
      state.user.defaultLowStockThreshold = res.data.defaultLowStockThreshold;
      localStorage.setItem('stockflow_user', JSON.stringify(state.user));
      updateNavUI();

      const statusEl = document.getElementById('settings-status');
      statusEl.style.display = 'inline-block';
      setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      showToast('Settings saved successfully.', 'success');
    }
  } catch (err) {
    showToast('Failed to update settings: ' + err.message, 'danger');
  }
}

// Utility functions
function showToast(message, type = 'primary') {
  const container = document.getElementById('toast-container');
  const toastId = 'toast-' + Date.now();

  const icon = type === 'success' ? 'check-circle-fill' : (type === 'danger' ? 'exclamation-octagon-fill' : 'info-circle-fill');
  const bgClass = type === 'success' ? 'text-bg-success' : (type === 'danger' ? 'text-bg-danger' : 'text-bg-primary');

  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi bi-${icon}"></i>
          <span>${escapeHtml(message)}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);
  const el = document.getElementById(toastId);
  if (typeof bootstrap !== 'undefined') {
    const bsToast = new bootstrap.Toast(el, { delay: 4000 });
    bsToast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }
}

function formatCurrency(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '₹0.00';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

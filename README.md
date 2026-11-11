# StockFlow

A minimal multi-tenant inventory management web application. It allows shop owners to manage products, track stock on hand in real-time, get low-stock alerts, and view inventory valuations in Indian Rupees (₹).

Built with Node.js, Express, SQLite, and vanilla JS with Bootstrap 5 on the frontend.

## Key Features

- **Multi-Tenant Isolation:** Users sign up with an organization. All products and inventory data are strictly scoped to that organization.
- **Product Management:** Full CRUD (create, read, update, delete) with unique SKU checks per store.
- **Stock Adjustments:** Quick inline adjustments (+/- units) with audit notes and history log.
- **Low Stock Alerts:** Automatic flags for products falling below their custom threshold or the store-wide default (default: 5 units).
- **Dashboard:** At-a-glance KPI summary (total products, total units, low stock count, retail and cost valuation) and recent stock movements.
- **Auth:** Standard email/password authentication using JWT tokens and bcrypt password hashing.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** SQLite (using the built-in `node:sqlite` module)
- **Frontend:** HTML5, Bootstrap 5.3, Bootstrap Icons
- **Tests:** Node native test runner (`node:test`)

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/Thodetinarender/inventory-management-system.git
cd inventory-management-system
npm install
```

### 2. Seed Sample Data (Optional)

If you want some sample products pre-loaded for testing:

```bash
npm run seed
```

This creates a demo store (*Apex Retailers Ltd*) with 8 products, some low-stock items, and a demo account:

- **Email:** `demo@stockflow.com`
- **Password:** `password123`

*(There is also a "One-Click Demo Sign In" button on the login screen).*

### 3. Run the App

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For local development with auto-restart on file change:

```bash
npm run dev
```

## Running Tests

Run the integration test suite:

```bash
npm test
```

Tests cover user signup/login, multi-tenant isolation, SKU uniqueness, stock adjustments, dashboard calculations, and settings fallback.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register new store and admin user |
| POST | `/api/auth/login` | Login and receive JWT token |
| GET | `/api/auth/me` | Fetch active session profile |
| GET | `/api/products` | List products (supports `?search=` and `?filter=`) |
| POST | `/api/products` | Create a new product |
| GET | `/api/products/:id` | Get product details and stock history |
| PUT | `/api/products/:id` | Update product details |
| DELETE | `/api/products/:id` | Delete a product |
| POST | `/api/products/:id/adjust-stock` | Increment/decrement stock with a note |
| GET | `/api/dashboard` | Get store summary KPIs and low-stock items |
| GET | `/api/settings` | Get organization settings and default threshold |
| PUT | `/api/settings` | Update store name or default threshold |

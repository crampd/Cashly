const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/cashly.db');
const config = require('../config');

// Initialize tables and add new columns if missing
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT DEFAULT 'user'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT,
      name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      address TEXT,
      stripe_customer_id TEXT,
      paypal_customer_id TEXT,
      square_customer_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      role TEXT DEFAULT 'admin'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_email TEXT,
      amount REAL,
      currency TEXT,
      description TEXT,
      status TEXT,
      platform TEXT,
      transaction_id TEXT,
      notified BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add new columns if they don't exist (safe to run every time)
  db.run(`ALTER TABLE invoices ADD COLUMN platform TEXT`, [], () => {});
  db.run(`ALTER TABLE invoices ADD COLUMN transaction_id TEXT`, [], () => {});
  db.run(`ALTER TABLE invoices ADD COLUMN notified BOOLEAN DEFAULT 0`, [], () => {});
});

// --- User Management ---
function addUser(telegram_id, name, role = 'user') {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO users (telegram_id, name, role) VALUES (?, ?, ?)',
      [telegram_id, name, role],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getUser(telegram_id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegram_id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function setUserRole(telegram_id, role) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET role = ? WHERE telegram_id = ?', [role, telegram_id], function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// --- Admins (compatibility, but now use users table) ---
function getAdmins() {
  // Combine .env ADMINS and DB admins
  const envAdmins = config.ADMINS
    ? String(config.ADMINS).split(',').map(x => x.trim())
    : [];
  return new Promise((resolve, reject) => {
    db.all('SELECT telegram_id FROM users WHERE role = "admin"', [], (err, rows) => {
      if (err) reject(err);
      else {
        const dbAdmins = rows.map(r => r.telegram_id);
        const allAdmins = Array.from(new Set([...envAdmins, ...dbAdmins]));
        resolve(allAdmins);
      }
    });
  });
}

function addAdmin(id) {
  return setUserRole(id, 'admin');
}

function removeAdmin(id) {
  return setUserRole(id, 'user');
}

// Role check: check .env ADMINS first, then users table
function getAdminRole(telegram_id) {
  // Check .env ADMINS first
  if (config.ADMINS) {
    const envAdmins = Array.isArray(config.ADMINS)
      ? config.ADMINS
      : String(config.ADMINS).split(',').map(x => x.trim());
    if (envAdmins.includes(String(telegram_id))) {
      return Promise.resolve('admin');
    }
  }
  // Then check users table
  return new Promise((resolve, reject) => {
    db.get('SELECT role FROM users WHERE telegram_id = ?', [telegram_id], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.role : null);
    });
  });
}

function setAdminRole(telegram_id, role) {
  return setUserRole(telegram_id, role);
}

// Customers
function getCustomersByTelegramId(tgId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM customers WHERE telegram_id = ?', [tgId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAllCustomers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM customers', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getCustomerByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getCustomerByStripeId(stripe_customer_id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE stripe_customer_id = ?', [stripe_customer_id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function saveCustomer({ telegram_id, name, email, phone, address, stripe_customer_id, paypal_customer_id, square_customer_id }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO customers 
        (telegram_id, name, email, phone, address, stripe_customer_id, paypal_customer_id, square_customer_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [telegram_id, name, email, phone, address, stripe_customer_id, paypal_customer_id, square_customer_id],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function updateCustomer({ email, name, phone, address, stripe_customer_id, paypal_customer_id, square_customer_id }) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE customers SET name = ?, phone = ?, address = ?, stripe_customer_id = ?, paypal_customer_id = ?, square_customer_id = ? WHERE email = ?`,
      [name, phone, address, stripe_customer_id, paypal_customer_id, square_customer_id, email],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function deleteCustomerByEmail(email) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM customers WHERE email = ?', [email], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function deleteCustomer(email) {
  return deleteCustomerByEmail(email);
}

function searchCustomers(query) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?`,
      [`%${query}%`, `%${query}%`, `%${query}%`],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Invoices
function saveInvoice({ customer_email, amount, currency, description, status, platform, transaction_id, notified }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO invoices (customer_email, amount, currency, description, status, platform, transaction_id, notified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        customer_email,
        amount,
        currency,
        description,
        status,
        platform,
        transaction_id,
        notified ? 1 : 0
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getInvoicesByEmail(email) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM invoices WHERE customer_email = ?', [email], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getInvoiceById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM invoices WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getUnpaidInvoices() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM invoices WHERE status != "paid" AND status != "void"', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getInvoicesSummary() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let summary = {};
      db.get('SELECT SUM(amount) as total FROM invoices', [], (err, row) => {
        summary.total = row && row.total ? row.total : 0;
        db.get('SELECT SUM(amount) as paid FROM invoices WHERE status = "paid"', [], (err2, row2) => {
          summary.paid = row2 && row2.paid ? row2.paid : 0;
          db.get('SELECT SUM(amount) as unpaid FROM invoices WHERE status = "sent"', [], (err3, row3) => {
            summary.unpaid = row3 && row3.unpaid ? row3.unpaid : 0;
            db.get('SELECT SUM(amount) as overdue FROM invoices WHERE status = "overdue"', [], (err4, row4) => {
              summary.overdue = row4 && row4.overdue ? row4.overdue : 0;
              resolve(summary);
            });
          });
        });
      });
    });
  });
}

function getRecentSalesReport(months = 6) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total
       FROM invoices WHERE status='paid' GROUP BY month ORDER BY month DESC LIMIT ?`,
      [months],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

module.exports = {
  db,
  // User management
  addUser,
  getUser,
  setUserRole,
  getAllUsers,
  // Admin compatibility
  getAdmins,
  addAdmin,
  removeAdmin,
  getAdminRole,
  setAdminRole,
  // Customers & invoices
  getCustomersByTelegramId,
  getAllCustomers,
  getCustomerByEmail,
  getCustomerByStripeId,
  saveCustomer,
  updateCustomer,
  deleteCustomerByEmail,
  deleteCustomer,
  searchCustomers,
  saveInvoice,
  getInvoicesByEmail,
  getInvoiceById,
  getUnpaidInvoices,
  getInvoicesSummary,
  getRecentSalesReport
};
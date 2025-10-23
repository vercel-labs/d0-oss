import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "oss-data-analyst.db");

console.log("🔧 Initializing SQLite database...");
console.log(`📁 Database path: ${dbPath}`);

// Create database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create Companies table
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    employee_count INTEGER,
    revenue REAL,
    founded_year INTEGER,
    country TEXT,
    city TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create People table
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    company_id INTEGER,
    job_title TEXT,
    department TEXT,
    salary REAL,
    hire_date DATE,
    birth_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

// Create Accounts table
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT UNIQUE NOT NULL,
    company_id INTEGER,
    account_manager_id INTEGER,
    status TEXT NOT NULL,
    account_type TEXT NOT NULL,
    monthly_value REAL,
    total_revenue REAL,
    contract_start_date DATE,
    contract_end_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (account_manager_id) REFERENCES people(id)
  );
`);

// Create indexes for better query performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_people_company_id ON people(company_id);
  CREATE INDEX IF NOT EXISTS idx_accounts_company_id ON accounts(company_id);
  CREATE INDEX IF NOT EXISTS idx_accounts_manager_id ON accounts(account_manager_id);
  CREATE INDEX IF NOT EXISTS idx_people_email ON people(email);
  CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);
`);

console.log("✅ Database tables created successfully");
console.log("📊 Tables: companies, people, accounts");

db.close();
console.log("🎉 Database initialization complete!");

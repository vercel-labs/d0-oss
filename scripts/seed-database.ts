import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "oss-data-analyst.db");

console.log("🌱 Seeding database with sample data...");

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// Sample data arrays
const industries = [
  "Technology",
  "Finance",
  "Healthcare",
  "Retail",
  "Manufacturing",
];
const countries = [
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Canada",
];
const cities = [
  "New York",
  "London",
  "Berlin",
  "Paris",
  "Toronto",
  "San Francisco",
  "Seattle",
  "Boston",
  "Austin",
];
const departments = [
  "Engineering",
  "Sales",
  "Marketing",
  "HR",
  "Finance",
  "Operations",
];
const jobTitles = [
  "Engineer",
  "Manager",
  "Director",
  "VP",
  "Analyst",
  "Specialist",
  "Coordinator",
];
const accountStatuses = ["Active", "Inactive", "Suspended", "Closed"];
const accountTypes = ["Enterprise", "Business", "Starter"];
const firstNames = [
  "John",
  "Jane",
  "Michael",
  "Emily",
  "David",
  "Sarah",
  "James",
  "Jessica",
  "Robert",
  "Lisa",
  "William",
  "Amanda",
  "Richard",
  "Michelle",
  "Thomas",
  "Jennifer",
  "Charles",
  "Elizabeth",
  "Daniel",
  "Patricia",
];
const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Wilson",
  "Anderson",
  "Taylor",
  "Thomas",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
];

// Helper functions
const randomItem = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start: Date, end: Date): string => {
  const date = new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
  return date.toISOString().split("T")[0];
};

// Clear existing data
console.log("🧹 Clearing existing data...");
db.exec("DELETE FROM accounts");
db.exec("DELETE FROM people");
db.exec("DELETE FROM companies");

// Insert Companies
console.log("🏢 Inserting companies...");
const insertCompany = db.prepare(`
  INSERT INTO companies (name, industry, employee_count, revenue, founded_year, country, city)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const companies: number[] = [];
for (let i = 1; i <= 20; i++) {
  const result = insertCompany.run(
    `${randomItem(industries)} Corp ${i}`,
    randomItem(industries),
    randomInt(50, 5000),
    randomInt(1000000, 100000000),
    randomInt(1990, 2020),
    randomItem(countries),
    randomItem(cities)
  );
  companies.push(result.lastInsertRowid as number);
}

// Insert People
console.log("👥 Inserting people...");
const insertPerson = db.prepare(`
  INSERT INTO people (first_name, last_name, email, company_id, job_title, department, salary, hire_date, birth_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const people: number[] = [];
for (let i = 1; i <= 100; i++) {
  const firstName = randomItem(firstNames);
  const lastName = randomItem(lastNames);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;

  const result = insertPerson.run(
    firstName,
    lastName,
    email,
    randomItem(companies),
    `${randomItem(jobTitles)}`,
    randomItem(departments),
    randomInt(40000, 200000),
    randomDate(new Date(2015, 0, 1), new Date(2024, 11, 31)),
    randomDate(new Date(1970, 0, 1), new Date(2000, 11, 31))
  );
  people.push(result.lastInsertRowid as number);
}

// Insert Accounts
console.log("💼 Inserting accounts...");
const insertAccount = db.prepare(`
  INSERT INTO accounts (account_number, company_id, account_manager_id, status, account_type, monthly_value, total_revenue, contract_start_date, contract_end_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 1; i <= 50; i++) {
  const accountNumber = `ACC-${String(i).padStart(6, "0")}`;
  const monthlyValue = randomInt(1000, 50000);
  const contractStartDate = randomDate(
    new Date(2020, 0, 1),
    new Date(2024, 0, 1)
  );
  const startDate = new Date(contractStartDate);
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + randomInt(1, 3));

  const monthsActive = Math.floor(
    (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const totalRevenue = monthlyValue * Math.max(1, monthsActive);

  insertAccount.run(
    accountNumber,
    randomItem(companies),
    randomItem(people),
    randomItem(accountStatuses),
    randomItem(accountTypes),
    monthlyValue,
    totalRevenue,
    contractStartDate,
    endDate.toISOString().split("T")[0]
  );
}

// Print statistics
const stats = {
  companies: db.prepare("SELECT COUNT(*) as count FROM companies").get() as {
    count: number;
  },
  people: db.prepare("SELECT COUNT(*) as count FROM people").get() as {
    count: number;
  },
  accounts: db.prepare("SELECT COUNT(*) as count FROM accounts").get() as {
    count: number;
  },
};

console.log("\n✅ Database seeding complete!");
console.log(`📊 Statistics:`);
console.log(`   - Companies: ${stats.companies.count}`);
console.log(`   - People: ${stats.people.count}`);
console.log(`   - Accounts: ${stats.accounts.count}`);

// Show sample queries
console.log("\n💡 Try these sample queries:");
console.log("   - How many companies are in the Technology industry?");
console.log("   - What is the average salary by department?");
console.log("   - Show me the top 5 accounts by monthly value");
console.log("   - Which companies have the most employees?");

db.close();
console.log("\n🎉 All done!");

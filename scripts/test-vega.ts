import { buildVegaLite } from "../src/lib/reporting/viz";
import { vegaLiteToPng } from "../src/lib/tools/vegaToPng";
import { writeFileSync } from "fs";

// Test 1: Temporal data with dates out of order
const temporalData = [
  { date: "2025-10-01", revenue: 15000 },
  { date: "2025-09-28", revenue: 12000 },
  { date: "2025-10-03", revenue: 18000 },
  { date: "2025-09-30", revenue: 14000 },
  { date: "2025-10-02", revenue: 16500 },
  { date: "2025-09-29", revenue: 13500 },
];

const temporalColumns = [
  { name: "date", type: "DATE" },
  { name: "revenue", type: "NUMBER" },
];

const temporalIntent = {
  metrics: ["revenue"],
  dimensions: ["date"],
};

// Test 2: Categorical bar chart data
const categoryData = [
  { product: "Laptops", sales: 45000 },
  { product: "Phones", sales: 38000 },
  { product: "Tablets", sales: 22000 },
  { product: "Monitors", sales: 15000 },
  { product: "Keyboards", sales: 8500 },
];

const categoryColumns = [
  { name: "product", type: "VARCHAR" },
  { name: "sales", type: "NUMBER" },
];

const categoryIntent = {
  metrics: ["sales"],
  dimensions: ["product"],
};

async function test() {
  // Test temporal chart
  console.log("=== Test 1: Temporal Line Chart ===");
  const temporalSpec = buildVegaLite(
    temporalIntent,
    temporalData,
    temporalColumns
  );
  console.log("VegaLite Spec:");
  console.log(JSON.stringify(temporalSpec, null, 2));

  console.log("\nGenerating PNG...");
  const temporalPng = await vegaLiteToPng(temporalSpec);
  writeFileSync("test-chart-temporal.png", temporalPng);
  console.log("✓ Chart saved to test-chart-temporal.png");

  // Test categorical bar chart
  console.log("\n=== Test 2: Categorical Bar Chart ===");
  const categorySpec = buildVegaLite(
    categoryIntent,
    categoryData,
    categoryColumns
  );
  console.log("VegaLite Spec:");
  console.log(JSON.stringify(categorySpec, null, 2));

  console.log("\nGenerating PNG...");
  const categoryPng = await vegaLiteToPng(categorySpec);
  writeFileSync("test-chart-category.png", categoryPng);
  console.log("✓ Chart saved to test-chart-category.png");
}

test().catch(console.error);

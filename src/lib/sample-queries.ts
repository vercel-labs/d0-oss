export const sqlEvalSet = [
  {
    input: "v0 Paying Customers by Plan, MoM, L12M",
    expected: `SELECT
  DATE_TRUNC('MONTH', "REPORTED_ON") AS "REPORTED_ON",
  "END_BILLING_PLAN" AS "END_BILLING_PLAN",
  COUNT_IF(END_ANNUAL_RECURRING_REVENUE > 0) AS "Customers"
FROM dwh_prod.analytics.customer_plan_recurring_revenue_monthly
WHERE
  (
    (
      END_BILLING_PLAN ILIKE 'v0%'
    )
  )
GROUP BY
  DATE_TRUNC('MONTH', "REPORTED_ON"),
  "END_BILLING_PLAN"
ORDER BY
  "Customers" DESC`,
  },
  {
    input: "ARR Total of Accounts by Account Tier, Current Snapshot",
    expected: `SELECT
    "ACCOUNT_TIER" AS "ACCOUNT_TIER",
    SUM(annual_recurring_revenue) AS "ARR"
  FROM dwh_prod.analytics.accounts
  GROUP BY
    "ACCOUNT_TIER"
  ORDER BY
    "ARR" DESC`,
  },
  {
    input: "Count of Accounts by Account Tier, Current Snapshot",
    expected: `SELECT
    "ACCOUNT_TIER" AS "ACCOUNT_TIER",
    COUNT(*) AS "count"
  FROM dwh_prod.analytics.accounts
  GROUP BY
    "ACCOUNT_TIER"
  ORDER BY
    "count" DESC`,
  },
  {
    input: "v0 Signups, By Referrer Category, WoW, Past 8 Weeks",
    expected: `SELECT
    DATE_TRUNC('WEEK', "SESSION_START_AT") AS "SESSION_START_AT",
    "ENTRY_MARKETING_CATEGORY" AS "ENTRY_MARKETING_CATEGORY",
    COUNT(*) AS "count"
  FROM dwh_prod.analytics.marketing_sessions
  WHERE
    "SESSION_START_AT" >= CAST('2025-07-28T00:00:00.000000' AS TIMESTAMP)
    AND "SESSION_START_AT" < CAST('2025-09-26T22:02:49.000000' AS TIMESTAMP)
    AND "ENTRY_PROPERTY" IN ('v0.dev')
    AND (
      (
        HAS_SIGNUP_ACTIVITY ILIKE 'true'
      )
    )
  GROUP BY
    DATE_TRUNC('WEEK', "SESSION_START_AT"),
    "ENTRY_MARKETING_CATEGORY"
  ORDER BY
    "count" DESC`,
  },
  {
    input: "Net Usage by Product Category, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    "PRODUCT_CATEGORY" AS "PRODUCT_CATEGORY",
    SUM(NET_USAGE) * 12 AS "Pro ANU"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "TRANSACTION_AT" >= CAST('2025-03-26T22:03:22.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:03:22.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT"),
    "PRODUCT_CATEGORY"
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "All function invocations (Fluid/Middleware) over time",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    AVG(SUM(NET_USAGE)) OVER (
      ORDER BY DATE_TRUNC('MONTH', "TRANSACTION_AT")
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) * 12 AS "Pro ANU T3"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "TRANSACTION_AT" >= CAST('2024-09-26T22:03:37.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:03:37.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro', 'enterprise')
    AND "PRODUCT_NAME" IN ('function invocations', 'edge middleware invocations')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT")
  ORDER BY
    "Pro ANU T3" DESC`,
  },
  {
    input: "Pro ANU by Mature Infra Product, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    "PRODUCT_NAME" AS "PRODUCT_NAME",
    SUM(NET_USAGE) * 12 AS "Pro ANU"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "PRODUCT_CATEGORY" IN ('mature_infra')
    AND "TRANSACTION_AT" >= CAST('2025-03-26T22:04:01.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:04:01.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT"),
    "PRODUCT_NAME"
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "Pro ANU by Unbundled Pricing Product, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    "PRODUCT_NAME" AS "PRODUCT_NAME",
    SUM(NET_USAGE) * 12 AS "Pro ANU"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "PRODUCT_CATEGORY" IN ('unbundled_pricing')
    AND "TRANSACTION_AT" >= CAST('2025-03-26T22:04:19.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:04:19.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT"),
    "PRODUCT_NAME"
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "Pro ANU by Observability Product, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    "PRODUCT_NAME" AS "PRODUCT_NAME",
    SUM(NET_USAGE) * 12 AS "Pro ANU"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "PRODUCT_CATEGORY" IN ('observability')
    AND "TRANSACTION_AT" >= CAST('2025-03-26T22:04:37.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:04:37.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT"),
    "PRODUCT_NAME"
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "Pro ANU, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    SUM(NET_USAGE) * 12 AS "Pro ANU",
    AVG(SUM(NET_USAGE)) OVER (
      ORDER BY DATE_TRUNC('MONTH', "TRANSACTION_AT")
      ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) * 12 AS "Pro ANU T3"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "TRANSACTION_AT" >= CAST('2025-03-26T22:04:54.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:04:54.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT")
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "Pro ANU by Subscale Infra Product, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "TRANSACTION_AT") AS "TRANSACTION_AT",
    "PRODUCT_NAME" AS "PRODUCT_NAME",
    SUM(NET_USAGE) * 12 AS "Pro ANU"
  FROM dwh_prod.analytics.invoiced_usage
  WHERE
    "PRODUCT_CATEGORY" IN ('subscale_infra')
    AND "TRANSACTION_AT" >= CAST('2025-03-26T22:05:12.000000' AS TIMESTAMP)
    AND "TRANSACTION_AT" < CAST('2025-09-26T22:05:12.000000' AS TIMESTAMP)
    AND "INVOICE_PLAN" IN ('pro')
  GROUP BY
    DATE_TRUNC('MONTH', "TRANSACTION_AT"),
    "PRODUCT_NAME"
  ORDER BY
    "Pro ANU" DESC`,
  },
  {
    input: "$ Pipeline, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "SALES_QUALIFIED_OPPORTUNITY_ON") AS "SALES_QUALIFIED_OPPORTUNITY_ON",
    SUM("NEW_BUSINESS_ANNUAL_RECURRING_REVENUE") AS "New ARR "
  FROM dwh_prod.analytics.opportunities
  WHERE
    "SALES_QUALIFIED_OPPORTUNITY_ON" >= CAST('2025-03-26' AS DATE)
    AND "SALES_QUALIFIED_OPPORTUNITY_ON" < CAST('2025-09-26' AS DATE)
    AND "OPPORTUNITY_TYPE" IN ('Net New Business', 'Upgrade from Pro/Legacy')
    AND (
      (
        NOT SALES_QUALIFIED_OPPORTUNITY_ON IS NULL
      )
    )
  GROUP BY
    DATE_TRUNC('MONTH', "SALES_QUALIFIED_OPPORTUNITY_ON")
  ORDER BY
    "New ARR " DESC`,
  },
  {
    input: "% Pipeline by Opportunity Source, MoM, Past 6 Months",
    expected: `SELECT
    DATE_TRUNC('MONTH', "SALES_QUALIFIED_OPPORTUNITY_ON") AS "SALES_QUALIFIED_OPPORTUNITY_ON",
    CASE
      WHEN OPPORTUNITY_SOURCE IN ('Event Attendance', 'Handraiser', 'Low-Intent Lead Generation', 'Low-Intent LG')
      THEN 'Marketing_Opportunity_Source'
      ELSE 'Other'
    END AS "Opp Source Grouping ",
    SUM("NEW_AND_EXPANSION_ANNUAL_RECURRING_REVENUE") AS "New ARR"
  FROM dwh_prod.analytics.opportunities
  WHERE
    "SALES_QUALIFIED_OPPORTUNITY_ON" >= CAST('2025-03-26' AS DATE)
    AND "SALES_QUALIFIED_OPPORTUNITY_ON" < CAST('2025-09-26' AS DATE)
    AND "OPPORTUNITY_TYPE" IN ('Net New Business', 'Upgrade from Pro/Legacy')
    AND (
      (
        NOT SALES_QUALIFIED_OPPORTUNITY_ON IS NULL
      )
    )
  GROUP BY
    DATE_TRUNC('MONTH', "SALES_QUALIFIED_OPPORTUNITY_ON"),
    CASE
      WHEN OPPORTUNITY_SOURCE IN ('Event Attendance', 'Handraiser', 'Low-Intent Lead Generation', 'Low-Intent LG')
      THEN 'Marketing_Opportunity_Source'
      ELSE 'Other'
    END
  ORDER BY
    "New ARR" DESC`,
  },
  {
    input: "CDR Actual vs Baseline, Week over Week, Current Quarter",
    expected: `SELECT
    DATE_TRUNC('WEEK', "CUSTOMER_DOLLAR_RETENTION_CLOSE_ON") AS "CUSTOMER_DOLLAR_RETENTION_CLOSE_ON",
    SUM(CUSTOMER_DOLLAR_RETENTION_REVENUE) AS "Sum Customer Dollar Retention Revenue",
    SUM(BASELINE_CUSTOMER_DOLLAR_RETENTION_REVENUE) AS "Sum Baseline Customer Dollar Retention Revenue"
  FROM dwh_prod.analytics.opportunities
  WHERE
    "CUSTOMER_DOLLAR_RETENTION_CLOSE_ON" >= CAST('2025-05-01' AS DATE)
    AND "CUSTOMER_DOLLAR_RETENTION_CLOSE_ON" < CAST('2025-09-26' AS DATE)
  GROUP BY
    DATE_TRUNC('WEEK', "CUSTOMER_DOLLAR_RETENTION_CLOSE_ON")
  ORDER BY
    "Sum Customer Dollar Retention Revenue" DESC`,
  },
];

// Regenerates src/lib/customers/schemaText.ts from the .sql files.
import { readFileSync, writeFileSync } from "node:fs";

const embed = (file) =>
  readFileSync(file, "utf8")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");

const customer = embed("src/lib/customers/schema.sql");
const billing = embed("src/lib/customers/billing.sql");

writeFileSync(
  "src/lib/customers/schemaText.ts",
  `/**
 * The \`.sql\` files, embedded as strings.
 *
 * Generated — do not edit by hand. Run \`npm run sync-schema\` after changing
 * a .sql file; a test fails if the two drift apart.
 *
 * They are embedded because a deployed server has no source tree to read
 * from: Netlify ships the build output, not \`src/\`.
 */
export const CUSTOMER_SCHEMA = \`${customer}\`;

/** Invoices, payments and the balances that fall out of them. */
export const BILLING_SCHEMA = \`${billing}\`;
`,
);
console.log("schemaText.ts regenerated");

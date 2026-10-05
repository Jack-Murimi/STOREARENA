// Regenerates src/lib/customers/schemaText.ts from src/lib/customers/schema.sql.
import { readFileSync, writeFileSync } from "node:fs";

const sql = readFileSync("src/lib/customers/schema.sql", "utf8");
const body = sql.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

writeFileSync(
  "src/lib/customers/schemaText.ts",
  `/**
 * \`schema.sql\`, embedded as a string.
 *
 * Generated — do not edit by hand. Run \`npm run sync-schema\` after changing
 * schema.sql; a test fails if the two drift apart.
 *
 * It is embedded because a deployed server has no source tree to read from:
 * Netlify ships the build output, not \`src/\`.
 */
export const CUSTOMER_SCHEMA = \`${body}\`;
`,
);
console.log("schemaText.ts regenerated");

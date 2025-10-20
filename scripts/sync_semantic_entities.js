// Synchronize semantic entity YAMLs from apps/web to semantic_new
// - Copies content from apps/web/src/semantic/entities when available
// - Re-dumps YAML with all arrays in flow style
// - For files that exist only in semantic_new, just reformat to flow style

import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const root = process.cwd();
const SRC_DIR = path.resolve(root, 'apps/web/src/semantic/entities');
const TARGET_DIR = path.resolve(root, 'semantic_new/entities');

async function listYamlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    if (ent.isFile() && ent.name.endsWith('.yml')) files.push(path.join(dir, ent.name));
  }
  files.sort();
  return files;
}

async function loadYaml(file) {
  const text = await fs.readFile(file, 'utf8');
  return yaml.load(text, { json: true });
}

function dumpYaml(obj) {
  return yaml.dump(obj, {
    // Keep top-level mappings in block style; make sequences flow
    // Level 0 = document root mapping, Level 1 = values like arrays under root
    flowLevel: 1,
    // Keep anchors out to avoid surprises across files
    noRefs: true,
    // Reasonable width for block scalars
    lineWidth: 120,
    // Prefer single quotes to reduce escapes
    quotingType: "'",
    // Do not quote keys unless required
    forceQuotes: false,
    // Sort keys off to preserve original ordering as much as possible
    sortKeys: false,
  });
}

async function main() {
  const targetFiles = await listYamlFiles(TARGET_DIR);
  const srcFilesSet = new Set((await listYamlFiles(SRC_DIR)).map((p) => path.basename(p)));

  let updated = 0;
  let reformattedOnly = 0;

  for (const tFile of targetFiles) {
    const base = path.basename(tFile);
    const srcPath = path.join(SRC_DIR, base);
    let obj;
    if (srcFilesSet.has(base)) {
      // Use canonical source content (includes joins) and reformat
      obj = await loadYaml(srcPath);
      updated += 1;
    } else {
      // No canonical source: just reformat existing content
      obj = await loadYaml(tFile);
      reformattedOnly += 1;
    }

    const out = dumpYaml(obj);
    await fs.writeFile(tFile, out, 'utf8');
  }

  console.log(
    `Updated from source: ${updated}, reformatted only: ${reformattedOnly}, total: ${targetFiles.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

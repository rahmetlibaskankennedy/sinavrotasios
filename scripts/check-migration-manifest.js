#!/usr/bin/env node
/* Local migration filenames must stay identical to the verified production graph. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'supabase', 'production-migrations.json');
const migrationsPath = path.join(root, 'supabase', 'migrations');

function fail(message) {
  throw new Error(message);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`Migration manifest okunamadı: ${error.message}`);
}

if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  fail('Migration manifest geçerli bir files dizisi içermiyor.');
}

const expected = [...manifest.files].sort();
const actual = fs.readdirSync(migrationsPath)
  .filter(file => file.endsWith('.sql'))
  .sort();

const duplicate = expected.find((file, index) => index > 0 && file === expected[index - 1]);
if (duplicate) fail(`Migration manifest yinelenen dosya içeriyor: ${duplicate}`);

for (const file of expected) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
    fail(`Migration adı geçersiz: ${file}`);
  }
}

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  const missing = expected.filter(file => !actual.includes(file));
  const unexpected = actual.filter(file => !expected.includes(file));
  fail(`Migration geçmişi production manifestiyle eşleşmiyor. Eksik: ${missing.join(', ') || '-'}; Fazla: ${unexpected.join(', ') || '-'}`);
}

console.log(`✓ ${actual.length} migration production manifestiyle eşleşiyor.`);

#!/usr/bin/env node
/* Sürüm paketi için çevrimdışı, tekrarlanabilir doğrulamalar. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const resolve = (...parts) => path.join(root, ...parts);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relative) {
  return fs.readFileSync(resolve(relative), 'utf8');
}

function json(relative) {
  try {
    return JSON.parse(read(relative));
  } catch (error) {
    fail(`${relative} geçerli JSON değil: ${error.message}`);
  }
}

function listFiles(directory) {
  const absolute = resolve(directory);
  const out = [];
  const walk = (current, prefix = '') => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = path.join(prefix, entry.name);
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file, rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(absolute);
  return out.sort();
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${command} ${args.join(' ')} başarısız oldu:\n${result.stdout}${result.stderr}`);
}

function countChunks(prefix) {
  return listFiles('supabase/export/production')
    .filter(file => new RegExp(`^${prefix}-\\d{3}\\.json$`).test(file))
    .flatMap(file => json(`supabase/export/production/${file}`));
}

function assertUnique(rows, key, label) {
  const ids = new Set(rows.map(key));
  assert(ids.size === rows.length, `${label} içinde yinelenen kimlik bulundu.`);
}

run(process.execPath, ['--check', 'www/app.js']);
run(process.execPath, ['--check', 'www/content-repo.js']);
run(process.execPath, ['--check', 'www/progress-sync.js']);
run(process.execPath, ['scripts/check_no_answer_leak.js']);
run(process.execPath, ['scripts/test-progress-sync.js']);
run(process.execPath, ['scripts/test-auth-routing.js']);
run(process.execPath, ['scripts/check-migration-manifest.js']);
run('python3', ['scripts/generate_seed.py', '--check']);

for (const file of listFiles('www')) {
  const source = path.join(resolve('www'), file);
  const target = path.join(resolve('android/app/src/main/assets/public'), file);
  assert(fs.existsSync(target), `Android varlığı eksik: ${file}`);
  assert(fs.readFileSync(source, 'utf8') === fs.readFileSync(target, 'utf8'), `Android varlığı güncel değil: ${file}`);
}

const questions = countChunks('questions');
const flashcards = countChunks('flashcards');
const denemeQuestions = countChunks('deneme_questions');
assert(questions.length === 4832, `Production soru anlık görüntüsü eksik: ${questions.length}/4832.`);
assert(flashcards.length === 800, `Production flashcard anlık görüntüsü eksik: ${flashcards.length}/800.`);
assert(denemeQuestions.length === 268, `Production deneme sorusu anlık görüntüsü eksik: ${denemeQuestions.length}/268.`);
assertUnique(questions, row => row.id, 'Production soru anlık görüntüsü');
assertUnique(flashcards, row => `${row.deck_id}:${row.sort_order}`, 'Production flashcard anlık görüntüsü');
assertUnique(denemeQuestions, row => row.id, 'Production deneme soru anlık görüntüsü');

const edge = read('supabase/functions/report-question/index.ts');
assert(!edge.includes('user_display'), 'Edge Function user_display alanına başvurmamalı.');
assert(!edge.includes('question.prompt'), 'Edge Function soru metnini dış sisteme aktarmamalı.');
assert(edge.includes("verify_jwt = true") || read('supabase/config.toml').includes('[functions.report-question]'), 'report-question JWT ayarı eksik.');

const supabaseClient = read('www/supabaseClient.js');
const authCommon = read('www/auth-common.js');
const indexHtml = read('www/index.html');
const signupHtml = read('www/signup.html');
assert(supabaseClient.includes("flowType: 'pkce'"), 'Supabase Auth PKCE akışı etkin değil.');
assert(authCommon.includes('exchangeCodeForSession'), 'Native PKCE callback kod değişimi eksik.');
assert(authCommon.includes('passwordRequirementError'), 'İstemci parola politikasını doğrulamıyor.');
assert(authCommon.includes('redirectToApp'), 'Native callback için güvenli uygulama yönlendirmesi eksik.');
assert(indexHtml.includes('src="auth-common.js"'), 'Cold-start native callback dinleyicisi index.html içinde yüklenmiyor.');
assert(signupHtml.includes('minlength="12"'), 'Kayıt ekranı parola uzunluğu politikasıyla eşleşmiyor.');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const appGradle = read('android/app/build.gradle');
const packageMeta = json('package.json');
const androidVersionCode = Number(packageMeta?.sinavrotasi?.androidVersionCode);
assert(typeof packageMeta.version === 'string' && /^\d+\.\d+\.\d+$/.test(packageMeta.version), 'package.json sürüm bilgisi geçersiz.');
assert(Number.isInteger(androidVersionCode) && androidVersionCode > 0, 'package.json androidVersionCode geçersiz.');
assert(manifest.includes('android:allowBackup="false"'), 'Android yedekleme kapalı değil.');
assert(!manifest.includes('FileProvider'), 'Kullanılmayan geniş FileProvider kaldırılmamış.');
assert(appGradle.includes(`versionCode ${androidVersionCode}`) && appGradle.includes(`versionName "${packageMeta.version}"`), 'Android sürüm bilgisi package.json ile eşleşmiyor.');

for (const migration of [
  '20260814081802_admin_bypass_on_content_read.sql',
  '20260812110139_add_progress_optimistic_lock.sql',
  '20260813185859_enforce_canonical_root_in_free_quota.sql',
  '20260813202523_harden_feedback_and_function_surface.sql',
  '20260813203501_optimize_rls_and_foreign_keys.sql',
]) {
  assert(fs.existsSync(resolve('supabase/migrations', migration)), `Eksik Supabase migration: ${migration}`);
}

console.log('Sürüm doğrulamaları başarılı.');

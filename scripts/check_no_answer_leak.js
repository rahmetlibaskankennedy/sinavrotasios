#!/usr/bin/env node
/**
 * C-01 regresyon kilidi.
 *
 * SınavRotası Derinlemesine Güvenlik Denetimi (13.08.2026), kritik bulgu C-01:
 * www/sorular ve www/cards altında doğru cevap indeksi (answerIndex) içeren
 * 291 soru + 131 kart, uygulamayı indiren herkes tarafından çıkarılabilir
 * durumda bulundu. 13.08.2026 düzeltmesiyle bu dosyalar www/ ve Android
 * assets'ten kaldırıldı; içerik artık yalnızca Supabase'ten (RLS +
 * is_premium() ile korumalı) geliyor.
 *
 * Bu script, answerIndex/answer_index alanı taşıyan HERHANGİ bir JSON
 * dosyasının istemciye giden dizinlere (www/, android assets) tekrar
 * sızmadığını doğrular. CI'da ve `npm run build` öncesinde çalıştırılmalı.
 * Kök dizindeki sorular/ ve cards/ KASITLI olarak taranmaz — onlar yalnızca
 * scripts/generate_seed.py için seed-kaynağıdır ve istemciye hiç gitmez.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const SCAN_DIRS = [
  'www',
  'android/app/src/main/assets/public',
];

const ANSWER_FIELD_RE = /"answerIndex"\s*:|"answer_index"\s*:/;

function walk(dir, hits) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, hits);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const text = fs.readFileSync(full, 'utf8');
      if (ANSWER_FIELD_RE.test(text)) hits.push(full);
    }
  }
}

const hits = [];
for (const rel of SCAN_DIRS) {
  walk(path.join(ROOT, rel), hits);
}

if (hits.length > 0) {
  console.error('\n✗ C-01 REGRESYONU TESPİT EDİLDİ — istemci paketinde cevap anahtarı bulundu:\n');
  hits.forEach(h => console.error('  - ' + path.relative(ROOT, h)));
  console.error('\nBu dosyalar www/ veya Android assets içine ASLA konulmamalı.');
  console.error('İçerik yalnızca Supabase (ContentRepo) üzerinden, RLS korumalı olarak sunulmalı.\n');
  process.exit(1);
}

console.log('✓ C-01 regresyon kontrolü geçti: istemci paketinde answerIndex/answer_index içeren dosya yok.');
process.exit(0);

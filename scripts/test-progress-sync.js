#!/usr/bin/env node
/* Cihaz-bazlı ilerleme sayaçlarının kayıpsız ve idempotent birleşme testi. */
const assert = require('assert/strict');
const sync = require('../www/progress-sync.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(left, right) {
  const result = {};
  sync.mergeProgressCounters(result, left, right, 'user-1');
  return result;
}

const historical = {
  userId: 'user-1',
  answers: 10,
  correctAnswers: 7,
  dailyAnswers: { '2026-08-14': 10 },
  docStats: { 'law-657': { attempts: 10, correct: 7 } }
};

const phone = sync.normalizeProgressCounters(clone(historical), 'user-1');
const tablet = sync.normalizeProgressCounters(clone(historical), 'user-1');

sync.recordAnswer(phone, 'phone-a', true, '2026-08-14', 'law-657', 'user-1');
sync.recordAnswer(tablet, 'tablet-b', false, '2026-08-14', 'law-657', 'user-1');

const firstMerge = merge(phone, tablet);
assert.equal(firstMerge.answers, 12, 'İki cihazdaki farklı cevaplar toplanmalı.');
assert.equal(firstMerge.correctAnswers, 8, 'Doğru cevap sayısı kaybolmamalı.');
assert.equal(firstMerge.dailyAnswers['2026-08-14'], 12, 'Günlük sayaç kayıpsız birleşmeli.');
assert.deepEqual(firstMerge.docStats['law-657'], { attempts: 12, correct: 8 }, 'Konu istatistiği kayıpsız birleşmeli.');

const repeatedMerge = merge(firstMerge, tablet);
assert.equal(repeatedMerge.answers, 12, 'Aynı cihazın eski kopyası ikinci kez sayılmamalı.');
assert.equal(repeatedMerge.correctAnswers, 8, 'Birleşme idempotent olmalı.');

console.log('✓ İlerleme CRDT birleşme testleri geçti.');

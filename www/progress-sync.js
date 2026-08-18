/*
 * SınavRotası ilerleme sayaçları için cihaz-bazlı, birleşebilir sayaçlar.
 *
 * Aynı kullanıcının iki cihazda çevrimdışı çalışması durumunda tek bir toplam
 * sayacı `max()` ile seçmek veri kaybına neden olur. Her cihaz kendi artan
 * sayacını taşır; cihaz kopyaları birleştirilirken yalnız aynı cihazın en son
 * değeri seçilir. Genel toplam, cihaz sayaçlarının toplamından türetilir.
 */
(function registerProgressSync(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SRProgressSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function createProgressSync() {
  const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
  const MAX_SHARD_ID_LENGTH = 180;

  function count(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.min(MAX_COUNTER, Math.floor(numeric));
  }

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function validShardId(value) {
    return typeof value === 'string'
      && value.length > 0
      && value.length <= MAX_SHARD_ID_LENGTH
      && /^[a-zA-Z0-9_.:-]+$/.test(value);
  }

  function normalizeDailyAnswers(value) {
    const result = {};
    Object.entries(record(value)).forEach(([day, rawCount]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const safeCount = count(rawCount);
      if (safeCount) result[day] = safeCount;
    });
    return result;
  }

  function normalizeDocStats(value) {
    const result = {};
    Object.entries(record(value)).forEach(([documentId, rawStats]) => {
      if (typeof documentId !== 'string' || !documentId || documentId.length > 180) return;
      const attempts = count(rawStats && rawStats.attempts);
      const correct = Math.min(attempts, count(rawStats && rawStats.correct));
      if (attempts || correct) result[documentId] = { attempts, correct };
    });
    return result;
  }

  function normalizeShard(value) {
    const attempts = count(value && value.answers);
    return {
      answers: attempts,
      correctAnswers: Math.min(attempts, count(value && value.correctAnswers)),
      dailyAnswers: normalizeDailyAnswers(value && value.dailyAnswers),
      docStats: normalizeDocStats(value && value.docStats)
    };
  }

  function mergeMapsByMaximum(left, right) {
    const merged = { ...normalizeDailyAnswers(left) };
    Object.entries(normalizeDailyAnswers(right)).forEach(([key, value]) => {
      merged[key] = Math.max(merged[key] || 0, value);
    });
    return merged;
  }

  function mergeDocStats(left, right) {
    const merged = { ...normalizeDocStats(left) };
    Object.entries(normalizeDocStats(right)).forEach(([documentId, stats]) => {
      const existing = merged[documentId] || { attempts: 0, correct: 0 };
      const attempts = Math.max(existing.attempts, stats.attempts);
      const correct = Math.min(attempts, Math.max(existing.correct, stats.correct));
      merged[documentId] = { attempts, correct };
    });
    return merged;
  }

  function mergeShard(left, right) {
    const first = normalizeShard(left);
    const second = normalizeShard(right);
    const answers = Math.max(first.answers, second.answers);
    return {
      answers,
      correctAnswers: Math.min(answers, Math.max(first.correctAnswers, second.correctAnswers)),
      dailyAnswers: mergeMapsByMaximum(first.dailyAnswers, second.dailyAnswers),
      docStats: mergeDocStats(first.docStats, second.docStats)
    };
  }

  function normalizeCounterShards(value) {
    const result = {};
    Object.entries(record(value)).forEach(([shardId, shard]) => {
      if (!validShardId(shardId)) return;
      result[shardId] = mergeShard(result[shardId], shard);
    });
    return result;
  }

  function legacyShardId(userId) {
    const identity = typeof userId === 'string' && userId ? userId : 'unassigned';
    return `legacy:${identity}`;
  }

  function aggregate(counterShards) {
    const totals = {
      answers: 0,
      correctAnswers: 0,
      dailyAnswers: {},
      docStats: {}
    };
    Object.values(normalizeCounterShards(counterShards)).forEach(shard => {
      totals.answers = Math.min(MAX_COUNTER, totals.answers + shard.answers);
      totals.correctAnswers = Math.min(MAX_COUNTER, totals.correctAnswers + shard.correctAnswers);
      Object.entries(shard.dailyAnswers).forEach(([day, amount]) => {
        totals.dailyAnswers[day] = Math.min(MAX_COUNTER, (totals.dailyAnswers[day] || 0) + amount);
      });
      Object.entries(shard.docStats).forEach(([documentId, stats]) => {
        const total = totals.docStats[documentId] || { attempts: 0, correct: 0 };
        total.attempts = Math.min(MAX_COUNTER, total.attempts + stats.attempts);
        total.correct = Math.min(total.attempts, Math.min(MAX_COUNTER, total.correct + stats.correct));
        totals.docStats[documentId] = total;
      });
    });
    totals.correctAnswers = Math.min(totals.answers, totals.correctAnswers);
    return totals;
  }

  function legacyNeedsPreserving(legacy, totals) {
    if (legacy.answers > totals.answers || legacy.correctAnswers > totals.correctAnswers) return true;
    if (Object.entries(legacy.dailyAnswers).some(([day, amount]) => amount > (totals.dailyAnswers[day] || 0))) return true;
    return Object.entries(legacy.docStats).some(([documentId, stats]) => {
      const current = totals.docStats[documentId] || { attempts: 0, correct: 0 };
      return stats.attempts > current.attempts || stats.correct > current.correct;
    });
  }

  function normalizeProgressCounters(progress, fallbackUserId) {
    if (!progress || typeof progress !== 'object') return progress;
    const counterShards = normalizeCounterShards(progress.counterShards);
    const existingTotals = aggregate(counterShards);
    const legacy = normalizeShard({
      answers: progress.answers,
      correctAnswers: progress.correctAnswers,
      dailyAnswers: progress.dailyAnswers,
      docStats: progress.docStats
    });
    if (legacyNeedsPreserving(legacy, existingTotals)) {
      const key = legacyShardId(progress.userId || fallbackUserId);
      counterShards[key] = mergeShard(counterShards[key], legacy);
    }
    progress.counterShards = counterShards;
    return recomputeCounters(progress);
  }

  function recomputeCounters(progress) {
    const totals = aggregate(progress && progress.counterShards);
    progress.answers = totals.answers;
    progress.correctAnswers = totals.correctAnswers;
    progress.dailyAnswers = totals.dailyAnswers;
    progress.docStats = totals.docStats;
    return progress;
  }

  function mergeCounterShards(left, right) {
    const merged = normalizeCounterShards(left);
    Object.entries(normalizeCounterShards(right)).forEach(([shardId, shard]) => {
      merged[shardId] = mergeShard(merged[shardId], shard);
    });
    return merged;
  }

  function mergeProgressCounters(merged, local, server, fallbackUserId) {
    const localCopy = { ...(local || {}) };
    const serverCopy = { ...(server || {}) };
    normalizeProgressCounters(localCopy, fallbackUserId);
    normalizeProgressCounters(serverCopy, fallbackUserId);
    merged.counterShards = mergeCounterShards(localCopy.counterShards, serverCopy.counterShards);
    return recomputeCounters(merged);
  }

  function recordAnswer(progress, deviceId, isCorrect, day, documentId, fallbackUserId) {
    normalizeProgressCounters(progress, fallbackUserId);
    const shardId = `device:${deviceId}`;
    if (!validShardId(shardId)) throw new Error('Geçersiz ilerleme cihaz kimliği.');
    const shard = normalizeShard(progress.counterShards[shardId]);
    shard.answers = Math.min(MAX_COUNTER, shard.answers + 1);
    if (isCorrect) shard.correctAnswers = Math.min(shard.answers, shard.correctAnswers + 1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      shard.dailyAnswers[day] = Math.min(MAX_COUNTER, (shard.dailyAnswers[day] || 0) + 1);
    }
    if (typeof documentId === 'string' && documentId && documentId.length <= 180) {
      const stats = shard.docStats[documentId] || { attempts: 0, correct: 0 };
      stats.attempts = Math.min(MAX_COUNTER, stats.attempts + 1);
      if (isCorrect) stats.correct = Math.min(stats.attempts, stats.correct + 1);
      shard.docStats[documentId] = stats;
    }
    progress.counterShards[shardId] = shard;
    return recomputeCounters(progress);
  }

  return {
    aggregate,
    legacyShardId,
    mergeCounterShards,
    mergeProgressCounters,
    normalizeProgressCounters,
    recordAnswer,
    recomputeCounters
  };
});

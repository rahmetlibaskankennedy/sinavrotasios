import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://zrlsllbgqrllwgjyqbfv.supabase.co',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
]);
const DEFAULT_ORIGIN = 'https://zrlsllbgqrllwgjyqbfv.supabase.co';
const MAX_NOTE_LENGTH = 1000;
const MAX_QUESTION_ID_LENGTH = 160;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function response(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function normalizeQuestionId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('question_id metin olmalıdır.');
  const id = value.trim();
  if (!id || id.length > MAX_QUESTION_ID_LENGTH) throw new Error('Geçersiz question_id.');
  return id;
}

function normalizeDenemeQuestionId(value: unknown): number | null {
  if (value == null) return null;
  const id = typeof value === 'string' ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Geçersiz deneme_question_id.');
  }
  return id;
}

function sanitizeNote(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('note metin olmalıdır.');
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new Error(`Not en fazla ${MAX_NOTE_LENGTH} karakter olabilir.`);
  return note || null;
}

async function sendTelegramNotice(
  action: 'report' | 'undo',
  feedbackId: number | null,
  questionId: string | null,
  denemeQuestionId: number | null,
) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return false;

  // Bildirim yalnızca operasyonel kimlik taşır: kullanıcı adı/e-posta, soru
  // metni, doğru cevap ve serbest not Telegram'a aktarılmaz.
  const lines = [
    action === 'report' ? '🚩 Soru bildirimi' : '↩️ Soru bildirimi geri alındı',
    feedbackId == null ? null : `Kayıt: ${feedbackId}`,
    questionId != null
      ? `Soru kimliği: ${questionId}`
      : `Deneme soru kimliği: ${denemeQuestionId ?? 'bilinmiyor'}`,
  ].filter(Boolean).join('\n');

  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines }),
  });
  return telegramResponse.ok;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, { error: 'Yalnızca POST desteklenir.' }, 405);

  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+.+/i.test(authorization)) return response(request, { error: 'Yetkilendirme gerekli.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return response(request, { error: 'Sunucu yapılandırması eksik.' }, 500);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return response(request, { error: 'Oturum doğrulanamadı.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response(request, { error: 'Geçersiz JSON gövdesi.' }, 400);
  }
  const action = payload.action;
  if (action !== 'report' && action !== 'undo') return response(request, { error: 'Geçersiz işlem.' }, 400);

  let questionId: string | null;
  let denemeQuestionId: number | null;
  let note: string | null;
  try {
    questionId = normalizeQuestionId(payload.question_id);
    denemeQuestionId = normalizeDenemeQuestionId(payload.deneme_question_id);
    note = sanitizeNote(payload.note);
  } catch (error) {
    return response(request, { error: error instanceof Error ? error.message : 'Geçersiz istek.' }, 400);
  }
  if (questionId == null && denemeQuestionId == null) {
    return response(request, { error: 'question_id veya deneme_question_id gerekli.' }, 400);
  }
  if (questionId != null && denemeQuestionId != null) {
    return response(request, { error: 'question_id ve deneme_question_id aynı anda gönderilemez.' }, 400);
  }

  const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (action === 'report') {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await serviceClient
      .from('question_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);
    if (countError) return response(request, { error: 'Bildirim limiti denetlenemedi.' }, 500);
    if ((count || 0) >= RATE_LIMIT_MAX) return response(request, { error: 'Kısa süre içinde çok fazla bildirim gönderdin. Lütfen daha sonra tekrar dene.' }, 429);

    const { data: feedback, error: insertError } = await serviceClient
      .from('question_feedback')
      .insert({
        question_id: questionId,
        deneme_question_id: denemeQuestionId,
        user_id: user.id,
        message: note,
        status: 'open',
      })
      .select('id')
      .single();
    if (insertError) return response(request, { error: 'Bildirim kaydedilemedi.' }, 500);

    const telegramSent = await sendTelegramNotice('report', feedback.id, questionId, denemeQuestionId).catch(() => false);
    return response(request, { ok: true, feedback_id: feedback.id, telegram_sent: telegramSent });
  }

  let lookup = serviceClient
    .from('question_feedback')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1);
  lookup = questionId !== null
    ? lookup.eq('question_id', questionId)
    : lookup.eq('deneme_question_id', denemeQuestionId as number);
  const { data: openFeedback, error: lookupError } = await lookup.maybeSingle();
  if (lookupError) return response(request, { error: 'Bildirim geri alma işlemi doğrulanamadı.' }, 500);
  if (!openFeedback) return response(request, { ok: true, retracted: false });

  const { error: updateError } = await serviceClient
    .from('question_feedback')
    .update({ status: 'retracted', resolved_at: new Date().toISOString() })
    .eq('id', openFeedback.id);
  if (updateError) return response(request, { error: 'Bildirim geri alınamadı.' }, 500);

  const telegramSent = await sendTelegramNotice('undo', openFeedback.id, questionId, denemeQuestionId).catch(() => false);
  return response(request, { ok: true, retracted: true, telegram_sent: telegramSent });
});

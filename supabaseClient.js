// Supabase proje ayarların — bunları Supabase Dashboard > Project Settings > API'den al.
const SUPABASE_URL = 'https://zrlsllbgqrllwgjyqbfv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9BNNjJTjh9AfWQsxM27BiQ_1KfT0x7C';

// Not: anon key public'tir, tarayıcıda görünmesi güvenlik açığı değildir.
// Gerçek güvenlik Supabase tarafındaki Row Level Security (RLS) politikalarıyla sağlanır.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // OAuth, e-posta doğrulama ve parola kurtarmada kısa ömürlü kod + yerel
    // verifier kullanılır; access/refresh token'ları URL fragmentinde taşıyan
    // eski implicit flow'a güvenilmez.
    flowType: 'pkce'
  }
});

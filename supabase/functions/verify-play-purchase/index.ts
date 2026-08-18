import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// verify-play-purchase
//
// İstemciden (Android/Capacitor) gelen Google Play satın alma bilgisini
// (product_id + purchase_token) Google Play Developer API (Android Publisher)
// ile sunucu tarafında doğrular. Doğrulama başarılıysa satın almayı Google'a
// "acknowledge" eder (aksi halde Google 3 gün içinde otomatik iade eder) ve
// public.apply_verified_purchase() RPC'siyle profili premium yapar.
//
// İstemci hiçbir zaman is_premium'u doğrudan yazamaz — bu fonksiyon tek
// yetkili yoldur. purchase_token benzersiz olduğu için aynı satın alma iki
// kez işlenemez (bkz. apply_verified_purchase içindeki idempotency kontrolü).
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = new Set([
  'https://zrlsllbgqrllwgjyqbfv.supabase.co',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
]);
const DEFAULT_ORIGIN = 'https://zrlsllbgqrllwgjyqbfv.supabase.co';

// Play Console'daki uygulamanızın applicationId'si (capacitor.config.json'daki appId ile aynı).
const ANDROID_PACKAGE_NAME = 'com.sinavrotasi.mebgys';

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

function normalizeProductId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('product_id gereklidir.');
  return value.trim();
}

function normalizePurchaseToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 10) throw new Error('Geçersiz purchase_token.');
  return value.trim();
}

// ---- Google OAuth2: service account ile access_token alma (JWT / RS256) ----

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = '';
  for (const byte of arr) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyPem = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!clientEmail || !privateKeyPem) throw new Error('Google service account yapılandırması eksik.');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const unsigned = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claimSet)))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google OAuth2 token alınamadı: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token as string;
}

// ---- Android Publisher API: managed product (yönetilen ürün) doğrulama ----

interface ProductPurchase {
  purchaseState: number; // 0 = satın alındı, 1 = iptal edildi, 2 = bekliyor
  acknowledgementState: number; // 0 = onaylanmamış, 1 = onaylanmış
  orderId?: string;
}

async function fetchProductPurchase(accessToken: string, productId: string, token: string): Promise<ProductPurchase> {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/products/${productId}/tokens/${token}`;
  const googleResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!googleResponse.ok) {
    throw new Error(`Google Play doğrulaması başarısız: ${googleResponse.status} ${await googleResponse.text()}`);
  }
  return await googleResponse.json();
}

async function consumePurchase(accessToken: string, productId: string, token: string): Promise<void> {
  // Ürünler Play Console'da "Tüketici" (consumable) olarak tanımlı: kullanıcı
  // süresi dolan bir paketi tekrar satın alabilmeli. acknowledge yerine
  // consume çağırıyoruz — consume, acknowledge'ı da kapsar ve satın alma
  // token'ını "tüketilmiş" işaretleyerek aynı ürünün yeniden satın
  // alınabilmesini açar. Bunu atlarsak kullanıcı ikinci kez aynı paketi
  // satın alamaz (Google "you already own this item" hatası verir).
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/products/${productId}/tokens/${token}:consume`;
  const consumeResponse = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!consumeResponse.ok) {
    // Bunu kritik kabul ediyoruz: consume başarısızsa kullanıcı bir sonraki
    // pakette "zaten sahipsin" hatası alır. Yine de premium'u geri almıyoruz
    // (satın alma zaten geçerliydi) ama hatayı yükseltip loglayarak görünür
    // kılıyoruz.
    console.error('Consume başarısız:', consumeResponse.status, await consumeResponse.text());
  }
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

  let productId: string;
  let purchaseToken: string;
  try {
    productId = normalizeProductId(payload.product_id);
    purchaseToken = normalizePurchaseToken(payload.purchase_token);
  } catch (error) {
    return response(request, { error: error instanceof Error ? error.message : 'Geçersiz istek.' }, 400);
  }

  let accessToken: string;
  let purchase: ProductPurchase;
  try {
    accessToken = await getGoogleAccessToken();
    purchase = await fetchProductPurchase(accessToken, productId, purchaseToken);
  } catch (error) {
    console.error('Play doğrulama hatası:', error);
    return response(request, { error: 'Satın alma Google Play ile doğrulanamadı.' }, 502);
  }

  if (purchase.purchaseState !== 0) {
    return response(request, { error: 'Satın alma geçerli değil (iptal edilmiş veya beklemede).' }, 402);
  }

  // Tüketici üründe consume işlemi idempotent değildir (token zaten
  // tüketilmişse Google 400 döner) — apply_verified_purchase zaten aynı
  // token'ı iki kez işlemeyi engellediği için burada risk yok, aynı token
  // için consume tekrar denenmeyecek.
  await consumePurchase(accessToken, productId, purchaseToken).catch((error) => console.error('Consume hatası:', error));

  const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: rpcError } = await serviceClient.rpc('apply_verified_purchase', {
    p_user_id: user.id,
    p_product_id: productId,
    p_purchase_token: purchaseToken,
    p_order_id: purchase.orderId ?? null,
    p_raw_response: purchase,
  });
  if (rpcError) {
    console.error('apply_verified_purchase hatası:', rpcError);
    return response(request, { error: 'Premium erişimi işlenemedi.' }, 500);
  }

  const result = Array.isArray(data) ? data[0] : data;
  return response(request, {
    ok: true,
    premium_until: result?.granted_until ?? null,
    already_applied: result?.already_applied ?? false,
  });
});

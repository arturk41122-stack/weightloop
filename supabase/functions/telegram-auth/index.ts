// Supabase Edge Function (Deno). Деплой: supabase functions deploy telegram-auth
//
// Зачем это нужно: у Supabase Auth нет встроенного провайдера "telegram".
// Эта функция:
//   1. Проверяет HMAC-подпись initData секретным ключом бота (защита от подделки).
//   2. Находит/создаёт auth-пользователя и профиль для этого telegram_id.
//   3. Генерирует magic-link через Admin API и отдаёт клиенту token_hash,
//      которым клиент обменивается на настоящую сессию через verifyOtp.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { crypto } from 'https://deno.land/std@0.203.0/crypto/mod.ts';
import { encodeHex } from 'https://deno.land/std@0.203.0/encoding/hex.ts';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

// Проверка подписи по алгоритму Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verifyInitData(initData: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), BOT_TOKEN);
  const computedHash = encodeHex(new Uint8Array(await hmacSha256(secretKey, dataCheckString)));

  if (computedHash !== hash) return null;

  // Данные не старше 24 часов
  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > 86400) return null;

  return Object.fromEntries(params.entries());
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { initData } = await req.json();
    const verified = await verifyInitData(initData);
    if (!verified) {
      return new Response('Invalid initData', { status: 401 });
    }

    const tgUser = JSON.parse(verified.user ?? '{}');
    const telegramId = String(tgUser.id);
    const email = `tg_${telegramId}@weightloop.internal`;

    // Найти существующего пользователя по telegram_id или создать нового
    let userId: string;

    const { data: byEmail } = await admin
      .from('profiles')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (byEmail) {
      userId = byEmail.id;
      // Юзернейм в Telegram могли сменить — держим профиль в актуальном состоянии
      if (tgUser.username) {
        await admin.from('profiles').update({ telegram_username: tgUser.username }).eq('id', userId);
      }
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { telegram_id: telegramId, full_name: tgUser.first_name },
      });
      if (createErr) throw createErr;
      userId = created.user.id;

      await admin.from('profiles').insert({
        id: userId,
        telegram_id: telegramId,
        telegram_username: tgUser.username ?? null,
        full_name: `${tgUser.first_name ?? ''} ${tgUser.last_name ?? ''}`.trim(),
      });
    }

    // Генерируем magic-link, но клиенту отдаём только token_hash (не сам URL)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) throw linkErr;

    const tokenHash = linkData.properties?.hashed_token;

    return new Response(JSON.stringify({ token_hash: tokenHash, email }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(`Auth error: ${err instanceof Error ? err.message : 'unknown'}`, { status: 500 });
  }
});

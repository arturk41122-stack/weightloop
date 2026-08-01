import { supabase } from './supabase';

/**
 * Supabase не имеет встроенного OAuth-провайдера "telegram", поэтому
 * авторизация идёт через Edge Function `telegram-auth`:
 *
 * 1. Клиент отправляет `initData` (подписанную строку от Telegram WebApp)
 *    на Edge Function.
 * 2. Edge Function проверяет HMAC-подпись initData секретным токеном бота,
 *    находит/создаёт пользователя через Supabase Admin API и генерирует
 *    magic-link, возвращая клиенту только `token_hash`.
 * 3. Клиент обменивает `token_hash` на реальную сессию через verifyOtp —
 *    это единственный шаг, который создаёт настоящие access/refresh токены.
 *
 * Подробности реализации — в supabase/functions/telegram-auth/index.ts
 */
export async function signInWithTelegram(initData: string) {
  if (!initData) {
    throw new Error('initData пустой — открой приложение внутри Telegram');
  }

  const functionsUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-auth`;

  const res = await fetch(functionsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram auth failed: ${err}`);
  }

  const { token_hash, email } = await res.json();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: token_hash,
    type: 'magiclink',
  });

  if (error) throw error;
  return data;
}

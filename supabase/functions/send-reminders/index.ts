// Supabase Edge Function (Deno). Деплой: supabase functions deploy send-reminders
// Дёргается раз в минуту через pg_cron (см. migrations/0003_reminders_cron.sql).
//
// Логика: находим все профили, у которых profiles.reminder_time (формат "HH:MM")
// совпадает с текущим временем UTC с точностью до минуты, и шлём каждому сообщение
// через Telegram Bot API sendMessage.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function currentHHMM(): string {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function sendTelegramMessage(chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('Telegram sendMessage failed:', await res.text());
  }
}

serve(async (_req) => {
  const nowHHMM = currentHHMM();

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('telegram_id, full_name, reminder_time')
    .eq('reminder_time', nowHHMM);

  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const messages = [
    'Время чек-ина! Как прошёл день — что ел, сколько шагов? 📝',
    'Не забудь отметиться в WEIGHTLOOP сегодня 💪',
    'Пара минут на чек-ин — и ты на шаг ближе к цели 🔥',
  ];

  let sent = 0;
  for (const p of profiles ?? []) {
    if (!p.telegram_id) continue;
    const text = messages[Math.floor(Math.random() * messages.length)];
    await sendTelegramMessage(p.telegram_id, text);
    sent++;
  }

  return new Response(JSON.stringify({ ok: true, sent, at: nowHHMM }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

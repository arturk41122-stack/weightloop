// Supabase Edge Function (Deno). Деплой: supabase functions deploy analyze-meal
// Принимает публичный URL фото (уже загруженного в Storage) + текстовую заметку
// пользователя, просит Claude оценить КБЖУ и дать короткий дружелюбный фидбек.
//
// Секрет ANTHROPIC_API_KEY нужно добавить:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SYSTEM_PROMPT = `Ты — дружелюбный нутрициолог-бот в приложении для похудения WEIGHTLOOP.
Тебе присылают фото еды. Оцени состав блюда на глаз и верни ТОЛЬКО JSON без markdown-обёртки, без пояснений:
{
  "calories": число (ккал),
  "proteins": число (г),
  "carbs": число (г),
  "fats": число (г),
  "feedback": "1-2 коротких предложения на русском, тёплый и поддерживающий тон, без осуждения"
}
Если на фото не еда — верни calories/proteins/carbs/fats = 0 и feedback с вежливой просьбой прислать фото блюда.`;

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Проверяем, что запрос пришёл от авторизованного пользователя нашего приложения
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response('Unauthorized', { status: 401 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { photoUrl, notes } = await req.json();
    if (!photoUrl) {
      return new Response(JSON.stringify({ error: 'photoUrl обязателен' }), { status: 400 });
    }

    // Скачиваем фото и кодируем в base64 — Anthropic API принимает изображения инлайн
    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: 'Не удалось загрузить фото по URL' }), { status: 400 });
    }
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
              { type: 'text', text: notes ? `Заметка пользователя: ${notes}` : 'Оцени это блюдо.' },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Anthropic API error:', errText);
      return new Response(JSON.stringify({ error: 'Ошибка AI-анализа' }), { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const textBlock = claudeData.content?.find((c: { type: string }) => c.type === 'text');
    const raw = (textBlock?.text ?? '{}').trim().replace(/^```json\s*|\s*```$/g, '');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { calories: 0, proteins: 0, carbs: 0, fats: 0, feedback: 'Не удалось распознать блюдо, попробуй другое фото.' };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }), {
      status: 500,
    });
  }
});

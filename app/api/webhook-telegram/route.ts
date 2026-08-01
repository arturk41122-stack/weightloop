import { NextRequest, NextResponse } from 'next/server';

/**
 * Вебхук для Telegram-бота (команды /start, напоминания и т.д.)
 * Настрой у BotFather / через setWebhook на:
 *   https://<твой-домен>/api/webhook-telegram
 *
 * В App Router нет `export const config = { api: { bodyParser: false } }` —
 * это синтаксис Pages Router. Здесь просто читаем тело запроса напрямую.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const update = await req.json();

  // TODO: обработать update.message / update.callback_query и т.д.
  console.log('Telegram update:', update);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: 'webhook is up' });
}

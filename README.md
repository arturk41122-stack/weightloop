# WEIGHTLOOP

Telegram Mini App: фото еды + чек-ины + спринты похудения + бадди.

## Что исправлено относительно исходного ТЗ

1. **Telegram-авторизация.** `supabase.auth.signInWithIdToken({ provider: 'telegram' })` не существует
   как провайдер в Supabase. Заменено на Edge Function `supabase/functions/telegram-auth`, которая
   проверяет HMAC-подпись `initData` секретным токеном бота и выдаёт настоящую сессию Supabase
   через `admin.generateLink` + `verifyOtp` на клиенте (`lib/telegramAuth.ts`).
2. **Структура папок.** Убран дублирующий `app/(main)/page.tsx`, конфликтовавший с корневым
   `app/page.tsx` на одном и том же роуте `/`.
3. **API-роут.** `app/api/webhook-telegram/route.ts` переписан под синтаксис App Router
   (`export async function POST/GET`) вместо синтаксиса Pages Router.
4. **Avatar.** Теперь используется правильно: `<Avatar><AvatarImage /><AvatarFallback>👤</AvatarFallback></Avatar>`.
5. **Типы Telegram WebApp.** Добавлен `types/telegram.d.ts`, чтобы `window.Telegram.WebApp` не падал
   с ошибкой типов в TypeScript.
6. **Реальная запись в базу.** `stores/useAppStore.ts` теперь пишет в Supabase (`insert`/`select`),
   а не только хранит данные в памяти Zustand — иначе они бы исчезали при перезагрузке.
7. Добавлена SQL-миграция (`supabase/migrations/0001_init.sql`) с таблицами `profiles`, `meals`,
   `sprints`, `checkins`, `buddies` и RLS-политиками "каждый видит только своё" — без них методы
   стора просто получали бы ошибку 42P01 (таблица не существует).

## Запуск локально

```bash
npm install
cp .env.example .env.local   # заполнить своими ключами Supabase
npm run dev
```

Открой http://localhost:3000 — вне Telegram авторизация просто пропускается (см. `app/page.tsx`),
так что вёрстку и статичные экраны видно сразу. Для полноценного теста нужен реальный запуск
внутри Telegram (см. ниже).

## Настройка Supabase

1. Создай проект на supabase.com, возьми `Project URL` и `anon key` → `.env.local`.
2. Прогони миграцию:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
3. Задеплой Edge Function:
   ```bash
   supabase functions deploy telegram-auth
   supabase secrets set TELEGRAM_BOT_TOKEN=xxxx SUPABASE_SERVICE_ROLE_KEY=xxxx
   ```

## Настройка Telegram-бота

1. Создай бота через [@BotFather](https://t.me/BotFather), получи токен.
2. `/setmenubutton` или `/newapp` → укажи URL твоего деплоя на Vercel как Web App URL.
3. Задеплой на Vercel (`vercel --prod`), пропиши те же env-переменные в настройках проекта.
4. (Опционально) настрой вебхук бота на `/api/webhook-telegram` для команд типа `/start` и напоминаний —
   `TELEGRAM_WEBHOOK_SECRET` должен совпадать с секретом, который ты передашь в `setWebhook`.

## Что доделано во второй итерации

- **Фото еды.** `lib/storage.ts` реально загружает файл в Supabase Storage (бакет `meal-photos`,
  папка `{userId}/...`, публичный на чтение / пишет только владелец — см. миграцию 0002).
- **AI-анализ фото.** Edge Function `supabase/functions/analyze-meal` отправляет фото в Claude
  (vision) и возвращает КБЖУ + короткий фидбек; `lib/mealAnalysis.ts` вызывает её с клиента.
  Нужен секрет `ANTHROPIC_API_KEY` (`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`).
- **Бадди по юзернейму.** `telegram_username` подтягивается автоматически при каждом входе
  (см. `telegram-auth`). Приглашение создаёт запись в `buddy_invites`; принятие идёт через
  Edge Function `accept-buddy-invite`, потому что двустороннюю запись в `buddies` с чужим
  `user_id` обычный клиент вставить не может — это специально запрещено RLS-политикой.
- **Напоминания.** Edge Function `supabase/functions/send-reminders` шлёт сообщение в Telegram
  всем, у кого `profiles.reminder_time` совпадает с текущей минутой UTC. Расписание —
  `pg_cron` каждую минуту, см. `supabase/migrations/0003_reminders_cron.sql` (там же — как
  завести `SUPABASE_URL`/`SERVICE_ROLE_KEY` через Vault, чтобы не хардкодить секреты в SQL).

### Деплой всех Edge Functions разом

```bash
supabase functions deploy telegram-auth
supabase functions deploy analyze-meal
supabase functions deploy accept-buddy-invite
supabase functions deploy send-reminders
supabase secrets set TELEGRAM_BOT_TOKEN=xxxx ANTHROPIC_API_KEY=sk-ant-xxxx
supabase db push   # применит все три миграции, включая 0002 и 0003
```

## Что всё ещё осталось на будущее

- В `pg_cron`-задаче используется Vault для секретов — если Vault не настроен, шаг деплоя
  `0003_reminders_cron.sql` нужно подправить (захардкодить URL/ключ или включить Vault в
  дашборде Supabase).
- Экран прогресса (вкладка "Дом") всё ещё показывает фиксированное "—1.8 кг" — расчёт
  реального прогресса по `checkins`/`sprints` не подключён.
- Уведомление о новом приглашении в бадди приходит только когда пользователь открывает
  приложение (poll при загрузке), а не пушом от Telegram-бота в реальном времени.

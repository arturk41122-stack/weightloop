-- Планировщик для ежедневных напоминаний.
-- Supabase поддерживает pg_cron + pg_net "из коробки" (расширения включаются в дашборде:
-- Database → Extensions → pg_cron, pg_net).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Каждую минуту дёргаем Edge Function send-reminders. Она сама решает, кому пора слать
-- напоминание, сверяя profiles.reminder_time с текущим временем (см. код функции).
select
  cron.schedule(
    'weightloop-send-reminders',
    '* * * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/send-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $$
  );

-- ПРИМЕЧАНИЕ: значения edge_functions_base_url (https://<project-ref>.functions.supabase.co)
-- и service_role_key нужно один раз добавить в Vault:
--   select vault.create_secret('https://<project-ref>.functions.supabase.co', 'edge_functions_base_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- Если использовать Vault не хочется — можно захардкодить URL и ключ прямо в net.http_post
-- ниже (менее безопасно, но проще для старта).

// Supabase Edge Function (Deno). Деплой: supabase functions deploy accept-buddy-invite
//
// Почему это Edge Function, а не прямой insert с клиента:
// RLS-политика buddies_all_own разрешает писать только строки со своим user_id.
// Принятие инвайта должно создать buddies-запись ОБЕИМ сторонам (мне и пригласившему),
// а вставить строку с user_id = чужой id клиент не может — это и есть защита RLS.
// Поэтому обе вставки делает service-role функция после проверки, что инвайт
// действительно адресован вызывающему пользователю.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
  } = await asUser.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  try {
    const { inviteId } = await req.json();

    const { data: invite, error: inviteErr } = await admin
      .from('buddy_invites')
      .select('*')
      .eq('id', inviteId)
      .single();
    if (inviteErr || !invite) return new Response('Invite not found', { status: 404 });

    const { data: myProfile } = await admin.from('profiles').select('telegram_username').eq('id', user.id).single();
    if (!myProfile || myProfile.telegram_username !== invite.to_username) {
      return new Response('Этот инвайт адресован не тебе', { status: 403 });
    }
    if (invite.status !== 'pending') {
      return new Response('Инвайт уже обработан', { status: 409 });
    }

    await admin.from('buddy_invites').update({ status: 'accepted' }).eq('id', invite.id);

    const { data: mine, error: e1 } = await admin
      .from('buddies')
      .insert({ user_id: user.id, buddy_id: invite.from_user, status: 'active' })
      .select()
      .single();
    if (e1) throw e1;

    await admin.from('buddies').insert({ user_id: invite.from_user, buddy_id: user.id, status: 'active' });

    return new Response(JSON.stringify({ ok: true, buddy: mine }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }), { status: 500 });
  }
});

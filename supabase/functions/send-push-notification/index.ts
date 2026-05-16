import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUSH_TYPES = new Set(['duel_turn', 'duel_challenge']);

function pushTitle(type: string, fallback: string): string {
  if (type === 'duel_turn') return 'Du bist am Zug';
  if (type === 'duel_challenge') return 'Freund hat dich herausgefordert';
  return fallback;
}

function openUrl(type: string, relatedId: string | null): string {
  const origin = Deno.env.get('APP_ORIGIN') || 'https://booksmart.ch';
  if ((type === 'duel_turn' || type === 'duel_challenge') && relatedId) {
    return `${origin}/?duel=${relatedId}`;
  }
  if (type === 'friend_request') return `${origin}/?notifications=1`;
  return origin;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: 'notification_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: notif, error: notifError } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, message, related_id, created_at')
      .eq('id', notification_id)
      .single();

    if (notifError || !notif) {
      return new Response(JSON.stringify({ error: 'notification not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!PUSH_TYPES.has(notif.type)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const createdAt = new Date(notif.created_at).getTime();
    if (Date.now() - createdAt > 5 * 60 * 1000) {
      return new Response(JSON.stringify({ skipped: true, reason: 'stale' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    webpush.setVapidDetails('mailto:hello@booksmart.ch', vapidPublic, vapidPrivate);

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notif.user_id);

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({
      title: pushTitle(notif.type, notif.title),
      body: notif.message,
      url: openUrl(notif.type, notif.related_id),
      type: notif.type,
    });

    let sent = 0;
    const staleIds: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
        console.warn('push failed', sub.endpoint, err);
      }
    }

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

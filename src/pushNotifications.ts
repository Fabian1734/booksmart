import { supabase } from './supabase';

export type NotificationType = 'friend_request' | 'duel_challenge' | 'duel_turn' | 'duel_completed';

const PUSH_NOTIFICATION_TYPES: NotificationType[] = ['duel_turn', 'duel_challenge'];

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function subscribeToPush(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  const vapidPublicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, reason: 'no_vapid' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await reg.update();
    const ready = await navigator.serviceWorker.ready;
    let subscription = await ready.pushManager.getSubscription();
    if (!subscription) {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'invalid_subscription' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      console.warn('push_subscriptions upsert:', error.message);
      const missing = error.code === 'PGRST205' || error.message.includes('push_subscriptions');
      return { ok: false, reason: missing ? 'table_missing' : 'db_error' };
    }

    return { ok: true };
  } catch (err) {
    console.warn('subscribeToPush:', err);
    return { ok: false, reason: 'subscribe_failed' };
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
    }
  } catch (err) {
    console.warn('unsubscribeFromPush:', err);
  }
}

export async function createNotification(payload: {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_id?: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.warn('createNotification:', error.message);
    return null;
  }

  if (data?.id && PUSH_NOTIFICATION_TYPES.includes(payload.type)) {
    try {
      const { error: fnError } = await supabase.functions.invoke('send-push-notification', {
        body: { notification_id: data.id },
      });
      if (fnError) console.warn('send-push-notification:', fnError.message);
    } catch (err) {
      console.warn('send-push-notification invoke:', err);
    }
  }

  return data;
}

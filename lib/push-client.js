'use client';
import { useEffect, useRef, useState } from 'react';
import { getJson } from './hooks';

function urlB64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Avisos push con la app cerrada. state: loading | unsupported | disabled | off | on | denied | error
export function usePushAlerts(alerts, setAlerts) {
  const [state, setState] = useState('loading');
  const sub = useRef(null);
  const key = useRef(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        return setState('unsupported');
      }
      try {
        const cfg = await getJson('/api/push/config');
        if (!cfg.enabled) return setState('disabled');
        key.current = cfg.publicKey;
        const reg = await navigator.serviceWorker.register('/sw.js');
        sub.current = await reg.pushManager.getSubscription();
        setState(sub.current ? 'on' : Notification.permission === 'denied' ? 'denied' : 'off');
      } catch {
        setState('disabled');
      }
    })();
  }, []);

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = await navigator.serviceWorker.ready;
      sub.current = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key.current) });
      setState('on');
    } catch {
      setState('error');
    }
  };

  const disable = async () => {
    const s = sub.current;
    sub.current = null;
    setState('off');
    if (!s) return;
    await fetch('/api/push/sync', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => {});
    await s.unsubscribe().catch(() => {});
  };

  // Envía las alertas al servidor cuando cambian y marca las que el servidor ya disparó.
  const sig = JSON.stringify(alerts.map((a) => [a.id, a.symbol, a.op, a.price, a.triggered, a.rearmedAt || 0]));
  useEffect(() => {
    if (state !== 'on' || !sub.current) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/push/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.current.toJSON(), alerts }),
        });
        const d = await res.json();
        if (!d.fired?.length) return;
        const fired = new Map(d.fired.map((f) => [f.id, f]));
        setAlerts((list) => list.map((a) => {
          const f = fired.get(a.id);
          return f && !a.triggered ? { ...a, triggered: true, triggeredAt: f.triggeredAt, triggeredPrice: f.triggeredPrice, remote: true } : a;
        }));
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [sig, state]); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, enable, disable };
}

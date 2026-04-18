import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/constants';

// True when both the browser thinks we're online AND the server is reachable.
// WebView2 (plugin) reports navigator.onLine = true even with no actual internet,
// so we also poll /health and fall back to that as the source of truth.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });
  const pingInFlight = useRef(false);

  useEffect(() => {
    const healthUrl = API_BASE.replace(/\/api\/v\d+\/?$/, '') + '/health';

    const ping = async () => {
      if (pingInFlight.current) return;
      pingInFlight.current = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(healthUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
        setOnline(res.ok);
      } catch {
        setOnline(false);
      } finally {
        clearTimeout(timer);
        pingInFlight.current = false;
      }
    };

    const goOnline = () => { ping(); };
    const goOffline = () => setOnline(false);
    const onVisibility = () => { if (document.visibilityState === 'visible') ping(); };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisibility);

    // Initial check + periodic heartbeat.
    ping();
    const interval = setInterval(ping, 15000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  return online;
}

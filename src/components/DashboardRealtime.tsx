import React, { useEffect, useRef, useState } from 'react';

function useDebounced(fn: (...args: any[]) => void, ms = 800) {
  const t = useRef<number | null>(null);
  return (...args: any[]) => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(...args), ms);
  };
}

export default function DashboardRealtime({ companyId, surveyId }: { companyId: string; surveyId: string }) {
  const [aggregates, setAggregates] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  const fetchAgg = async () => {
    try {
      const res = await fetch(`/api/aggregates?surveyId=${encodeURIComponent(surveyId)}`, { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json && json.ok) setAggregates(json.aggregates);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('fetchAgg error', e);
    }
  };

  const debouncedFetch = useDebounced(fetchAgg, 800);

  useEffect(() => {
    // obtain a short-lived token for this tenant (dev helper)
    (async () => {
      try {
        // request login and let server set HTTP-only cookie (credentials included)
        await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }), credentials: 'include' });
        // open EventSource without token; cookie will be sent when same-origin or proxied
        const es = new EventSource(`/sse`);
        es.onopen = () => setConnected(true);
        es.onerror = (err) => { console.warn('SSE error', err); setConnected(false); };

        const onResponseCreated = (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload && payload.surveyId === surveyId && payload.companyId === companyId) {
              debouncedFetch();
            }
          } catch (e) {
            debouncedFetch();
          }
        };

        const onResponseChanged = (ev: MessageEvent) => {
          debouncedFetch();
        };

        es.addEventListener('response:created', onResponseCreated as EventListener);
        es.addEventListener('response:changed', onResponseChanged as EventListener);

        // cleanup
        (window as any).__dashboard_es = es;
        (window as any).__dashboard_onResponseCreated = onResponseCreated;
        (window as any).__dashboard_onResponseChanged = onResponseChanged;
      } catch (e) {
        console.error('login+SSE failed', e);
      }
    })();
    // initial load will be triggered after login
    fetchAgg();

    return () => {
      const es = (window as any).__dashboard_es;
      const onResp = (window as any).__dashboard_onResponseCreated;
      const onChanged = (window as any).__dashboard_onResponseChanged;
      if (es && onResp) es.removeEventListener('response:created', onResp as EventListener);
      if (es && onChanged) es.removeEventListener('response:changed', onChanged as EventListener);
      if (es) es.close();
    };
  }, [companyId, surveyId]);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Realtime</strong> SSE: {connected ? 'connected' : 'disconnected'}
      </div>
      {aggregates ? (
        <pre style={{ maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(aggregates, null, 2)}</pre>
      ) : (
        <div>Loading aggregates...</div>
      )}
    </div>
  );
}

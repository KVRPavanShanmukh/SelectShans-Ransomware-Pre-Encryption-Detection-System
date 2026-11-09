const rawUrl = (import.meta.env.VITE_API_URL || '/api').trim();
// If VITE_API_URL is configured as '/api' or empty, normalize to '' so that
// calls using `${API_URL}/api/...` cleanly resolve to relative `/api/...`
// without producing duplicate `/api/api/...` path prefixes.
export const API_URL = (rawUrl === '/api' || rawUrl === 'api' || rawUrl === '')
  ? ''
  : rawUrl.replace('localhost', '127.0.0.1').replace(/\/api\/?$/, '').replace(/\/+$/, '');

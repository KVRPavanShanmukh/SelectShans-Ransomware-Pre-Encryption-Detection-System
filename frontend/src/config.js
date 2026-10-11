const rawUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
export const API_URL = rawUrl.replace('localhost', '127.0.0.1').replace(/\/+$/, '');

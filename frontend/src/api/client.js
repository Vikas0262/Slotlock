import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = axios.create({ baseURL: BASE_URL });

export function setAuthHeaders(role, userId) {
  api.defaults.headers.common['x-user-role'] = role;
  api.defaults.headers.common['x-user-id'] = userId;
}

export function genIdempotencyKey() {
  return crypto.randomUUID();
}

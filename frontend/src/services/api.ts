const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'http://localhost:3001/api';
const PRODUCTS_URL = import.meta.env.VITE_PRODUCTS_URL || 'http://localhost:3002/api';
const CART_URL = import.meta.env.VITE_CART_URL || 'http://localhost:3003/api';
const ORDERS_URL = import.meta.env.VITE_ORDERS_URL || 'http://localhost:3004/api';

async function fetchAnon(url: string, body?: unknown, params?: Record<string, any>, method?: string): Promise<any> {
  const searchParams = params ? '?' + new URLSearchParams(params as any).toString() : '';
  const res = await fetch(url + searchParams, {
    method: body ? (method || 'POST') : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Request failed');
  return json;
}

async function fetchWithAuth(url: string, token: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (res.status === 401) {
    throw { unauthorized: true };
  }
  if (!res.ok) throw new Error(json.error?.message || 'Request failed');
  return json;
}

export const authApi = {
  login: (email: string, password: string) => fetchAnon(`${AUTH_URL}/auth/login`, { email, password }),
  register: (email: string, password: string, name: string) => fetchAnon(`${AUTH_URL}/auth/register`, { email, password, name }),
};

export const productsApi = {
  list: (params?: { search?: string; category?: string; page?: number }) => fetchAnon(`${PRODUCTS_URL}/products`, undefined, params, 'GET'),
  get: (id: string) => fetchAnon(`${PRODUCTS_URL}/products/${id}`, undefined, undefined, 'GET'),
};

export const cartApi = {
  get: (token: string) => fetchWithAuth(`${CART_URL}/cart`, token),
  addItem: (token: string, productId: string, quantity: number) => fetchWithAuth(`${CART_URL}/cart/items`, token, { productId, quantity }, 'POST'),
  updateItem: (token: string, productId: string, quantity: number) => fetchWithAuth(`${CART_URL}/cart/items/${productId}`, token, { quantity }, 'PATCH'),
  removeItem: (token: string, productId: string) => fetchWithAuth(`${CART_URL}/cart/items/${productId}`, token, undefined, 'DELETE'),
  clear: (token: string) => fetchWithAuth(`${CART_URL}/cart`, token, undefined, 'DELETE'),
};

export const ordersApi = {
  list: (token: string) => fetchWithAuth(`${ORDERS_URL}/orders`, token),
  get: (token: string, orderId: string) => fetchWithAuth(`${ORDERS_URL}/orders/${orderId}`, token),
  create: (token: string, data: { items: any[]; shippingAddress: any }) => fetchWithAuth(`${ORDERS_URL}/orders`, token, data, 'POST'),
};
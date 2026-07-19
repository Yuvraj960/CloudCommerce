/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_PRODUCTS_URL: string;
  readonly VITE_CART_URL: string;
  readonly VITE_ORDERS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
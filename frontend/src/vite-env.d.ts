/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the backend API, e.g. https://kanban-api.onrender.com.
   * Baked in at build time (Vite inlines import.meta.env). Leave unset in
   * development: requests stay same-origin and the Vite proxy handles them.
   */
  readonly VITE_API_URL?: string;
}

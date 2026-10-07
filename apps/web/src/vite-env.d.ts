/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Tag Manager container ID (GTM-XXXXXXX). Public; production builds only. */
  readonly VITE_GTM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

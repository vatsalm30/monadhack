/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT?: string;
  readonly VITE_START_BLOCK?: string;
  readonly VITE_ENVIO_URL?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

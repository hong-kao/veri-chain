/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_FACT_CHECK_REGISTRY_ADDRESS: string;
  readonly VITE_STAKE_POOL_ADDRESS: string;
  readonly VITE_API_BASE_URL?: string;
  // add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum: any;
}
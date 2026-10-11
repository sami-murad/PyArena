/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_MAX_CODE_CHARS?: string;
  readonly VITE_MAX_STDIN_CHARS?: string;
  readonly VITE_FEATURE_COMPETITIONS?: string;
  readonly VITE_FEATURE_SNIPPETS?: string;
  readonly VITE_FEATURE_ERROR_EXPLANATIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

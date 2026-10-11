/**
 * Feature flags. Each can be switched off at build time with
 * VITE_FEATURE_<NAME>=false (for example VITE_FEATURE_COMPETITIONS=false).
 */
const env = import.meta.env;

function flag(name: string, fallback = true): boolean {
  const value = env[`VITE_FEATURE_${name}`];
  if (value === undefined || value === "") return fallback;
  return value !== "false" && value !== "0";
}

export const features = {
  competitions: flag("COMPETITIONS"),
  snippets: flag("SNIPPETS"),
  errorExplanations: flag("ERROR_EXPLANATIONS"),
} as const;

export type FeatureFlag = keyof typeof features;

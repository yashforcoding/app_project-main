/** Builds a full API URL from a path like '/finance/dashboard'. */
export function apiUrl(path: string) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const base = process.env.EXPO_PUBLIC_API_URL ?? (domain ? `https://${domain}` : '');
  return `${base}/api${path}`;
}

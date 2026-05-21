export function assetUrl(path: string | null | undefined): string {
  if (!path) return "";
  return `/api/asset?path=${encodeURIComponent(path)}`;
}

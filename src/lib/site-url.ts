// Volgorde: expliciete env var (aanbevolen zodra er een eigen domein is)
// -> Vercel's automatisch gezette preview-/productie-URL -> lokaal.
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

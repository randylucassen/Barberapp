import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

// Alleen "/" — de rest van de app is ingelogde functionaliteit zonder
// SEO-waarde (zie robots.ts). Uit te breiden zodra er publieke
// marketingpagina's bijkomen.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: getSiteUrl(), lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}

import { Resend } from "resend";
import { getSiteUrl } from "@/lib/site-url";

// Server-only Resend-client. Nooit importeren in client-code — de API-key
// mag nooit naar de browser lekken. Lazy geïnstantieerd, zelfde reden als
// src/lib/stripe.ts: Next.js laadt route-modules ook tijdens `next
// build`, nog vóórdat RESEND_API_KEY per se gezet hoeft te zijn.
let client: Resend | undefined;

export function getResend(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY!);
  }
  return client;
}

// Eén simpele, merk-consistente template — geen React Email/MJML nodig
// voor korte transactionele tekst (titel + body). Kleuren 1:1 uit
// tailwind.config.ts (accent #0EA5A4, primary #111111) — geen losse
// email-huisstijl die uit de pas kan gaan lopen met de app zelf.
export function notificationEmailHtml(title: string, body: string): string {
  const siteUrl = getSiteUrl();
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#EDEFF1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:18px;overflow:hidden;">
      <div style="height:6px;background:#0EA5A4;"></div>
      <div style="padding:32px;">
        <div style="font-size:20px;font-weight:700;color:#111111;letter-spacing:-0.01em;">Groomy</div>
        <div style="margin-top:28px;font-size:20px;font-weight:700;color:#111111;letter-spacing:-0.01em;">${title}</div>
        <div style="margin-top:10px;font-size:15px;line-height:23px;color:#4B5563;">${body}</div>
        <a href="${siteUrl}" style="display:inline-block;margin-top:28px;background:#0EA5A4;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:999px;">Bekijk in Groomy</a>
      </div>
      <div style="padding:20px 32px;background:#F8F8F8;border-top:1px solid #F1F2F4;">
        <div style="font-size:12px;line-height:18px;color:#9CA3AF;">
          Je ontvangt dit omdat e-mailmeldingen aanstaan voor je account — pas dit aan in de app onder Instellingen.
        </div>
        <div style="font-size:12px;line-height:18px;color:#9CA3AF;margin-top:8px;">
          Groomy · Barbershop Noviomagus · Plein 1944-17, 6511 JC Nijmegen
        </div>
      </div>
    </div>
  </body>
</html>`;
}

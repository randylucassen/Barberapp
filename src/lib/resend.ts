import { Resend } from "resend";

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
// voor korte transactionele tekst (titel + body).
export function notificationEmailHtml(title: string, body: string): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:32px;">
      <div style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.01em;">Groomy</div>
      <div style="margin-top:24px;font-size:18px;font-weight:700;color:#111827;">${title}</div>
      <div style="margin-top:8px;font-size:15px;line-height:22px;color:#4B5563;">${body}</div>
    </div>
  </body>
</html>`;
}

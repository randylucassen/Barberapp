import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

// Gedeelde autorisatiestap voor elke /api/admin/*-route: de meegegeven,
// sessie-gebonden client identificeert WIE er aanroept (auth.getUser()
// leest de sessie/cookie, dat kan de service role niet — die heeft geen
// eigen "huidige gebruiker"). De admin_users-lookup zelf moet wél met de
// service role: die tabel heeft bewust nul client-grants (zelfde
// precedent als discount_codes), dus een select met de gewone sessie-
// client geeft altijd permission-denied (dus data: null) terug, ook voor
// een echte admin — precies de fout die hier eerder zat en middleware.ts
// ook had.
export async function requireAdmin(
  supabase: SupabaseClient
): Promise<{ id: string; fullName: string } | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: admin } = await createServiceClient()
    .from("admin_users")
    .select("id, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!admin) return null;

  return { id: admin.id, fullName: admin.full_name };
}

// Aangeroepen met de service-role client (admin_action_log heeft geen
// enkele client-grant, zelfde precedent als admin_users) — na elke
// geslaagde /api/admin/*-mutatie, zodat het logboek nooit een actie
// mist door een vergeten aanroep in een individuele route.
export async function logAdminAction(
  serviceClient: SupabaseClient,
  params: { adminId: string; action: string; targetType?: string; targetId?: string; detail?: string }
): Promise<void> {
  await serviceClient.from("admin_action_log").insert({
    admin_id: params.adminId,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    detail: params.detail ?? null,
  });
}

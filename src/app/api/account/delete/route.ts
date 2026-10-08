import { NextRequest, NextResponse } from "next/server";
import { createClient, getRequestUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Verwijdert alle in Storage opgeslagen bestanden onder {userId}/ in een
// barber-bucket — uploadBarberFile() (storage.ts) legt alles daaronder
// neer, dus dit vangt avatar/portfolio/diploma/documenten in één keer,
// zonder elke url-kolom apart te moeten parsen.
async function clearBarberStorageFolder(
  service: ReturnType<typeof createServiceClient>,
  bucket: "barber-media" | "barber-documents",
  userId: string
) {
  const { data: files } = await service.storage.from(bucket).list(userId);
  if (files && files.length > 0) {
    await service.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
  }
}

export async function POST(request: NextRequest) {
  // getRequestUser() i.p.v. supabase.auth.getUser() direct — valt terug
  // op een Bearer-header voor de native app (geen cookies daar).
  const { user, supabase } = await getRequestUser(request, await createClient());
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Anonimiseren loopt via de eigen sessie (RPC is security definer,
  // scoped op auth.uid()) — geen service role nodig voor dit deel.
  const { error: rpcError } = await supabase.rpc("request_account_deletion");
  if (rpcError) {
    return NextResponse.json({ error: "Verwijderen is niet gelukt." }, { status: 500 });
  }

  // Alles hieronder vereist de service role: Storage-opruiming buiten de
  // eigen upload-policies om, en de Auth Admin-API (geen client-SDK-pad
  // om de eigen login te blokkeren/e-mail te wissen).
  const service = createServiceClient();

  if (profile?.role === "barber") {
    await clearBarberStorageFolder(service, "barber-media", user.id);
    await clearBarberStorageFolder(service, "barber-documents", user.id);
  }

  // Permanente ban (geen "delete" van de auth.users-rij — dat zou via de
  // on-delete-cascade op profiles.id ook alle boekingen/betalingen van de
  // ANDERE partij meesleuren, zie de migratie). E-mail wordt vervangen
  // zodat het oorspronkelijke adres weer vrijkomt voor een nieuwe
  // registratie en er geen echt e-mailadres in auth.users blijft staan.
  await service.auth.admin.updateUserById(user.id, {
    ban_duration: "876000h",
    email: `deleted-${user.id}@kpprtje.invalid`,
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (accessToken) {
    await service.auth.admin.signOut(accessToken, "global");
  }

  return NextResponse.json({ ok: true });
}

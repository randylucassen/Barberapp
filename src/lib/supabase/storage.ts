import type { SupabaseClient } from "@supabase/supabase-js";

type BarberBucket = "barber-media" | "barber-documents";

// Uploadt een bestand naar de eigen map (userId) in een van de barber-
// buckets (zie supabase/migrations/0004_barber_verification.sql). Voor
// "barber-media" (publiek) wordt de publieke URL teruggegeven; voor
// "barber-documents" (privé) het storage-pad, want een publieke URL werkt
// daar toch niet — pas een scherm dat het document ooit moet tonen, haalt
// een signed URL op.
export async function uploadBarberFile(
  supabase: SupabaseClient,
  bucket: BarberBucket,
  userId: string,
  fileName: string,
  file: File
): Promise<string> {
  const path = `${userId}/${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;

  if (bucket === "barber-media") {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  return path;
}

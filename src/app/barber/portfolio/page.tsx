"use client";
import Image from "next/image";
import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile } from "@/lib/supabase/queries";
import { uploadBarberFile } from "@/lib/supabase/storage";

// Los scherm van de eenmalige upload bij /barber/aanmelden — die liet een
// barber het portfolio nooit meer bijwerken na de aanmelding. Zelfde
// opslaan-patroon als /barber/werkgebied: lokaal bewerken, pas
// daadwerkelijk wegschrijven bij "Opslaan", niet per foto los.
export default function PortfolioPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const profile = await getBarberProfile(supabase, data.user.id);
      if (profile) setPortfolioUrls(profile.portfolioUrls ?? []);
    })();
  }, []);

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !userId) return;
    setUploading(true);
    setError(null);
    const supabase = createClient();
    try {
      const uploads = await Promise.all(
        Array.from(files).map((file, i) =>
          uploadBarberFile(supabase, "barber-media", userId, `portfolio-${Date.now()}-${i}-${file.name}`, file)
        )
      );
      setPortfolioUrls((prev) => [...prev, ...uploads]);
    } catch {
      setError("Uploaden is mislukt. Probeer het opnieuw.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removePhoto(url: string) {
    setPortfolioUrls((prev) => prev.filter((u) => u !== url));
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("barber_profiles")
      .update({ portfolio_urls: portfolioUrls })
      .eq("id", userId);
    setSaving(false);
    if (updateError) {
      setError("Opslaan is niet gelukt. Probeer het opnieuw.");
      return;
    }
    router.push("/barber/profiel");
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Portfolio" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="text-[14px] text-text-secondary leading-[21px]">
          Klanten zien deze foto&apos;s voordat ze je kiezen — laat je beste werk zien.
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFilesSelected} />
        <div className="grid grid-cols-3 gap-2 mt-4">
          {portfolioUrls.map((url) => (
            <div key={url} className="relative aspect-square rounded-md overflow-hidden bg-surface">
              <Image src={url} alt="" fill className="object-cover" />
              <button
                type="button"
                aria-label="Verwijder foto"
                onClick={() => removePhoto(url)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary/70 text-white flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className="aspect-square rounded-md border border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-text-tertiary cursor-pointer"
          >
            <Camera size={22} />
            <span className="text-[12px]">{uploading ? "Bezig…" : "Toevoegen"}</span>
          </div>
        </div>
        {error && (
          <div className="mt-4 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2 border-t border-border bg-white">
        <Button full disabled={saving || uploading} onClick={handleSave}>
          {saving ? "Bezig…" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}

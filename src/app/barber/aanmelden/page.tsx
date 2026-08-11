"use client";
import { Camera, FileText, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button, Input, NavBar } from "@/components/ui";
import { UploadTile } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile } from "@/lib/supabase/queries";
import { uploadBarberFile } from "@/lib/supabase/storage";

const STEPS = ["Gegevens", "Verificatie", "Diensten"];

interface ServiceDraft {
  name: string;
  durationMinutes: number;
  priceEuros: number;
}

const DEFAULT_SERVICES: ServiceDraft[] = [
  { name: "Knipbeurt", durationMinutes: 30, priceEuros: 35 },
  { name: "Baard trimmen", durationMinutes: 20, priceEuros: 20 },
  { name: "Knippen + baard", durationMinutes: 45, priceEuros: 50 },
  { name: "Kids", durationMinutes: 20, priceEuros: 20 },
];

type UploadKind = "id" | "insurance" | "diploma" | "portfolio";

export default function BarberSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [kvkNumber, setKvkNumber] = useState("");
  const [city, setCity] = useState("");

  const [idDocUrl, setIdDocUrl] = useState<string | null>(null);
  const [insuranceDocUrl, setInsuranceDocUrl] = useState<string | null>(null);
  const [diplomaUrl, setDiplomaUrl] = useState<string | null>(null);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState<UploadKind | null>(null);

  const [services, setServices] = useState<ServiceDraft[]>(DEFAULT_SERVICES);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);
  const diplomaInputRef = useRef<HTMLInputElement>(null);
  const insuranceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      setFullName((data.user.user_metadata?.full_name as string) ?? "");
      setPhone((data.user.user_metadata?.phone as string) ?? "");

      const barberProfile = await getBarberProfile(supabase, data.user.id);
      if (barberProfile) {
        setKvkNumber(barberProfile.kvkNumber ?? "");
        setCity(barberProfile.city ?? "");
        setIdDocUrl(barberProfile.idDocUrl);
        setInsuranceDocUrl(barberProfile.insuranceDocUrl);
        setDiplomaUrl(barberProfile.diplomaUrl);
        setPortfolioUrls(barberProfile.portfolioUrls ?? []);
      }

      const { data: existingServices } = await supabase
        .from("services")
        .select("name, duration_minutes, price_cents")
        .eq("barber_id", data.user.id);
      if (existingServices && existingServices.length > 0) {
        setServices(
          existingServices.map((s) => ({
            name: s.name as string,
            durationMinutes: s.duration_minutes as number,
            priceEuros: (s.price_cents as number) / 100,
          }))
        );
      }
    })();
  }, []);

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>, kind: UploadKind) {
    const files = e.target.files;
    if (!files || files.length === 0 || !userId) return;
    setUploading(kind);
    setUploadError(null);
    const supabase = createClient();

    try {
      if (kind === "portfolio") {
        const uploads = await Promise.all(
          Array.from(files).map((file, i) =>
            uploadBarberFile(supabase, "barber-media", userId, `portfolio-${Date.now()}-${i}-${file.name}`, file)
          )
        );
        setPortfolioUrls((prev) => [...prev, ...uploads]);
      } else {
        const file = files[0];
        const url = await uploadBarberFile(supabase, "barber-documents", userId, `${kind}-${file.name}`, file);
        if (kind === "id") setIdDocUrl(url);
        if (kind === "insurance") setInsuranceDocUrl(url);
        if (kind === "diploma") setDiplomaUrl(url);
      }
    } catch {
      setUploadError("Uploaden is mislukt. Probeer het opnieuw.");
    } finally {
      setUploading(null);
      e.target.value = "";
    }
  }

  function updateService(index: number, patch: Partial<ServiceDraft>) {
    setServices((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleFinish() {
    if (!userId) return;
    setSubmitting(true);
    setSubmitError(null);
    const supabase = createClient();

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, onboarding_completed: true })
      .eq("id", userId);
    if (profileError) {
      setSubmitting(false);
      setSubmitError("Opslaan van je gegevens is niet gelukt. Probeer het opnieuw.");
      return;
    }

    const { error: barberProfileError } = await supabase
      .from("barber_profiles")
      .update({
        kvk_number: kvkNumber,
        city,
        id_doc_url: idDocUrl,
        insurance_doc_url: insuranceDocUrl,
        diploma_url: diplomaUrl,
        portfolio_urls: portfolioUrls,
      })
      .eq("id", userId);
    if (barberProfileError) {
      setSubmitting(false);
      setSubmitError("Opslaan van je verificatiegegevens is niet gelukt. Probeer het opnieuw.");
      return;
    }

    const { error: deleteServicesError } = await supabase.from("services").delete().eq("barber_id", userId);
    if (deleteServicesError) {
      setSubmitting(false);
      setSubmitError("Opslaan van je diensten is niet gelukt. Probeer het opnieuw.");
      return;
    }
    const { error: insertServicesError } = await supabase.from("services").insert(
      services.map((s) => ({
        barber_id: userId,
        name: s.name,
        duration_minutes: s.durationMinutes,
        price_cents: Math.round(s.priceEuros * 100),
      }))
    );
    if (insertServicesError) {
      setSubmitting(false);
      setSubmitError("Opslaan van je diensten is niet gelukt. Probeer het opnieuw.");
      return;
    }

    router.push("/barber/in-behandeling");
  }

  const busy = uploading !== null;

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Word Groomy-barber" onBack={() => (step > 0 ? setStep(step - 1) : router.push("/barber/dashboard"))} />
      <div className="px-5 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`} />
              <div className={`text-[11px] mt-1.5 ${i <= step ? "text-text-primary" : "text-text-tertiary"} ${i === step ? "font-semibold" : "font-normal"}`}>
                {s}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pt-5 flex-1 overflow-y-auto no-scrollbar">
        {step === 0 && (
          <>
            <div className="text-[24px] font-bold tracking-[-0.02em]">Jouw gegevens</div>
            <div className="flex flex-col gap-3 mt-5">
              <Input label="Naam" placeholder="Voor- en achternaam" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <Input label="KvK-nummer" placeholder="12345678" value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)} />
              <Input label="Telefoon" placeholder="06 12345678" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Stad" placeholder="Amsterdam" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="text-[24px] font-bold tracking-[-0.02em]">Verificatie</div>
            <div className="text-[14px] text-text-secondary mt-1.5 leading-5">
              We controleren je identiteit en vakbekwaamheid. Dit duurt meestal 1 werkdag.
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <input ref={idInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileSelected(e, "id")} />
              <UploadTile
                icon={<FileText size={22} />}
                title="Identiteitsbewijs"
                sub="Paspoort of ID-kaart"
                done={!!idDocUrl}
                onClick={() => !busy && idInputRef.current?.click()}
              />
              <input ref={portfolioInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileSelected(e, "portfolio")} />
              <UploadTile
                icon={<Camera size={22} />}
                title="Portfolio"
                sub={portfolioUrls.length > 0 ? `${portfolioUrls.length} foto's geüpload` : "Minimaal 3 foto's van je werk"}
                done={portfolioUrls.length >= 3}
                onClick={() => !busy && portfolioInputRef.current?.click()}
              />
              <input ref={insuranceInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileSelected(e, "insurance")} />
              <UploadTile
                icon={<Shield size={22} />}
                title="Verzekering"
                sub="Bedrijfsaansprakelijkheidsverzekering"
                done={!!insuranceDocUrl}
                onClick={() => !busy && insuranceInputRef.current?.click()}
              />
              <input ref={diplomaInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFileSelected(e, "diploma")} />
              <UploadTile
                icon={<FileText size={22} />}
                title="Diploma of certificaat"
                sub="Optioneel, verhoogt vertrouwen"
                done={!!diplomaUrl}
                onClick={() => !busy && diplomaInputRef.current?.click()}
              />
              {uploadError && (
                <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
                  {uploadError}
                </div>
              )}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="text-[24px] font-bold tracking-[-0.02em]">Diensten en prijzen</div>
            <div className="mt-4">
              {services.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <div className="text-[15px] font-semibold">{s.name}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min={5}
                        value={s.durationMinutes}
                        onChange={(e) => updateService(i, { durationMinutes: Number(e.target.value) })}
                        className="w-14 text-[13px] text-text-secondary border border-border rounded-sm px-1.5 py-1"
                      />
                      <span className="text-[13px] text-text-secondary">min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[15px] font-semibold">€</span>
                    <input
                      type="number"
                      min={0}
                      value={s.priceEuros}
                      onChange={(e) => updateService(i, { priceEuros: Number(e.target.value) })}
                      className="w-16 text-[15px] font-semibold border border-border rounded-sm px-1.5 py-1"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-surface rounded-md px-4 py-3 text-[13px] text-text-secondary leading-[19px]">
              Groomy rekent <b className="text-text-primary">15% servicekosten</b> per boeking. Uitbetaling wekelijks, na afronding vrijgegeven uit escrow.
            </div>
          </>
        )}
      </div>
      <div className="px-5 pt-3 pb-2">
        {submitError && (
          <div className="mb-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {submitError}
          </div>
        )}
        <Button full variant="accent" disabled={submitting || busy} onClick={() => (step < 2 ? setStep(step + 1) : handleFinish())}>
          {busy ? "Bezig met uploaden…" : step < 2 ? "Volgende" : submitting ? "Bezig…" : "Verstuur aanmelding"}
        </Button>
      </div>
    </div>
  );
}

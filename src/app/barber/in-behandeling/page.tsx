"use client";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/supabase/queries";

type DisplayStatus = "pending" | "rejected" | "suspended";

const STATUS_COPY: Record<DisplayStatus, { icon: ReactNode; title: string; sub: ReactNode; tone: "accent" | "error" }> = {
  pending: {
    icon: <Clock size={38} />,
    title: "Aanmelding in behandeling",
    sub: (
      <>We controleren je gegevens. Je hoort binnen <b className="text-text-primary">1 werkdag</b> van ons — daarna kun je direct online.</>
    ),
    tone: "accent",
  },
  rejected: {
    icon: <XCircle size={38} />,
    title: "Aanmelding afgewezen",
    sub: (
      <>We konden je aanmelding niet goedkeuren. Neem contact op met <b className="text-text-primary">support@groomy.nl</b> voor meer uitleg.</>
    ),
    tone: "error",
  },
  suspended: {
    icon: <AlertTriangle size={38} />,
    title: "Account geschorst",
    sub: (
      <>Je account is tijdelijk geblokkeerd. Neem contact op met <b className="text-text-primary">support@groomy.nl</b> voor meer informatie.</>
    ),
    tone: "error",
  },
};

export default function PendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<DisplayStatus>("pending");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const profile = await getProfile(supabase, data.user.id);
      if (!profile?.barberStatus) return;
      if (profile.barberStatus === "approved") {
        router.replace("/barber/dashboard");
        return;
      }
      setStatus(profile.barberStatus);
    })();
  }, [router]);

  const copy = STATUS_COPY[status];
  const isAccent = copy.tone === "accent";

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className={`w-[88px] h-[88px] rounded-full flex items-center justify-center ${isAccent ? "bg-accent-soft text-accent" : "bg-error-soft text-error"}`}>
        {copy.icon}
      </div>
      <div className="text-[26px] font-bold tracking-[-0.02em] mt-6">{copy.title}</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">{copy.sub}</div>
      <div className="mt-8 w-full">
        <Button full variant="secondary" onClick={handleLogout}>Uitloggen</Button>
      </div>
    </div>
  );
}

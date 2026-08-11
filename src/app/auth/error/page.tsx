"use client";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { EmptyState, PhoneShell } from "@/components/shared";

export default function AuthErrorPage() {
  const router = useRouter();

  return (
    <PhoneShell>
      <div className="flex flex-col h-full">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Link verlopen of ongeldig"
          sub="Deze link werkt niet meer. Vraag een nieuwe aan en probeer het opnieuw."
          action={
            <Button size="md" onClick={() => router.push("/")}>
              Terug naar Groomy
            </Button>
          }
        />
      </div>
    </PhoneShell>
  );
}

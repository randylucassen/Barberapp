"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui";

// basePath/extraParams generiek gemaakt (voorheen vast op
// /admin/gebruikers) zodat /admin/barbers 'm kan hergebruiken — daar
// moet de bestaande statusfilter (zie StatusFilter) ook blijven staan
// terwijl er gezocht wordt, dus extraParams draagt die mee in de URL.
export function UserSearch({
  initial,
  basePath = "/admin/gebruikers",
  extraParams,
}: {
  initial: string;
  basePath?: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(extraParams);
    if (value) params.set("search", value);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 mb-4">
      <Input placeholder="Zoek op naam, e-mail of telefoon…" value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  );
}

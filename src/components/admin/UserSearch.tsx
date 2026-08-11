"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui";

export function UserSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(value ? `/admin/gebruikers?search=${encodeURIComponent(value)}` : "/admin/gebruikers");
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 mb-4">
      <Input placeholder="Zoek op naam…" value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  );
}

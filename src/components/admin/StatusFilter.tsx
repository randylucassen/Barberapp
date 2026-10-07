"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function StatusFilter({
  basePath,
  current,
  options,
  extraParams,
}: {
  basePath: string;
  current: string;
  options: { value: string; label: string }[];
  // Bv. een actieve zoekterm op /admin/barbers — zonder dit zou het
  // wisselen van statusfilter een lopende zoekopdracht wegvegen.
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  function handleChange(value: string) {
    const params = new URLSearchParams(extraParams);
    if (value) params.set("status", value);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }
  return (
    <div className="w-56 mb-4">
      <Select value={current} options={options} onChange={(e) => handleChange(e.target.value)} />
    </div>
  );
}

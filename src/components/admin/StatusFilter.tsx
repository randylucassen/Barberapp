"use client";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function StatusFilter({
  basePath,
  current,
  options,
}: {
  basePath: string;
  current: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <div className="w-56 mb-4">
      <Select
        value={current}
        options={options}
        onChange={(e) => router.push(e.target.value ? `${basePath}?status=${e.target.value}` : basePath)}
      />
    </div>
  );
}

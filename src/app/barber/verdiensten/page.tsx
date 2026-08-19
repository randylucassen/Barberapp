"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { NavBar, Tabs, Toast } from "@/components/ui";
import { Avatar, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getPaymentsForBarber, type BarberPaymentRow } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

const DAY_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

function lastSevenDaysBuckets(payments: BarberPaymentRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return { date: d, label: DAY_LABELS[d.getDay()], cents: 0 };
  });

  for (const p of payments) {
    if (p.escrowState === "refunded") continue;
    const created = new Date(p.createdAt);
    created.setHours(0, 0, 0, 0);
    const bucket = days.find((d) => d.date.getTime() === created.getTime());
    if (bucket) bucket.cents += p.barberPayoutCents;
  }
  return days;
}

function EarningsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const justFinished = search.get("done") === "1";
  const [period, setPeriod] = useState("week");
  const [payments, setPayments] = useState<BarberPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const rows = await getPaymentsForBarber(supabase, data.user.id);
      setPayments(rows);
      setLoading(false);
    });
  }, []);

  const earnedPayments = payments.filter((p) => p.escrowState !== "refunded");
  const totalCents = earnedPayments.reduce((sum, p) => sum + p.barberPayoutCents, 0);
  const totalMinutes = earnedPayments.reduce((sum, p) => sum + p.durationMinutes, 0);
  const buckets = lastSevenDaysBuckets(payments);
  const max = Math.max(1, ...buckets.map((d) => d.cents));
  const todayLabel = DAY_LABELS[new Date().getDay()];

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Verdiensten" />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {justFinished && (
          <div className="mb-4">
            <Toast variant="success" message="Boeking afgerond" />
          </div>
        )}
        <Tabs items={[{ key: "week", label: "Deze week" }, { key: "maand", label: "Maand" }]} value={period} onChange={setPeriod} />
        <div className="mt-5">
          <div className="text-[34px] font-bold tracking-[-0.02em]">€{euro(totalCents)}</div>
          <div className="text-[13px] text-text-secondary mt-0.5">
            {earnedPayments.length} boekingen · {(totalMinutes / 60).toFixed(1).replace(".", ",")} uur
          </div>
        </div>
        <div className="flex items-end gap-2 h-[120px] mt-5">
          {buckets.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                style={{ height: Math.max(4, (d.cents / max) * 96) }}
                className={`w-full rounded-[6px] ${d.label === todayLabel ? "bg-accent" : "bg-border"}`}
              />
              <span className="text-[11px] text-text-tertiary">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-[17px] font-semibold tracking-[-0.01em] mb-1">Recent</div>
          {!loading && earnedPayments.length === 0 && (
            <div className="text-[14px] text-text-secondary py-4">Nog geen verdiensten.</div>
          )}
          {earnedPayments.slice(0, 10).map((p) => (
            <Row
              key={p.paymentId}
              left={<Avatar name={p.serviceName} />}
              title={p.serviceName}
              sub={new Date(p.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
              right={<span className="font-semibold text-success">+€{euro(p.barberPayoutCents)}</span>}
            />
          ))}
        </div>
        <div className="my-5 flex flex-col gap-2.5">
          <button onClick={() => router.push("/barber/uitbetalingen")} className="w-full h-ctrl-lg rounded-md bg-surface font-semibold text-[17px]">
            Bekijk uitbetalingen
          </button>
          <a
            href="/api/barber/earnings/export"
            className="w-full h-ctrl-lg rounded-md border border-border flex items-center justify-center font-semibold text-[17px] text-text-primary"
          >
            Download inkomsten (CSV)
          </a>
        </div>
      </div>
    </div>
  );
}

export default function EarningsPage() {
  return (
    <Suspense fallback={null}>
      <EarningsContent />
    </Suspense>
  );
}

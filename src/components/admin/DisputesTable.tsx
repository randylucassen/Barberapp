"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AdminDisputeRow } from "@/lib/supabase/queries";

type Recipient = "customer" | "barber" | "both";

export function DisputesTable({ disputes }: { disputes: AdminDisputeRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<Recipient>("both");
  const [message, setMessage] = useState("");
  const [messageSentId, setMessageSentId] = useState<string | null>(null);
  // lineId -> hoeveel van die regel se aantal terugbetaald wordt. Default
  // per regel = de volle quantity (zelfde "volledig terugbetalen tenzij
  // afgeschaald"-gedrag als voorheen bij één party_size-teller, nu per
  // dienst-regel — met de gebruiker afgestemd i.p.v. één totaal-aantal
  // over de hele boeking).
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});

  function getRefundQty(lineId: string, fullQuantity: number) {
    return refundQty[lineId] ?? fullQuantity;
  }

  async function resolve(disputeId: string, resolution: "refund" | "dismiss", d?: AdminDisputeRow) {
    setBusyId(disputeId);
    setError(null);
    const refundLines = d?.lines.map((l) => ({ lineId: l.id, quantity: getRefundQty(l.id, l.quantity) }));
    const res = await fetch("/api/admin/disputes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disputeId, resolution, refundLines }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  function openComposer(disputeId: string) {
    setMessagingId(disputeId);
    setRecipient("both");
    setMessage("");
    setError(null);
    setMessageSentId(null);
  }

  async function sendMessage(disputeId: string) {
    if (!message.trim()) return;
    setBusyId(disputeId);
    setError(null);
    const res = await fetch("/api/admin/disputes/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disputeId, recipient, message }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Versturen is niet gelukt. Probeer het opnieuw.");
      return;
    }
    setMessagingId(null);
    setMessageSentId(disputeId);
  }

  if (disputes.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen geschillen.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
      )}
      {disputes.map((d) => (
        <div key={d.id} className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{d.serviceName}</span>
                <Badge variant={d.status === "open" ? "accent" : d.status === "resolved" ? "success" : "neutral"}>
                  {d.status}
                </Badge>
              </div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                Klant: {d.customerName} · Barber: {d.barberName}
              </div>
              <div className="text-[14px] mt-2">&ldquo;{d.reason}&rdquo;</div>
              {d.resolutionNotes && (
                <div className="text-[13px] text-text-secondary mt-1.5">Resolutie: {d.resolutionNotes}</div>
              )}
              {d.escrowState && (
                <div className="text-[13px] text-text-secondary mt-1.5">Escrow: {d.escrowState}</div>
              )}
            </div>
            {d.status === "open" && (
              <div className="flex flex-col gap-1.5 flex-shrink-0 items-stretch min-w-[220px]">
                {d.lines.length > 0 && (
                  <div className="flex flex-col gap-1 mb-0.5">
                    {d.lines.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 text-[13px] text-text-secondary">
                        <span className="truncate">
                          Terugbetalen {l.serviceName} (van {l.quantity})
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={busyId === d.id || getRefundQty(l.id, l.quantity) <= 0}
                            onClick={() =>
                              setRefundQty((c) => ({ ...c, [l.id]: Math.max(0, getRefundQty(l.id, l.quantity) - 1) }))
                            }
                            className="w-6 h-6 rounded-md border border-border text-text-primary disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="w-4 text-center font-semibold">{getRefundQty(l.id, l.quantity)}</span>
                          <button
                            type="button"
                            disabled={busyId === d.id || getRefundQty(l.id, l.quantity) >= l.quantity}
                            onClick={() =>
                              setRefundQty((c) => ({ ...c, [l.id]: Math.min(l.quantity, getRefundQty(l.id, l.quantity) + 1) }))
                            }
                            className="w-6 h-6 rounded-md border border-border text-text-primary disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => openComposer(d.id)}>
                  Bericht sturen
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busyId === d.id}
                  onClick={() => resolve(d.id, "refund", d)}
                >
                  Terugbetalen aan klant
                </Button>
                <Button size="sm" variant="secondary" disabled={busyId === d.id} onClick={() => resolve(d.id, "dismiss")}>
                  Vrijgeven aan barber
                </Button>
              </div>
            )}
          </div>
          {messageSentId === d.id && (
            <div className="mt-3 bg-success-soft text-success-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
              Bericht verstuurd.
            </div>
          )}
          {messagingId === d.id && (
            <div className="mt-3 pt-3 border-t border-border-soft flex flex-col gap-2.5">
              <div className="flex gap-2">
                {(["customer", "barber", "both"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecipient(r)}
                    className={`text-[13px] font-medium px-3 py-1.5 rounded-md border ${
                      recipient === r ? "bg-primary text-white border-primary" : "border-border text-text-secondary"
                    }`}
                  >
                    {r === "customer" ? "Klant" : r === "barber" ? "Barber" : "Beide"}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Wat wil je vragen of laten weten?"
                rows={3}
                className="w-full bg-surface rounded-md px-3 py-2.5 text-[14px] placeholder:text-text-tertiary border-none outline-none resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" disabled={busyId === d.id || !message.trim()} onClick={() => sendMessage(d.id)}>
                  Verstuur e-mail
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMessagingId(null)}>
                  Annuleer
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

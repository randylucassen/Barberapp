import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { UserDetailActions } from "@/components/admin/UserDetailActions";
import { Badge } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserDetailForAdmin } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const user = await getUserDetailForAdmin(supabase, id);
  if (!user) notFound();

  return (
    <AdminShell>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[24px] font-bold tracking-[-0.02em]">{user.fullName}</span>
            <Badge variant={user.role === "barber" ? "accent" : "neutral"}>{user.role}</Badge>
            {user.suspended && <Badge variant="error">geschorst</Badge>}
            {user.role === "barber" && user.barberStatus && <Badge variant="neutral">{user.barberStatus}</Badge>}
          </div>
          <div className="text-[14px] text-text-secondary mt-1">
            {user.email}
            {user.phone && <> · {user.phone}</>}
          </div>
          <div className="text-[13px] text-text-secondary mt-0.5">Lid sinds {formatDate(user.createdAt)}</div>
        </div>
        {user.role === "customer" && <UserDetailActions customerId={user.id} suspended={user.suspended} />}
      </div>

      {user.role === "barber" && user.barberStats && (
        <div className="bg-white border border-border rounded-lg p-4 mb-5 flex flex-wrap gap-6">
          <div>
            <div className="text-[12px] text-text-secondary">Beoordeling</div>
            <div className="text-[15px] font-semibold mt-0.5">
              {user.barberStats.ratingAvg !== null ? `${user.barberStats.ratingAvg} ★` : "Nog geen"} (
              {user.barberStats.ratingCount})
            </div>
          </div>
          <div>
            <div className="text-[12px] text-text-secondary">Status</div>
            <div className="text-[15px] font-semibold mt-0.5">{user.barberStats.isOnline ? "Online" : "Offline"}</div>
          </div>
          <div>
            <div className="text-[12px] text-text-secondary">Stad</div>
            <div className="text-[15px] font-semibold mt-0.5">{user.barberStats.city ?? "Onbekend"}</div>
          </div>
          <div>
            <div className="text-[12px] text-text-secondary">Stripe-uitbetalingen</div>
            <div className="text-[15px] font-semibold mt-0.5">
              {user.barberStats.stripePayoutsEnabled ? "Actief" : "Niet actief"}
            </div>
          </div>
        </div>
      )}

      {user.role === "customer" && user.defaultAddress && (
        <div className="bg-white border border-border rounded-lg p-4 mb-5">
          <div className="text-[12px] text-text-secondary">Standaardadres</div>
          <div className="text-[15px] font-semibold mt-0.5">{user.defaultAddress}</div>
        </div>
      )}

      {user.disputes.length > 0 && (
        <>
          <div className="text-[15px] font-semibold mb-2">Geschillen ({user.disputes.length})</div>
          <div className="flex flex-col gap-2 mb-6">
            {user.disputes.map((d) => (
              <div key={d.id} className="bg-white border border-border rounded-lg p-3.5">
                <div className="flex items-center gap-2">
                  <Badge variant={d.status === "open" ? "accent" : d.status === "resolved" ? "success" : "neutral"}>
                    {d.status}
                  </Badge>
                  <span className="text-[13px] text-text-secondary">
                    {formatDate(d.openedAt)} · gemeld als {d.asCustomer ? "klant" : "barber"}
                  </span>
                </div>
                <div className="text-[13px] mt-1.5">&ldquo;{d.reason}&rdquo;</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="text-[15px] font-semibold mb-2">Boekingsgeschiedenis ({user.bookings.length})</div>
      {user.bookings.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen boekingen.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {user.bookings.map((b) => (
            <div key={b.id} className="bg-white border border-border rounded-lg p-3.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{b.serviceName}</span>
                  <Badge variant="neutral">{b.status}</Badge>
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {user.role === "barber" ? "Klant" : "Barber"}: {b.otherPartyName} · {formatDate(b.createdAt)}
                </div>
              </div>
              <div className="text-[14px] font-semibold">€{euro(b.priceCents)}</div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

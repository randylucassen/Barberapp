import { AdminShell } from "@/components/admin/AdminShell";
import { StuckBookingsTable } from "@/components/admin/StuckBookingsTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getStuckBookingsForAdmin } from "@/lib/supabase/queries";

export default async function AdminStuckBookingsPage() {
  const supabase = createServiceClient();
  const bookings = await getStuckBookingsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Vastgelopen boekingen</div>
      <div className="text-[14px] text-text-secondary mb-4">
        Boekingen op &ldquo;arrived&rdquo; of &ldquo;in_progress&rdquo; kunnen door klant of barber niet meer
        geannuleerd worden — als een boeking hier blijft hangen (bv. de barber-app crashte), forceer je hier zelf
        de afronding of annuleer je met terugbetaling.
      </div>
      <StuckBookingsTable bookings={bookings} />
    </AdminShell>
  );
}

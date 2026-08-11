import { AdminShell } from "@/components/admin/AdminShell";
import { UsersTable } from "@/components/admin/UsersTable";
import { UserSearch } from "@/components/admin/UserSearch";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsersForAdmin } from "@/lib/supabase/queries";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const supabase = createServiceClient();
  const users = await getUsersForAdmin(supabase, search);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Gebruikers</div>
      <UserSearch initial={search ?? ""} />
      <UsersTable users={users} />
    </AdminShell>
  );
}

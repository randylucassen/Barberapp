"use client";
import { useRouter } from "next/navigation";
import { NotificationsList } from "@/components/shared";

export default function BarberNotificationsPage() {
  const router = useRouter();
  return <NotificationsList onBack={() => router.push("/barber/dashboard")} />;
}

import { Bell } from "lucide-react";
import { IconButton } from "@/components/ui";

interface NotificationBellProps {
  hasUnread: boolean;
  onClick: () => void;
}

// Wrapper rond de bestaande bel-IconButton (klant/home, barber/dashboard)
// met een klein rood bolletje zodra er ongelezen notificaties zijn — zo
// hoef je niet eerst op de bel te klikken om te zien of er iets nieuws is.
export function NotificationBell({ hasUnread, onClick }: NotificationBellProps) {
  return (
    <div className="relative">
      <IconButton label="Meldingen" size={40} onClick={onClick}>
        <Bell size={20} />
      </IconButton>
      {hasUnread && (
        <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-error border-2 border-white" />
      )}
    </div>
  );
}

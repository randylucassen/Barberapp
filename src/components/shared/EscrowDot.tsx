import { CreditCard } from "lucide-react";
import type { EscrowState } from "@/lib/types";

type State = EscrowState;

const colors: Record<State, string> = {
  held: "text-text-tertiary",
  releasing: "text-text-tertiary",
  released: "text-accent",
  paid: "text-success",
  refunded: "text-error-text",
};

export function EscrowDot({ state }: { state: State }) {
  return (
    <div className={`w-11 h-11 rounded-full bg-surface flex items-center justify-center flex-shrink-0 ${colors[state]}`}>
      <CreditCard size={18} />
    </div>
  );
}

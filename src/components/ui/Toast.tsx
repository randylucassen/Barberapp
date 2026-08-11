type Variant = "default" | "success" | "error";

interface ToastProps {
  message: string;
  variant?: Variant;
  fixed?: boolean;
}

const dotColor: Record<Variant, string> = {
  default: "bg-accent",
  success: "bg-success",
  error: "bg-error",
};

export function Toast({ message, variant = "default", fixed = false }: ToastProps) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2.5 h-12 px-5 bg-primary text-white rounded-pill font-sans text-[15px] font-medium",
        fixed ? "fixed bottom-6 left-1/2 -translate-x-1/2 z-[110]" : "",
      ].join(" ")}
    >
      <span className={`w-2 h-2 rounded-full ${dotColor[variant]}`} />
      {message}
    </div>
  );
}

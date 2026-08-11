interface AvatarProps {
  name: string;
  size?: number;
  dark?: boolean;
}

export function Avatar({ name, size = 48, dark = false }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={[
        "rounded-full inline-flex items-center justify-center font-semibold flex-shrink-0",
        dark ? "bg-primary text-white" : "bg-border text-text-secondary",
      ].join(" ")}
    >
      {initials}
    </div>
  );
}

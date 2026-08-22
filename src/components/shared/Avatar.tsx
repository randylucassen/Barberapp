import Image from "next/image";

interface AvatarProps {
  name: string;
  size?: number;
  dark?: boolean;
  imageUrl?: string | null;
}

export function Avatar({ name, size = 48, dark = false, imageUrl }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  if (imageUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="relative rounded-full overflow-hidden flex-shrink-0 bg-border"
      >
        <Image src={imageUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      </div>
    );
  }

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

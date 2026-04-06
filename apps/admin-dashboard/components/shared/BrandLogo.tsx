import Image from "next/image"
import Link from "next/link"

interface BrandLogoProps {
  href?: string;
  size?: "sm" | "md" | "lg";
  markOnly?: boolean;
}

const sizeMap = {
  sm: { icon: 24, text: "text-sm", gap: "gap-2" },
  md: { icon: 28, text: "text-base", gap: "gap-2.5" },
  lg: { icon: 36, text: "text-xl", gap: "gap-3" },
};

export function BrandLogo({ href = "/", size = "md", markOnly = false }: BrandLogoProps) {
  const { icon, text, gap } = sizeMap[size];

  return (
    <Link
      href={href}
      className={`inline-flex items-center ${gap} group select-none rounded-sm`}
      aria-label="DailyBread Admin"
    >
      {/* ✅ Logo Image */}
      <Image
        src="/logo.svg" // put your cleaned logo in /public/logo.png
        alt="DailyBread"
        width={icon}
        height={icon}
        priority
        className="object-contain shrink-0"
      />

      {!markOnly && (
        <span className="leading-none">
          <span className={`${text} font-semibold tracking-tight text-foreground font-display group-hover:text-primary transition-colors duration-200`}>
            DailyBread
          </span>
          <span className="block text-[9px] font-mono tracking-[0.18em] uppercase text-[var(--muted-foreground)] opacity-60 mt-0.5">
            Admin
          </span>
        </span>
      )}
    </Link>
  );
}
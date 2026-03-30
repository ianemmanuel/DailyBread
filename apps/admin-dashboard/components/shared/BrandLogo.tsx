import Link from "next/link";

interface BrandLogoProps {
  href?: string;
  size?: "sm" | "md" | "lg";
  markOnly?: boolean;
}

const sizeMap = {
  sm: { icon: "h-6 w-6",  text: "text-sm",  gap: "gap-2" },
  md: { icon: "h-7 w-7",  text: "text-base", gap: "gap-2.5" },
  lg: { icon: "h-9 w-9",  text: "text-xl",  gap: "gap-3" },
};

/**
 * DailyBread brand mark — shared across admin and vendor apps.
 * Same identity, different context. Server component.
 */
export function BrandLogo({ href = "/", size = "md", markOnly = false }: BrandLogoProps) {
  const { icon, text, gap } = sizeMap[size];

  return (
    <Link
      href={href}
      className={`inline-flex items-center ${gap} group select-none rounded-sm`}
      aria-label="DailyBread Admin"
    >
      {/* Icon mark */}
      <span
        className={`${icon} rounded-[5px] bg-primary flex items-center justify-center shrink-0
                    ring-1 ring-primary/40 group-hover:ring-primary/70 transition-all duration-200`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[58%] h-[58%]">
          <path
            d="M12 3C12 3 7 6 7 11C7 14.3 9.2 17 12 17C14.8 17 17 14.3 17 11C17 6 12 3 12 3Z"
            fill="currentColor"
            className="text-primary-foreground"
          />
          <path d="M12 17V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-primary-foreground" />
          <path d="M9 14L7 16M15 14L17 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-primary-foreground" opacity="0.7" />
        </svg>
      </span>

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
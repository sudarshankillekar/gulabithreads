type GulabiLogoProps = {
  className?: string;
  markOnly?: boolean;
};

export function GulabiLogo({ className = "", markOnly = false }: GulabiLogoProps) {
  return (
    <span className={`gulabi-logo ${markOnly ? "gulabi-logo-mark-only" : ""} ${className}`.trim()}>
      <img className="gulabi-logo-image" src={markOnly ? "/assets/gulabi-logo-mark.png" : "/assets/gulabi-logo.png"} alt={markOnly ? "" : "Gulabi Threads"} />
    </span>
  );
}

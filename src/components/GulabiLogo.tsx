type GulabiLogoProps = {
  className?: string;
  markOnly?: boolean;
};

export function GulabiLogo({ className = "", markOnly = false }: GulabiLogoProps) {
  return (
    <span className={`gulabi-logo ${className}`.trim()}>
      <svg viewBox="0 0 138 104" aria-hidden="true" focusable="false">
        <path className="gulabi-logo-heart" d="M9 55c-9-12 9-22 17-7 8-15 26-5 17 7-7 10-17 17-17 17S16 65 9 55Z" />
        <path className="gulabi-logo-thread" d="M26 72c15 10 37 6 50-8" />
        <circle className="gulabi-logo-ball" cx="84" cy="55" r="34" />
        <path className="gulabi-logo-yarn" d="M61 41c15-9 32-17 52-27" />
        <path className="gulabi-logo-yarn" d="M54 57c20-12 42-23 66-35" />
        <path className="gulabi-logo-yarn" d="M60 72c19-10 39-21 60-32" />
        <path className="gulabi-logo-yarn" d="M73 25c15 18 29 37 42 59" />
        <path className="gulabi-logo-yarn" d="M52 55c16 16 31 32 44 50" />
        <path className="gulabi-logo-needle" d="M57 93 124 12" />
        <path className="gulabi-logo-needle" d="M124 12l8-3" />
        <circle className="gulabi-logo-pin" cx="124" cy="12" r="5" />
      </svg>
      {!markOnly && (
        <span className="gulabi-logo-copy">
          <strong>Gulabi</strong>
          <small>Threads</small>
        </span>
      )}
    </span>
  );
}

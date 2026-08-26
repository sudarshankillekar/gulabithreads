type GulabiLogoProps = {
  className?: string;
  markOnly?: boolean;
};

export function GulabiLogo({ className = "", markOnly = false }: GulabiLogoProps) {
  return (
    <span className={`gulabi-logo ${className}`.trim()}>
      <svg viewBox="0 0 116 86" aria-hidden="true" focusable="false">
        <path className="gulabi-logo-heart" d="M8 38c-8-11 8-20 15-7 7-13 23-4 15 7-5 8-15 14-15 14S13 46 8 38Z" />
        <path className="gulabi-logo-thread" d="M22 52c10 7 23 6 34-2" />
        <circle className="gulabi-logo-ball" cx="65" cy="40" r="30" />
        <path className="gulabi-logo-yarn" d="M44 34c14-8 29-15 46-23" />
        <path className="gulabi-logo-yarn" d="M40 48c16-9 34-17 53-25" />
        <path className="gulabi-logo-yarn" d="M47 59c14-7 29-15 45-23" />
        <path className="gulabi-logo-yarn" d="M53 15c12 13 24 27 36 43" />
        <path className="gulabi-logo-yarn" d="M41 41c13 12 25 24 35 36" />
        <path className="gulabi-logo-needle" d="M34 72 96 4" />
        <path className="gulabi-logo-needle" d="M96 4 104 1" />
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

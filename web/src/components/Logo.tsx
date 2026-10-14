/** The Pairwise mark: a rounded square split on a slant, cobalt for A and marigold for B. */
export function LogoMark({ size = 26 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <defs>
        <clipPath id="pw-mark">
          <rect width="32" height="32" rx="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#pw-mark)">
        <polygon points="0,0 18.6,0 13.4,32 0,32" fill="var(--a)" />
        <polygon points="20.6,0 32,0 32,32 15.4,32" fill="var(--b)" />
      </g>
    </svg>
  );
}

/** Mark plus the lowercase wordmark, with "pa" in cobalt and the "i" in marigold. */
export function Logo(): JSX.Element {
  return (
    <span className="brand-lockup">
      <LogoMark />
      <span className="wordmark" aria-label="pairwise">
        <span className="wm-a">pa</span>
        <span className="wm-b">i</span>
        rwise
      </span>
    </span>
  );
}

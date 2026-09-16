/**
 * Decorative brand scene for the sign-in pages: ridges under a teal glow, in the brand colours.
 * Always dark, in both themes, because it is a brand surface rather than app chrome.
 */
export function AuthArtwork() {
  return (
    <div aria-hidden className="absolute inset-0 bg-[#04211e]">
      <svg
        viewBox="0 0 800 1000"
        preserveAspectRatio="xMidYMax slice"
        className="size-full"
        role="presentation"
      >
        <defs>
          <linearGradient id="nexa-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#03201d" />
            <stop offset="0.5" stopColor="#07423b" />
            <stop offset="1" stopColor="#0a5b50" />
          </linearGradient>
          <radialGradient id="nexa-glow" cx="0.74" cy="0.26" r="0.55">
            <stop offset="0" stopColor="#7fe4cf" stopOpacity="0.5" />
            <stop offset="1" stopColor="#7fe4cf" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="nexa-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d6f61" />
            <stop offset="1" stopColor="#04322c" />
          </linearGradient>
        </defs>

        <rect width="800" height="1000" fill="url(#nexa-sky)" />
        <circle cx="592" cy="252" r="300" fill="url(#nexa-glow)" />
        {/* The arc of a distant planet, echoing the brand's diagonal band. */}
        <circle
          cx="760"
          cy="120"
          r="330"
          fill="none"
          stroke="#8ceadb"
          strokeOpacity="0.35"
          strokeWidth="2"
        />

        {[
          [120, 90],
          [260, 200],
          [430, 120],
          [560, 320],
          [690, 210],
          [180, 330],
          [350, 380],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#d8fff5" fillOpacity="0.7" />
        ))}

        <path
          d="M0 620 L150 520 L280 600 L400 470 L520 580 L650 480 L800 570 L800 1000 L0 1000 Z"
          fill="#0b4c44"
        />
        <path
          d="M0 720 L140 650 L300 725 L430 640 L560 715 L700 645 L800 700 L800 1000 L0 1000 Z"
          fill="#083a34"
        />
        <rect y="820" width="800" height="180" fill="url(#nexa-water)" opacity="0.85" />
        <path
          d="M0 830 L180 770 L330 828 L470 762 L640 836 L800 786 L800 1000 L0 1000 Z"
          fill="#052622"
        />

        {/* City lights along the shore. */}
        {[60, 120, 190, 250, 330, 410, 470, 540, 620, 700, 760].map((x, index) => (
          <circle
            key={x}
            cx={x}
            cy={880 + (index % 3) * 14}
            r="2"
            fill="#9ff3e1"
            fillOpacity={index % 2 === 0 ? 0.8 : 0.5}
          />
        ))}
      </svg>
    </div>
  );
}

// Simple brand mark: a stylized top hat. Inline SVG, no external assets.
export function HatIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            className={className}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M5 16c0-1.5 1.5-2 3-2h8c1.5 0 3 .5 3 2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
            <path
                d="M7.5 14c0-4 .5-8 1.5-9h6c1 1 1.5 5 1.5 9"
                fill="currentColor"
                fillOpacity="0.15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path d="M9 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
                d="M4 16.5c0 .8 3.6 1.5 8 1.5s8-.7 8-1.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}

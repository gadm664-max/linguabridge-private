type LinguaBrandProps = {
  compact?: boolean;
  inverse?: boolean;
};

export default function LinguaBrand({ compact = false, inverse = false }: LinguaBrandProps) {
  return (
    <div className="flex items-center gap-2.5 select-none" aria-label="LinguaBridge">
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl border shadow-[0_12px_25px_-15px_rgba(79,70,229,0.8)] ${
          inverse
            ? "border-white/20 bg-white/12 text-white"
            : "border-indigo-100 bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
        }`}
      >
        <svg viewBox="0 0 28 28" aria-hidden="true" className="h-5 w-5 fill-none" stroke="currentColor" strokeWidth="2">
          <path d="M5 14c3.1-6 5.2-6 8.1 0s5.1 6 9.9 0" strokeLinecap="round" />
          <path d="M5 18c3.1-4 5.2-4 8.1 0s5.1 4 9.9 0" strokeLinecap="round" opacity=".62" />
          <circle cx="5" cy="10" r="1.5" className="fill-current stroke-none" />
          <circle cx="23" cy="10" r="1.5" className="fill-current stroke-none" />
        </svg>
      </span>
      {!compact && (
        <span className={`text-[17px] font-bold tracking-[-0.045em] ${inverse ? "text-white" : "text-slate-950"}`}>
          Lingua<span className={inverse ? "text-indigo-200" : "text-indigo-600"}>Bridge</span>
        </span>
      )}
    </div>
  );
}

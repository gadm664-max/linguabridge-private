type AudioBarsProps = { active?: boolean; color?: "indigo" | "emerald" | "rose" };

export default function AudioBars({ active = false, color = "indigo" }: AudioBarsProps) {
  const tones = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500" };
  return (
    <div className="flex h-7 items-center gap-[3px]" aria-label={active ? "مؤشر مستوى الصوت نشط" : "مؤشر مستوى الصوت متوقف"}>
      {[10, 18, 25, 15, 22, 11, 20, 14, 25, 16, 10].map((height, index) => (
        <span
          key={index}
          className={`w-[3px] rounded-full ${tones[color]} ${active ? "animate-pulse" : "opacity-35"}`}
          style={{ height, animationDelay: `${index * 70}ms`, animationDuration: "700ms" }}
        />
      ))}
    </div>
  );
}

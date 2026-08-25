import LinguaBrand from "@/components/LinguaBrand";
import { Languages, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/history", label: "جلساتي" },
  { href: "/settings", label: "الإعدادات" },
];

export default function AppNavigation() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30 border-b border-slate-200/70 bg-white/72 backdrop-blur-xl">
      <div className="mx-auto flex h-[74px] max-w-[1440px] items-center justify-between px-4 sm:px-7">
        <Link href="/" className="shrink-0">
          <LinguaBrand />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                location === link.href ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Languages className="h-4 w-4 text-indigo-500" /> العربية</div>
          <Link href="/lobby" className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800">بدء اجتماع</Link>
        </div>
        <button type="button" onClick={() => setOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden" aria-label={open ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={open}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-slate-200 bg-white p-4 shadow-xl md:hidden">
          <nav className="mx-auto grid max-w-[1440px] gap-1" aria-label="التنقل الرئيسي">
            {links.map(link => <Link key={link.href} onClick={() => setOpen(false)} href={link.href} className="rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">{link.label}</Link>)}
            <Link onClick={() => setOpen(false)} href="/lobby" className="mt-2 rounded-xl bg-slate-950 px-4 py-3 text-center font-semibold text-white">بدء اجتماع</Link>
          </nav>
        </div>
      )}
    </header>
  );
}

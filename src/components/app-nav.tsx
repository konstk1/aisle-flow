"use client";

import {
  Check,
  ChevronDown,
  GraduationCap,
  ListChecks,
  Route,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { exact: true, href: "/", icon: ListChecks, label: "Shopping list" },
  { exact: false, href: "/route", icon: Route, label: "Store route" },
  { exact: false, href: "/learned", icon: GraduationCap, label: "Learned products" },
  { exact: false, href: "/stores", icon: Store, label: "Manage stores" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeItem =
    navItems.find((item) => isNavItemActive(item, pathname)) ?? navItems[0];
  const ActiveIcon = activeItem.icon;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="inline-flex min-h-11 items-center gap-3 pr-1 text-zinc-950"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#0a84ff] to-[#4db5ff] text-white shadow-[0_6px_16px_rgba(10,132,255,0.32)]">
          <ActiveIcon aria-hidden="true" className="size-5" />
        </span>
        <span className="truncate text-lg font-bold tracking-tight sm:text-xl">
          {activeItem.label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-[#b0b0b8] transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <nav
          aria-label="App sections"
          className="absolute top-full left-0 z-10 mt-2 w-60 rounded-2xl border-0 bg-white p-1.5 shadow-[0_10px_34px_rgba(20,23,40,0.14)]"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeItem.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition hover:bg-[#f4f5f9] ${
                  isActive ? "text-zinc-950" : "text-[#5a5a64]"
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                <Icon
                  aria-hidden="true"
                  className={`size-4 ${isActive ? "text-[#0a84ff]" : "text-[#a0a0a8]"}`}
                />
                <span className="min-w-0 flex-1">{item.label}</span>
                {isActive ? (
                  <Check aria-hidden="true" className="size-4 text-[#0a84ff]" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

function isNavItemActive(item: (typeof navItems)[number], pathname: string) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

"use client";

import {
  Check,
  ChevronDown,
  GraduationCap,
  ListChecks,
  Route,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { exact: true, href: "/", icon: ListChecks, label: "Shopping list" },
  { exact: false, href: "/route", icon: Route, label: "Store route" },
  { exact: false, href: "/learned", icon: GraduationCap, label: "Learned products" },
  { exact: false, href: "/stores", icon: Settings2, label: "Manage stores" },
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
        className="inline-flex min-h-11 items-center gap-2.5 pr-2 font-semibold tracking-tight text-zinc-950"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ActiveIcon aria-hidden="true" className="size-5" />
        <span>{activeItem.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 text-zinc-500 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <nav
          aria-label="App sections"
          className="absolute top-full left-0 z-10 mt-2 w-56 border bg-white py-1 shadow-lg"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeItem.href;

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className="flex min-h-11 items-center gap-3 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href={item.href}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                <Icon aria-hidden="true" className="size-4 text-zinc-500" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {isActive ? (
                  <Check aria-hidden="true" className="size-4 text-zinc-950" />
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

// Black brand sidebar with red active indicator.
import { NavLink } from "react-router";
import { NAV_SECTIONS } from "./nav";
import { useAuth } from "../../data/auth";
import { cn } from "@360/ui/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <img src="/logo.svg" alt="360 Performance" draggable={false} className="h-7 w-auto" />
      </div>

      <nav className="flex-1 overflow-y-auto p-3 scrollbar-hide">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label ?? `top-${i}`} className={cn(i > 0 && "mt-4")}>
            {section.label && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-white/5 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-[#cc0000] transition-opacity",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <item.icon className="size-4 shrink-0" />
                      <span className="[font-family:var(--font-heading)] uppercase tracking-wide">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-sm bg-[#cc0000] text-sm font-bold">
            {(user?.name ?? "A").charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{user?.name ?? "Admin"}</p>
            <p className="truncate text-xs text-white/50">{user?.role ?? "Admin"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

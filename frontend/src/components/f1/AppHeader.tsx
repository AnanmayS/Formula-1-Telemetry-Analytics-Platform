import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Session" },
  { to: "/model", label: "Model" },
] as const;

export function AppHeader() {
  const location = useLocation();
  // Hide on the immersive replay page.
  if (location.pathname.startsWith("/replay")) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="scanline-top" />
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground font-mono text-sm font-bold">
            F1
          </span>
          <span className="text-sm font-semibold tracking-wide">
            F1 <span className="text-muted-foreground">ANALYTICS</span>
          </span>
        </Link>
        <nav className="ml-2 flex items-center gap-1 text-sm">
          {NAV.map((n) => {
            const active =
              n.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "rounded-sm px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-secondary text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

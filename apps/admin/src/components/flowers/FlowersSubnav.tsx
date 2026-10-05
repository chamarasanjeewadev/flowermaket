import { Link } from "@tanstack/react-router";
import { Flower2, Tags } from "lucide-react";

/** Species ↔ Categories switcher shared by the Flowers section pages. */
export function FlowersSubnav() {
  const base =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors";
  return (
    <nav aria-label="Flowers sections" className="inline-flex gap-1 rounded-full border border-border bg-card p-1">
      <Link
        to="/flowers"
        activeOptions={{ exact: true }}
        className={`${base} text-muted-foreground hover:text-foreground`}
        activeProps={{ className: "bg-foreground !text-background" }}
      >
        <Flower2 className="size-4" aria-hidden="true" />
        Species
      </Link>
      <Link
        to="/flowers/categories"
        className={`${base} text-muted-foreground hover:text-foreground`}
        activeProps={{ className: "bg-foreground !text-background" }}
      >
        <Tags className="size-4" aria-hidden="true" />
        Categories
      </Link>
    </nav>
  );
}

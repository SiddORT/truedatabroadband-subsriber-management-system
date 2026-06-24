import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { subscriptionsService } from "@/services/subscriptions";
import type { Subscription } from "@/types/subscription";

interface SubscriptionComboboxProps {
  value: Subscription | null;
  onChange: (sub: Subscription | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SubscriptionCombobox({
  value,
  onChange,
  placeholder = "Search by subscription code, customer name or mobile…",
  disabled = false,
}: SubscriptionComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isFetching } = useQuery({
    queryKey: ["sub-combobox-search", query],
    queryFn: () =>
      subscriptionsService.list({
        page: 1,
        page_size: 12,
        search: query,
        status_filter: "ACTIVE",
        sort_by: "created_at",
        sort_order: "desc",
      }),
    enabled: query.length >= 1,
    staleTime: 10_000,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const displayValue = value
    ? `${value.subscription_code} · ${value.customer_name ?? ""} · ${value.plan_name_snapshot}`
    : "";

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (value) onChange(null);
    setOpen(true);
  }

  function handleFocus() {
    if (value) {
      setQuery("");
      onChange(null);
    }
    setOpen(true);
  }

  function handleSelect(s: Subscription) {
    onChange(s);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOpen(false);
  }

  const showDropdown = open && query.length >= 1 && !value;
  const subs = results?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={value ? displayValue : query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          className={`w-full rounded-lg border border-input bg-background py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {isFetching ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : subs.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No active subscriptions found</p>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {subs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={() => handleSelect(s)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                >
                  <span className="shrink-0 font-mono text-xs font-semibold text-primary">
                    {s.subscription_code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {s.customer_name ?? "—"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.plan_name_snapshot} · {s.speed_mbps_snapshot} Mbps · ₹{Number(s.base_price_snapshot).toLocaleString("en-IN")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    ACTIVE
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

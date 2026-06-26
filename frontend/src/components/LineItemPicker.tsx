import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { lineItemMastersService } from "@/services/lineItemMasters";
import type { LineItemMaster } from "@/types/lineItemMaster";

interface LineItemPickerProps {
  onSelect: (item: LineItemMaster) => void;
  disabled?: boolean;
}

export function LineItemPicker({ onSelect, disabled }: LineItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["line-item-picker", search],
    queryFn: () =>
      lineItemMastersService.list({
        search: search || undefined,
        active_only: true,
        page_size: 30,
      }),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const items = data?.items ?? [];

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Select from line item masters"
        className={`flex h-[38px] w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${open ? "border-primary bg-primary/5 text-primary" : ""}`}
      >
        <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setSearch(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {isFetching && items.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {search ? "No items match your search" : "No active line items found"}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.default_amount
                        ? `₹${Number(item.default_amount).toFixed(2)}`
                        : "No default amount"}
                      {" · "}GST {item.gst_percentage}%
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

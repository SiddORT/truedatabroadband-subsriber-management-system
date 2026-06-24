import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customersService } from "@/services/customers";
import type { Customer } from "@/types/customer";

interface CustomerComboboxProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomerCombobox({
  value,
  onChange,
  error,
  placeholder = "Search by name, code or mobile…",
  disabled = false,
}: CustomerComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results, isFetching } = useQuery({
    queryKey: ["customer-combobox-search", query],
    queryFn: () =>
      customersService.list({
        page: 1,
        page_size: 15,
        search: query || undefined,
        sort_by: "full_name",
        sort_order: "asc",
      }),
    enabled: open && !value,
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
    ? `${value.full_name} (${value.customer_code})`
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

  function handleSelect(c: Customer) {
    onChange(c);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOpen(false);
  }

  const showDropdown = open && !value;
  const customers = results?.items ?? [];

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
          className={`w-full rounded-lg border bg-background py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            error ? "border-destructive" : "border-input"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        {value && (
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
            <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>
          ) : customers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No customers found</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => handleSelect(c)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                >
                  <span>
                    <span className="font-medium">{c.full_name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{c.customer_code}</span>
                    {c.mobile_number && (
                      <span className="ml-2 text-xs text-muted-foreground">{c.mobile_number}</span>
                    )}
                  </span>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "ACTIVE"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {c.status}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

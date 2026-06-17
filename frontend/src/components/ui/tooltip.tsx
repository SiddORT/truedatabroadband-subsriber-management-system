import { ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={[
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1",
          "bg-[#011425] text-[11px] font-medium leading-none text-white shadow-lg",
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
          "left-1/2 -translate-x-1/2",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        ].join(" ")}
      >
        {label}
        <span
          className={[
            "absolute left-1/2 -translate-x-1/2 border-[4px] border-transparent",
            side === "top"
              ? "top-full border-t-[#011425]"
              : "bottom-full border-b-[#011425]",
          ].join(" ")}
        />
      </span>
    </span>
  );
}

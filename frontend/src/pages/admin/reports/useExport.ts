import { useState } from "react";
import { reportsService } from "@/services/reports";

export function useExport() {
  const [exporting, setExporting] = useState(false);

  const triggerExport = async (
    reportType: string,
    filters: Record<string, string | null | undefined>,
    fmt: "csv" | "xlsx",
  ) => {
    setExporting(true);
    try {
      const res = await reportsService.export({ report_type: reportType, filters, format: fmt });
      const blob = await reportsService.download(res.filename);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return { triggerExport, exporting };
}

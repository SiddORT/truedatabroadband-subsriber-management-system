import { api } from "@/services/api";
import type {
  CustomerReportRow,
  CustomerReportSummary,
  ExportRequest,
  ExportResponse,
  InvoiceReportRow,
  InvoiceReportSummary,
  OutstandingReportRow,
  OutstandingReportSummary,
  PaymentReportRow,
  PaymentReportSummary,
  ReportPage,
  RevenueReport,
  SubscriptionReportRow,
  SubscriptionReportSummary,
} from "@/types/reports";

const BASE = "/reports";

export const reportsService = {
  async getCustomers(params: Record<string, string | number | null | undefined> = {}): Promise<ReportPage<CustomerReportRow, CustomerReportSummary>> {
    const { data } = await api.get(`${BASE}/customers`, { params });
    return data;
  },

  async getSubscriptions(params: Record<string, string | number | null | undefined> = {}): Promise<ReportPage<SubscriptionReportRow, SubscriptionReportSummary>> {
    const { data } = await api.get(`${BASE}/subscriptions`, { params });
    return data;
  },

  async getInvoices(params: Record<string, string | number | null | undefined> = {}): Promise<ReportPage<InvoiceReportRow, InvoiceReportSummary>> {
    const { data } = await api.get(`${BASE}/invoices`, { params });
    return data;
  },

  async getPayments(params: Record<string, string | number | null | undefined> = {}): Promise<ReportPage<PaymentReportRow, PaymentReportSummary>> {
    const { data } = await api.get(`${BASE}/payments`, { params });
    return data;
  },

  async getRevenue(params: Record<string, string | null | undefined> = {}): Promise<RevenueReport> {
    const { data } = await api.get(`${BASE}/revenue`, { params });
    return data;
  },

  async getOutstanding(params: Record<string, string | number | null | undefined> = {}): Promise<ReportPage<OutstandingReportRow, OutstandingReportSummary>> {
    const { data } = await api.get(`${BASE}/outstanding`, { params });
    return data;
  },

  async export(payload: ExportRequest): Promise<ExportResponse> {
    const { data } = await api.post(`${BASE}/export`, payload);
    return data;
  },

  async download(filename: string): Promise<Blob> {
    const { data } = await api.get(`${BASE}/download/${filename}`, {
      responseType: "blob",
    });
    return data;
  },
};

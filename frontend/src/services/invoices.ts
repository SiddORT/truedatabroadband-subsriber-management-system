import { api } from "./api";
import type { Invoice, InvoiceListResponse } from "@/types/invoice";

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status?: string;
  invoice_type?: string;
  customer_filter?: string;
  customer_id?: string;
  plan_filter?: string;
  invoice_date_from?: string;
  invoice_date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  quick_filter?: string;
}

export interface LineItemPayload {
  description: string;
  amount: string;
  original_amount?: string;
  discount_type?: string;
  discount_value?: string;
  discount_amount?: string;
}

interface SubscriptionBillingPayload {
  subscription_id: string;
  line_items?: LineItemPayload[];
  discount_type?: "percentage" | "fixed";
  discount_value?: string;
  discount_label?: string;
  discount_scope?: "base" | "overall";
}

export interface InvoiceUpdatePayload {
  subscription_id?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  invoice_date?: string;
  due_date?: string;
  remarks?: string;
  change_reason: string;
  line_items?: LineItemPayload[];
  discount_type?: "percentage" | "fixed";
  discount_value?: string;
  discount_label?: string;
  discount_scope?: "base" | "overall";
}

async function list(params: InvoiceListParams = {}): Promise<InvoiceListResponse> {
  const { data } = await api.get("/invoices", { params });
  return data;
}

async function get(id: string): Promise<Invoice> {
  const { data } = await api.get(`/invoices/${id}`);
  return data;
}

async function create(payload: {
  subscription_id: string;
  billing_period_start: string;
  billing_period_end: string;
  invoice_date: string;
  due_date?: string;
  remarks?: string;
  line_items?: LineItemPayload[];
  discount_type?: "percentage" | "fixed";
  discount_value?: string;
  discount_label?: string;
  discount_scope?: "base" | "overall";
}): Promise<Invoice> {
  const { data } = await api.post("/invoices", payload);
  return data;
}

async function createConsolidated(payload: {
  customer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  invoice_date: string;
  due_date?: string;
  remarks?: string;
  subscriptions: SubscriptionBillingPayload[];
}): Promise<Invoice> {
  const { data } = await api.post("/invoices/consolidated", payload);
  return data;
}

async function update(id: string, payload: InvoiceUpdatePayload): Promise<Invoice> {
  const { data } = await api.patch(`/invoices/${id}`, payload);
  return data;
}

async function updateStatus(
  id: string,
  status: string,
  change_reason: string
): Promise<Invoice> {
  const { data } = await api.patch(`/invoices/${id}/status`, {
    status,
    change_reason,
  });
  return data;
}

async function getHistory(id: string) {
  const { data } = await api.get(`/invoices/${id}/history`);
  return data;
}

function pdfUrl(id: string): string {
  return `/api/v1/invoices/${id}/pdf`;
}

async function clientList(
  params: { page?: number; page_size?: number } = {}
): Promise<InvoiceListResponse> {
  const { data } = await api.get("/invoices/client/my", { params });
  return data;
}

async function clientGet(id: string): Promise<Invoice> {
  const { data } = await api.get(`/invoices/client/${id}`);
  return data;
}

function clientPdfUrl(id: string): string {
  return `/api/v1/invoices/client/${id}/pdf`;
}

async function deleteInvoice(id: string): Promise<void> {
  await api.delete(`/invoices/${id}`);
}

async function sendEmail(id: string): Promise<{ message: string }> {
  const { data } = await api.post(`/invoices/${id}/send-email`);
  return data;
}

export const invoicesService = {
  list,
  get,
  create,
  createConsolidated,
  update,
  updateStatus,
  getHistory,
  pdfUrl,
  delete: deleteInvoice,
  sendEmail,
  clientList,
  clientGet,
  clientPdfUrl,
};

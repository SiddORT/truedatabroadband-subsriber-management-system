import { api } from "./api";
import type { Invoice, InvoiceListResponse } from "@/types/invoice";

interface ListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  status?: string;
}

async function list(params: ListParams = {}): Promise<InvoiceListResponse> {
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
}): Promise<Invoice> {
  const { data } = await api.post("/invoices", payload);
  return data;
}

async function update(
  id: string,
  payload: {
    billing_period_start?: string;
    billing_period_end?: string;
    invoice_date?: string;
    due_date?: string;
    remarks?: string;
    change_reason: string;
  }
): Promise<Invoice> {
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

export const invoicesService = {
  list,
  get,
  create,
  update,
  updateStatus,
  getHistory,
  pdfUrl,
  clientList,
  clientGet,
  clientPdfUrl,
};

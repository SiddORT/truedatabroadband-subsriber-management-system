import { api } from "./api";
import type { Payment, PaymentListResponse } from "@/types/payment";

interface ListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  invoice_id?: string;
}

async function list(params: ListParams = {}): Promise<PaymentListResponse> {
  const { data } = await api.get("/payments", { params });
  return data;
}

async function get(id: string): Promise<Payment> {
  const { data } = await api.get(`/payments/${id}`);
  return data;
}

async function record(payload: {
  invoice_id: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  transaction_reference?: string;
  notes?: string;
}): Promise<Payment> {
  const { data } = await api.post("/payments", payload);
  return data;
}

async function clientList(
  params: { page?: number; page_size?: number } = {}
): Promise<PaymentListResponse> {
  const { data } = await api.get("/payments/client/my", { params });
  return data;
}

export const paymentsService = {
  list,
  get,
  record,
  clientList,
};

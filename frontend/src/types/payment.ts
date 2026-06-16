export interface Payment {
  id: string;
  payment_number: string;
  invoice_id: string;
  amount: string;
  payment_date: string;
  payment_method: PaymentMethod;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentListItem {
  id: string;
  payment_number: string;
  invoice_id: string;
  amount: string;
  payment_date: string;
  payment_method: PaymentMethod;
  transaction_reference: string | null;
  created_at: string;
}

export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  CASH: "bg-green-100 text-green-700",
  UPI: "bg-blue-100 text-blue-700",
  BANK_TRANSFER: "bg-indigo-100 text-indigo-700",
  CHEQUE: "bg-purple-100 text-purple-700",
};

export interface PaymentListResponse {
  items: PaymentListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

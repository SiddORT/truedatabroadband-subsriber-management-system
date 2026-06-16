export type CustomerStatus = "ACTIVE" | "SUSPENDED" | "DISCONNECTED";

export interface Customer {
  id: string;
  customer_code: string;
  user_id: string;
  full_name: string;
  mobile_number: string;
  alternate_mobile_number: string | null;
  email: string;
  installation_address: string;
  city: string;
  state: string;
  pincode: string;
  status: CustomerStatus;
  notes: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateResponse extends Customer {
  temp_password: string;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CustomerCreatePayload {
  full_name: string;
  mobile_number: string;
  alternate_mobile_number?: string;
  email: string;
  installation_address: string;
  city: string;
  state: string;
  pincode: string;
  notes?: string;
}

export interface CustomerUpdatePayload extends Partial<CustomerCreatePayload> {}

export interface CustomerListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  status?: CustomerStatus | "";
}

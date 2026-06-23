export type CustomerStatus = "ACTIVE" | "SUSPENDED" | "DISCONNECTED";
export type CustomerType = "INDIVIDUAL" | "BUSINESS";
export type KycType =
  | "AADHAAR"
  | "PAN"
  | "PASSPORT"
  | "VOTER_ID"
  | "DRIVING_LICENSE";

export interface KycDocumentItem {
  kyc_type: KycType;
  kyc_number: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  user_id: string;

  // Customer type
  customer_type: CustomerType;
  company_name: string | null;
  gst_number: string | null;

  // Basic info
  full_name: string;
  mobile_number: string;
  alternate_mobile_number: string | null;
  email: string;

  // Identity
  kyc_type: KycType | null;
  kyc_number: string | null;
  kyc_documents: KycDocumentItem[] | null;

  // Installation address
  installation_address: string;
  address_line_2: string | null;
  landmark: string | null;
  pincode: string;
  district: string | null;
  city: string;
  state: string;

  // Billing address
  billing_same_as_installation: boolean;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_landmark: string | null;
  billing_pincode: string | null;
  billing_district: string | null;
  billing_city: string | null;
  billing_state: string | null;

  // Spokesperson
  spokesperson_name: string | null;
  spokesperson_mobile: string | null;
  spokesperson_email: string | null;
  spokesperson_designation: string | null;

  // Additional info
  connection_date: string | null;
  reference_source: string | null;
  sales_person: string | null;
  notes: string | null;

  // Status
  status: CustomerStatus;

  // Documents (null = not uploaded)
  profile_photo_path: string | null;
  kyc_document_path: string | null;
  agreement_document_path: string | null;

  // Denormalised from user
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
  customer_type?: CustomerType;
  company_name?: string;
  gst_number?: string;

  full_name: string;
  mobile_number: string;
  alternate_mobile_number?: string;
  email: string;

  kyc_documents?: KycDocumentItem[];

  installation_address: string;
  address_line_2?: string;
  landmark?: string;
  pincode: string;
  district?: string;
  city: string;
  state: string;

  billing_same_as_installation?: boolean;
  billing_address_line_1?: string;
  billing_address_line_2?: string;
  billing_landmark?: string;
  billing_pincode?: string;
  billing_district?: string;
  billing_city?: string;
  billing_state?: string;

  spokesperson_name?: string;
  spokesperson_mobile?: string;
  spokesperson_email?: string;
  spokesperson_designation?: string;

  connection_date?: string;
  reference_source?: string;
  sales_person?: string;
  notes?: string;
}

export type CustomerUpdatePayload = Partial<CustomerCreatePayload>;

export interface CustomerListParams {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  status?: CustomerStatus | "";
  customer_type?: string;
  city?: string;
  reference_source?: string;
  sales_person?: string;
}

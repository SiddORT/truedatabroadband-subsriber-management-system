export interface CompanySettings {
  id: string;
  company_name: string;
  legal_name: string | null;
  gst_number: string | null;
  pan_number: string | null;
  support_email: string | null;
  support_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  logo_path: string | null;
  logo_url: string | null;
  invoice_prefix: string;
  invoice_due_days: number;
  default_gst_percentage: string;
  invoice_footer_text: string | null;
  terms_and_conditions: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanySettingsUpdate {
  company_name?: string;
  legal_name?: string | null;
  gst_number?: string | null;
  pan_number?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string;
  invoice_prefix?: string;
  invoice_due_days?: number;
  default_gst_percentage?: string | number;
  invoice_footer_text?: string | null;
  terms_and_conditions?: string | null;
}

export interface LogoUploadResponse {
  logo_path: string;
  logo_url: string;
  message: string;
}

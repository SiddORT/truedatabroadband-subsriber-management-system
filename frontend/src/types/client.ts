export interface ClientProfile {
  customer_code: string;
  full_name: string;
  customer_type: string;
  email: string;
  mobile_number: string;
  alternate_mobile_number: string | null;
  installation_address: string;
  city: string;
  state: string;
  pincode: string;
  status: string;
  connection_date: string | null;
  created_at: string;
}

export interface ClientProfileUpdate {
  alternate_mobile_number?: string | null;
}

export interface ClientSession {
  id: string;
  jti: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

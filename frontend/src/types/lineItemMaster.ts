export interface LineItemMaster {
  id: string;
  name: string;
  hsn_sac_code: string | null;
  description: string | null;
  default_amount: string | null;
  gst_percentage: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LineItemMasterListResponse {
  items: LineItemMaster[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

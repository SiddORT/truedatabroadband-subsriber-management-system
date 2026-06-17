export interface ScheduledJobOut {
  id: string;
  job_key: string;
  job_name: string;
  description: string | null;
  cron_expression: string;
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: "SUCCESS" | "FAILED" | "RUNNING" | null;
  max_retries: number;
  created_at: string;
  updated_at: string;
}

export interface JobExecutionLogOut {
  id: string;
  scheduled_job_id: string;
  started_at: string;
  completed_at: string | null;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  records_processed: number | null;
  execution_time_ms: number | null;
  error_message: string | null;
  execution_details: Record<string, unknown> | null;
}

export interface JobListResponse {
  items: ScheduledJobOut[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface JobUpdatePayload {
  cron_expression?: string;
  max_retries?: number;
}

export interface JobToggleResponse {
  id: string;
  job_key: string;
  is_enabled: boolean;
  message: string;
}

export interface JobRunResponse {
  job_key: string;
  message: string;
  execution_log_id: string | null;
}

import { api } from "@/services/api";
import type {
  CompanySettings,
  CompanySettingsUpdate,
  LogoUploadResponse,
} from "@/types/settings";

const BASE = "/settings/company";

export const settingsService = {
  async get(): Promise<CompanySettings> {
    const { data } = await api.get<CompanySettings>(BASE);
    return data;
  },

  async update(payload: CompanySettingsUpdate): Promise<CompanySettings> {
    const { data } = await api.put<CompanySettings>(BASE, payload);
    return data;
  },

  async uploadLogo(file: File): Promise<LogoUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<LogoUploadResponse>(
      `${BASE}/logo`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  },

  logoUrl(): string {
    return "/api/v1/settings/company/logo";
  },
};

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Mail, Save, Send, CheckCircle2, Eye, EyeOff } from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/contexts/ToastContext";
import {
  getSmsSettings,
  updateSmsSettings,
  testSms,
  getEmailSettings,
  updateEmailSettings,
  testEmail,
} from "@/services/communication";
import type { SmsSettingsUpdate, EmailSettingsUpdate } from "@/types/communication";
import { SMS_PROVIDERS } from "@/types/communication";

// ── Helpers ───────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-[#1F4959]" />
      <h2 className="text-lg font-semibold text-[#1F4959]">{title}</h2>
    </div>
  );
}

function CredentialField({
  label,
  configuredLabel,
  isConfigured,
  replaceKey,
  replaceValue,
  setReplace,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  configuredLabel: string;
  isConfigured: boolean;
  replaceKey: string;
  replaceValue: boolean;
  setReplace: (v: boolean) => void;
  value: string;
  setValue: (v: string) => void;
  placeholder?: string;
}) {
  const [showVal, setShowVal] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {isConfigured && !replaceValue ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {configuredLabel}
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setReplace(true)}>
            Replace
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            type={showVal ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="rounded-xl pr-10"
          />
          <button
            type="button"
            onClick={() => setShowVal((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showVal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {isConfigured && (
            <button
              type="button"
              onClick={() => setReplace(false)}
              className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── SMS Tab ───────────────────────────────────────────────────────────────

function SmsTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: getSmsSettings,
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [provider, setProvider] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [statusApiUrl, setStatusApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [replaceApiKey, setReplaceApiKey] = useState(false);
  const [replaceClientId, setReplaceClientId] = useState(false);
  const [replaceSenderId, setReplaceSenderId] = useState(false);
  const [replaceEntityId, setReplaceEntityId] = useState(false);
  const [testMobile, setTestMobile] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setIsEnabled(settings.is_enabled);
    setProvider(settings.provider ?? "");
    setApiBaseUrl(settings.api_base_url ?? "");
    setStatusApiUrl(settings.status_api_url ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: updateSmsSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms-settings"] });
      showToast("SMS settings saved", "success");
    },
    onError: (err: any) => showToast(err?.response?.data?.detail ?? "Failed to save", "error"),
  });

  const testMutation = useMutation({
    mutationFn: testSms,
    onSuccess: () => showToast("Test SMS sent successfully", "success"),
    onError: (err: any) => showToast(err?.response?.data?.detail ?? "Test SMS failed", "error"),
  });

  const handleSave = () => {
    const payload: SmsSettingsUpdate = {
      is_enabled: isEnabled,
      provider: provider || null,
      api_base_url: apiBaseUrl || null,
      status_api_url: statusApiUrl || null,
      api_key: replaceApiKey ? apiKey : null,
      client_id: replaceClientId ? clientId : null,
      sender_id: replaceSenderId ? senderId : null,
      entity_id: replaceEntityId ? entityId : null,
      replace_api_key: replaceApiKey,
      replace_client_id: replaceClientId,
      replace_sender_id: replaceSenderId,
      replace_entity_id: replaceEntityId,
    };
    saveMutation.mutate(payload);
  };

  if (isLoading) return <div className="py-8 text-center text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50">
        <input
          type="checkbox"
          id="sms-enabled"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4 accent-[#1F4959]"
        />
        <Label htmlFor="sms-enabled" className="cursor-pointer font-medium">
          Enable SMS Notifications
        </Label>
      </div>

      {/* Provider */}
      <div className="space-y-1.5">
        <Label>SMS Provider</Label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4959]/30"
        >
          <option value="">Select provider…</option>
          {SMS_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* URLs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>API Base URL</Label>
          <Input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="http://65.2.162.85"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status API URL</Label>
          <Input
            value={statusApiUrl}
            onChange={(e) => setStatusApiUrl(e.target.value)}
            placeholder="http://65.2.162.85"
            className="rounded-xl"
          />
        </div>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CredentialField
          label="API Key"
          configuredLabel="API key is configured"
          isConfigured={settings?.api_key_configured ?? false}
          replaceKey="replace_api_key"
          replaceValue={replaceApiKey}
          setReplace={setReplaceApiKey}
          value={apiKey}
          setValue={setApiKey}
          placeholder="Your SMS API key"
        />
        <CredentialField
          label="Client ID"
          configuredLabel="Client ID is configured"
          isConfigured={settings?.client_id_configured ?? false}
          replaceKey="replace_client_id"
          replaceValue={replaceClientId}
          setReplace={setReplaceClientId}
          value={clientId}
          setValue={setClientId}
          placeholder="Your client ID"
        />
        <CredentialField
          label="Sender ID (DLT)"
          configuredLabel="Sender ID is configured"
          isConfigured={settings?.sender_id_configured ?? false}
          replaceKey="replace_sender_id"
          replaceValue={replaceSenderId}
          setReplace={setReplaceSenderId}
          value={senderId}
          setValue={setSenderId}
          placeholder="e.g. TRUDTA"
        />
        <CredentialField
          label="Entity ID (DLT)"
          configuredLabel="Entity ID is configured"
          isConfigured={settings?.entity_id_configured ?? false}
          replaceKey="replace_entity_id"
          replaceValue={replaceEntityId}
          setReplace={setReplaceEntityId}
          value={entityId}
          setValue={setEntityId}
          placeholder="Your DLT entity ID"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="rounded-xl bg-[#1F4959] hover:bg-[#011425] flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save SMS Settings"}
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Input
            value={testMobile}
            onChange={(e) => setTestMobile(e.target.value)}
            placeholder="Test mobile number"
            className="rounded-xl w-44"
          />
          <Button
            variant="outline"
            onClick={() => testMutation.mutate(testMobile)}
            disabled={!testMobile || testMutation.isPending}
            className="rounded-xl flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {testMutation.isPending ? "Sending…" : "Test SMS"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Email Tab ─────────────────────────────────────────────────────────────

function EmailTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: getEmailSettings,
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [useTls, setUseTls] = useState(true);
  const [useSsl, setUseSsl] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [replaceUsername, setReplaceUsername] = useState(false);
  const [replacePassword, setReplacePassword] = useState(false);
  const [testEmailAddr, setTestEmailAddr] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (settings && !initialized) {
    setIsEnabled(settings.is_enabled);
    setHost(settings.host ?? "");
    setPort(String(settings.port ?? 587));
    setFromEmail(settings.from_email ?? "");
    setFromName(settings.from_name ?? "");
    setUseTls(settings.use_tls);
    setUseSsl(settings.use_ssl);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: updateEmailSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-settings"] });
      showToast("Email settings saved", "success");
    },
    onError: (err: any) => showToast(err?.response?.data?.detail ?? "Failed to save", "error"),
  });

  const testMutation = useMutation({
    mutationFn: testEmail,
    onSuccess: () => showToast("Test email sent successfully", "success"),
    onError: (err: any) => showToast(err?.response?.data?.detail ?? "Test email failed", "error"),
  });

  const handleSave = () => {
    const payload: EmailSettingsUpdate = {
      is_enabled: isEnabled,
      host: host || null,
      port: parseInt(port) || 587,
      from_email: fromEmail || null,
      from_name: fromName || null,
      use_tls: useTls,
      use_ssl: useSsl,
      username: replaceUsername ? username : null,
      password: replacePassword ? password : null,
      replace_username: replaceUsername,
      replace_password: replacePassword,
    };
    saveMutation.mutate(payload);
  };

  if (isLoading) return <div className="py-8 text-center text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50">
        <input
          type="checkbox"
          id="email-enabled"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4 accent-[#1F4959]"
        />
        <Label htmlFor="email-enabled" className="cursor-pointer font-medium">
          Enable Email Notifications
        </Label>
      </div>

      {/* SMTP Config */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>SMTP Host</Label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>SMTP Port</Label>
          <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>From Email</Label>
          <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@example.com" className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>From Name</Label>
          <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="True Data Broadband" className="rounded-xl" />
        </div>
      </div>

      {/* TLS / SSL */}
      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} className="h-4 w-4 accent-[#1F4959]" />
          <span className="text-sm font-medium">Use TLS (STARTTLS)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} className="h-4 w-4 accent-[#1F4959]" />
          <span className="text-sm font-medium">Use SSL</span>
        </label>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CredentialField
          label="SMTP Username"
          configuredLabel="Username is configured"
          isConfigured={settings?.username_configured ?? false}
          replaceKey="replace_username"
          replaceValue={replaceUsername}
          setReplace={setReplaceUsername}
          value={username}
          setValue={setUsername}
          placeholder="your@email.com"
        />
        <CredentialField
          label="SMTP Password"
          configuredLabel="Password is configured"
          isConfigured={settings?.password_configured ?? false}
          replaceKey="replace_password"
          replaceValue={replacePassword}
          setReplace={setReplacePassword}
          value={password}
          setValue={setPassword}
          placeholder="SMTP password or app password"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-end gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="rounded-xl bg-[#1F4959] hover:bg-[#011425] flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save Email Settings"}
        </Button>

        <div className="flex items-center gap-2 ml-auto">
          <Input
            value={testEmailAddr}
            onChange={(e) => setTestEmailAddr(e.target.value)}
            placeholder="test@example.com"
            className="rounded-xl w-48"
          />
          <Button
            variant="outline"
            onClick={() => testMutation.mutate(testEmailAddr)}
            disabled={!testEmailAddr || testMutation.isPending}
            className="rounded-xl flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {testMutation.isPending ? "Sending…" : "Test Email"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

type TabId = "sms" | "email";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "sms", label: "SMS Settings", icon: MessageSquare },
  { id: "email", label: "Email Settings", icon: Mail },
];

export function CommunicationSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("sms");

  return (
    <AppLayout title="Communication Settings" portalLabel="Administration">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1F4959]">Communication Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure SMS and email providers. Credentials are encrypted before storage.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === id
                  ? "bg-white text-[#1F4959] shadow-sm"
                  : "text-gray-600 hover:text-[#1F4959]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {activeTab === "sms" ? (
            <>
              <SectionTitle icon={MessageSquare} title="SMS Provider Configuration" />
              <SmsTab />
            </>
          ) : (
            <>
              <SectionTitle icon={Mail} title="SMTP / Email Configuration" />
              <EmailTab />
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

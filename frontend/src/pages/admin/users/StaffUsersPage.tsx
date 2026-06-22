import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  RefreshCw,
  UserCheck,
  UserX,
  Pencil,
  Search,
  Mail,
  Trash2,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { staffUsersService, rolesService } from "@/services/roles";
import { getApiErrorMessage } from "@/services/api";
import { useToast } from "@/contexts/ToastContext";
import type { StaffUser, StaffUserInvite, StaffUserUpdate } from "@/types/roles";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  INVITED: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  INVITED: "Invited",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// ── Invite Dialog ─────────────────────────────────────────────────────────────

function InviteDialog({
  roles,
  onClose,
  onSave,
  loading,
  error,
}: {
  roles: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: StaffUserInvite) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ email, display_name: displayName, role_id: roleId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Invite Staff User</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name *</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Ravi Kumar"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="staff@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Role *</label>
            {roles.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                No active roles found. Create a role first.
              </div>
            ) : (
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || roles.length === 0}
              className={cn(
                "flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity",
                loading || roles.length === 0 ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
              )}
            >
              <Mail className="h-4 w-4" />
              {loading ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  user,
  roles,
  onClose,
  onSave,
  loading,
}: {
  user: StaffUser;
  roles: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: StaffUserUpdate) => void;
  loading: boolean;
}) {
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [roleId, setRoleId] = useState(user.role_id ?? "");
  const [isActive, setIsActive] = useState(user.is_active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      display_name: displayName || undefined,
      email: email || undefined,
      role_id: roleId || undefined,
      is_active: isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Edit Staff User</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="staff@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">— Unassigned —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                isActive ? "bg-primary" : "bg-border",
              )}
            >
              <span className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                isActive ? "translate-x-4" : "translate-x-0.5",
              )} />
            </button>
            <span className="text-sm text-foreground">Active account</span>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className={cn("rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity", loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90")}>
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm Dialog ──────────────────────────────────────────────────────

function DeleteConfirmDialog({
  user,
  onClose,
  onConfirm,
  loading,
}: {
  user: StaffUser;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Delete User?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{user.display_name ?? user.email}</span> will be permanently removed and will no longer be able to log in. This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "flex-1 rounded-xl bg-destructive py-2 text-sm font-semibold text-white transition-opacity",
              loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
            )}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function StaffUsersPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<StaffUser | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-users", search],
    queryFn: () => staffUsersService.list({ search: search || undefined, limit: 100 }),
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesService.list(false),
  });

  const activeRoles = rolesData?.items ?? [];

  const inviteMutation = useMutation({
    mutationFn: staffUsersService.invite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setInviteOpen(false);
      setInviteError(null);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setInviteError(detail ?? "Failed to send invite");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StaffUserUpdate }) =>
      staffUsersService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setEditUser(null);
      showToast("User updated successfully", "success");
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err), "error");
    },
  });

  const resendMutation = useMutation({
    mutationFn: staffUsersService.resendInvite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      showToast("Invite email resent successfully", "success");
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err), "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffUsersService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-users"] });
      setDeleteUser(null);
      showToast("User deleted", "success");
    },
    onError: (err: unknown) => {
      showToast(getApiErrorMessage(err), "error");
    },
  });

  const items = data?.items ?? [];

  return (
    <AppLayout title="Users" portalLabel="Admin Portal">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Users</h2>
            <p className="text-sm text-muted-foreground">Manage admin portal access for your team</p>
          </div>
          <button
            onClick={() => { setInviteError(null); setInviteOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Invite User
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserCheck className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No staff users yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Invite team members to give them portal access</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name / Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{user.display_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">{user.staff_role?.name ?? <span className="text-muted-foreground">—</span>}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_STYLES[user.invite_status] ?? "bg-muted text-muted-foreground",
                      )}>
                        {STATUS_LABELS[user.invite_status] ?? user.invite_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {user.invite_status === "INVITED" && (
                          <button
                            onClick={() => resendMutation.mutate(user.id)}
                            disabled={resendMutation.isPending}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary/70 hover:bg-primary/10 hover:text-primary active:bg-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Resend invite"
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", resendMutation.isPending && "animate-spin")} />
                            {resendMutation.isPending ? "Sending…" : "Resend"}
                          </button>
                        )}
                        <button
                          onClick={() => setEditUser(user)}
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: user.id, payload: { is_active: !user.is_active } })}
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                          title={user.is_active ? "Deactivate" : "Reactivate"}
                        >
                          {user.is_active
                            ? <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                            : <UserCheck className="h-3.5 w-3.5 text-green-600" />
                          }
                        </button>
                        <button
                          onClick={() => setDeleteUser(user)}
                          className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {inviteOpen && (
        <InviteDialog
          roles={activeRoles.map((r) => ({ id: r.id, name: r.name }))}
          onClose={() => { setInviteOpen(false); setInviteError(null); }}
          onSave={(data) => inviteMutation.mutate(data)}
          loading={inviteMutation.isPending}
          error={inviteError}
        />
      )}

      {editUser && (
        <EditDialog
          user={editUser}
          roles={activeRoles.map((r) => ({ id: r.id, name: r.name }))}
          onClose={() => setEditUser(null)}
          onSave={(data) => updateMutation.mutate({ id: editUser.id, payload: data })}
          loading={updateMutation.isPending}
        />
      )}

      {deleteUser && (
        <DeleteConfirmDialog
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onConfirm={() => deleteMutation.mutate(deleteUser.id)}
          loading={deleteMutation.isPending}
        />
      )}
    </AppLayout>
  );
}

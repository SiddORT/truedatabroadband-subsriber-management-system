import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Shield,
  Pencil,
  Trash2,
  Users,
  ChevronRight,
} from "lucide-react";

import { AppLayout } from "@/layouts/AppLayout";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { rolesService } from "@/services/roles";
import { useToast } from "@/contexts/ToastContext";
import type { Role, RoleCreate, RoleUpdate, PermissionMap } from "@/types/roles";
import { PERMISSION_MODULES, PERMISSION_ACTIONS, emptyPermissions } from "@/types/roles";
import { cn } from "@/lib/utils";

const DATA_SCOPE_LABELS: Record<string, string> = {
  ALL: "All Customers",
  ASSIGNED: "Assigned Only",
  REFERENCE: "Reference Only",
};

const DATA_SCOPE_COLORS: Record<string, string> = {
  ALL: "bg-primary/10 text-primary",
  ASSIGNED: "bg-amber-100 text-amber-700",
  REFERENCE: "bg-purple-100 text-purple-700",
};

// ── Permission Matrix Component ───────────────────────────────────────────────

function Checkbox({
  checked,
  onClick,
  disabled = false,
  label,
}: {
  checked: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "mx-auto flex h-5 w-5 items-center justify-center rounded border transition-colors",
        checked ? "border-primary bg-primary text-white" : "border-border bg-background",
        !disabled && "cursor-pointer hover:border-primary",
        disabled && "cursor-default",
      )}
    >
      {checked && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

function PermissionMatrix({
  permissions,
  onChange,
  readOnly = false,
}: {
  permissions: PermissionMap;
  onChange?: (p: PermissionMap) => void;
  readOnly?: boolean;
}) {
  const allModulesAllOn = PERMISSION_MODULES.every(({ key }) =>
    PERMISSION_ACTIONS.every((a) => permissions[key]?.[a]),
  );

  const toggle = (module: string, action: string) => {
    if (readOnly || !onChange) return;
    onChange({
      ...permissions,
      [module]: {
        ...permissions[module],
        [action]: !permissions[module]?.[action as keyof typeof permissions[string]],
      },
    });
  };

  const toggleRow = (module: string) => {
    if (readOnly || !onChange) return;
    const allOn = PERMISSION_ACTIONS.every((a) => permissions[module]?.[a]);
    onChange({
      ...permissions,
      [module]: { view: !allOn, add: !allOn, edit: !allOn, delete: !allOn },
    });
  };

  const toggleAll = () => {
    if (readOnly || !onChange) return;
    const next = !allModulesAllOn;
    const updated: PermissionMap = {};
    for (const { key } of PERMISSION_MODULES) {
      updated[key] = { view: next, add: next, edit: next, delete: next };
    }
    onChange(updated);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2.5 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Module
            </th>
            {PERMISSION_ACTIONS.map((a) => (
              <th key={a} className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground capitalize">
                {a}
              </th>
            ))}
            <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {readOnly ? (
                "All"
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span>All</span>
                  <Checkbox
                    checked={allModulesAllOn}
                    onClick={toggleAll}
                    label="Grant full access to all modules"
                  />
                </div>
              )}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {PERMISSION_MODULES.map(({ key, label }) => {
            const rowAllOn = PERMISSION_ACTIONS.every((a) => permissions[key]?.[a]);
            return (
              <tr key={key} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 pr-4 font-medium text-foreground">{label}</td>
                {PERMISSION_ACTIONS.map((action) => (
                  <td key={action} className="px-3 py-2.5 text-center">
                    <Checkbox
                      checked={!!permissions[key]?.[action as keyof typeof permissions[string]]}
                      onClick={() => toggle(key, action)}
                      disabled={readOnly}
                      label={`${label} ${action}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <Checkbox
                    checked={rowAllOn}
                    onClick={() => toggleRow(key)}
                    disabled={readOnly}
                    label={`${label} full access`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Role Form Dialog ──────────────────────────────────────────────────────────

function RoleDialog({
  role,
  onClose,
  onSave,
}: {
  role?: Role;
  onClose: () => void;
  onSave: (data: RoleCreate) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [dataScope, setDataScope] = useState<"ALL" | "ASSIGNED" | "REFERENCE">(
    (role?.data_scope as "ALL" | "ASSIGNED" | "REFERENCE") ?? "ALL",
  );
  const [permissions, setPermissions] = useState<PermissionMap>(
    role?.permissions ?? emptyPermissions(),
  );
  const [isActive, setIsActive] = useState(role?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, description: description || undefined, data_scope: dataScope, permissions, is_active: isActive });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {role ? "Edit Role" : "Create Role"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Role Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Field Agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Data Scope</label>
              <select
                value={dataScope}
                onChange={(e) => setDataScope(e.target.value as typeof dataScope)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="ALL">All Customers</option>
                <option value="ASSIGNED">Assigned Only</option>
                <option value="REFERENCE">Reference Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Optional description"
            />
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-foreground">Permissions</p>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <PermissionMatrix permissions={permissions} onChange={setPermissions} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                isActive ? "bg-primary" : "bg-border",
              )}
            >
              <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform", isActive ? "translate-x-4" : "translate-x-0.5")} />
            </button>
            <span className="text-sm text-foreground">Active</span>
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
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {role ? "Save Changes" : "Create Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function RolesPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [viewPerms, setViewPerms] = useState<Role | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesService.list(true),
  });

  const createMutation = useMutation({
    mutationFn: rolesService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setCreating(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RoleUpdate }) =>
      rolesService.update(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: rolesService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      setPendingDelete(null);
    },
  });

  const handleDelete = (role: Role) => {
    if (role.user_count > 0) {
      showToast(
        `Cannot delete "${role.name}" — it has ${role.user_count} staff user(s) assigned.`,
        "error",
      );
      return;
    }
    setPendingDelete(role);
  };

  return (
    <AppLayout title="Roles" portalLabel="Admin Portal">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Roles & Permissions</h2>
            <p className="text-sm text-muted-foreground">Define what staff users can see and do</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            New Role
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.items ?? []).map((role) => (
              <div
                key={role.id}
                className="rounded-2xl border border-border bg-surface p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl",
                      role.is_active ? "bg-primary/10" : "bg-muted",
                    )}>
                      <Shield className={cn("h-4 w-4", role.is_active ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{role.name}</p>
                      {!role.is_active && (
                        <span className="text-xs text-muted-foreground">Inactive</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(role)}
                      className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(role)}
                      className="rounded-lg p-1.5 hover:bg-destructive/8 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>

                {role.description && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{role.description}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                    DATA_SCOPE_COLORS[role.data_scope] ?? "bg-muted text-muted-foreground",
                  )}>
                    {DATA_SCOPE_LABELS[role.data_scope] ?? role.data_scope}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {role.user_count} user{role.user_count !== 1 ? "s" : ""}
                  </span>
                </div>

                <button
                  onClick={() => setViewPerms(role)}
                  className="mt-4 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  View permissions
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {(data?.items ?? []).length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
                <Shield className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-foreground">No roles yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create your first role to invite staff users</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      {(creating || editing) && (
        <RoleDialog
          role={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) {
              updateMutation.mutate({ id: editing.id, payload: data });
            } else {
              createMutation.mutate(data as RoleCreate);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Role"
        message={`Delete role "${pendingDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />

      {/* View permissions drawer */}
      {viewPerms && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{viewPerms.name}</h2>
                <p className="text-xs text-muted-foreground">Permissions overview</p>
              </div>
              <button onClick={() => setViewPerms(null)} className="rounded-lg p-1 hover:bg-muted">
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <PermissionMatrix
                permissions={viewPerms.permissions ?? emptyPermissions()}
                readOnly
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

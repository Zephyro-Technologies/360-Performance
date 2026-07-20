// Settings — user & role management (real Supabase Auth + profiles).
// Privileged actions go through the admin-users Edge Function; reads are
// RLS-scoped (a non-admin sees only their own profile). No client role switcher.
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { UserDialog } from "../components/settings/UserDialog";
import { useAuth } from "../data/auth";
import { type Role } from "../data/types";
import {
  listProfiles,
  setUserRole,
  setUserActive,
  sendPasswordReset,
  type ProfileRow,
} from "../data/users";
import { Button } from "@360/ui/button";
import { Switch } from "@360/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@360/ui/table";

const ROLES: Role[] = ["Admin", "Staff", "Viewer"];
const DB_TO_APP: Record<string, Role> = { admin: "Admin", staff: "Staff", viewer: "Viewer" };

export function Settings() {
  const { user, can } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    listProfiles()
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeRole(u: ProfileRow, role: Role) {
    try {
      await setUserRole(u.id, role);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change role");
    }
  }

  async function changeActive(u: ProfileRow, active: boolean) {
    try {
      await setUserActive(u.id, active);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status");
    }
  }

  async function resetPw(email: string) {
    try {
      await sendPasswordReset(email);
      toast.success(`Password reset link sent to ${email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset");
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Authentication & access control"
        actions={
          can("manage") && (
            <Button
              className="bg-[#cc0000] text-white hover:bg-[#a30000]"
              onClick={() => setInviteOpen(true)}
            >
              <Plus className="size-4" /> Invite User
            </Button>
          )
        }
      />

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-black hover:bg-black">
              <TableHead className="text-white">User</TableHead>
              <TableHead className="text-white">Role</TableHead>
              <TableHead className="text-white">Status</TableHead>
              <TableHead className="text-white">Active</TableHead>
              {can("manage") && <TableHead className="text-white">Password</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const isSelf = u.id === user?.id;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <p className="font-medium">{u.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    {can("manage") && !isSelf ? (
                      <Select value={DB_TO_APP[u.role]} onValueChange={(v) => changeRole(u, v as Role)}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <StatusBadge status={DB_TO_APP[u.role]} />
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={u.active ? "Available" : "Out of Stock"} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={u.active}
                      disabled={!can("manage") || isSelf}
                      onCheckedChange={(checked) => changeActive(u, checked)}
                    />
                  </TableCell>
                  {can("manage") && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => u.email && resetPw(u.email)}
                      >
                        <KeyRound className="size-3.5" /> Reset
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={can("manage") ? 5 : 4} className="py-10 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <UserDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={refresh} />
      {!can("manage") && (
        <p className="mt-3 text-sm text-muted-foreground">
          You need the Admin role to manage users.
        </p>
      )}
    </div>
  );
}

// Audit trail — reads the real audit_log (populated by the server-side
// log_audit() triggers on every authenticated mutation).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { friendlyError } from "./errors";

export interface AuditRow {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: string | null;
  at: string;
}

// Always refetched on open: the log is written by DB triggers on essentially every mutation in
// the app, so no client-side invalidation list could stay complete. staleTime 0 makes opening
// (or returning to) the Audit tab fetch fresh rows instead of serving a cache that nothing
// invalidates — an audit trail that silently omits recent actions is worse than a slow one.
export function useAuditLog() {
  return useQuery({
    queryKey: ["audit_log"],
    staleTime: 0,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, actor_name, action, entity_type, entity_id, detail, at")
        .order("at", { ascending: false })
        .limit(200);
      if (error) throw new Error(friendlyError(error));
      return (data ?? []) as AuditRow[];
    },
  });
}

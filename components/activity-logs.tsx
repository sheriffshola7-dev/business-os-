"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, CalendarDays, FileText, RefreshCw, Search } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ActivityRow = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  action: "created" | "updated" | "deleted";
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  changed_fields: string[];
  created_at: string;
};

type Props = { supabase: SupabaseClient<Database> | null; workspaceId: string; userId: string };

const entityNames: Record<string, string> = {
  tasks: "Task",
  customers: "Customer",
  customer_interactions: "Customer interaction",
  expenses: "Expense",
  sales: "Sale",
  inventory_items: "Inventory item",
  invoices: "Invoice",
  workspace_members: "Team member",
};

const actionStyles: Record<ActivityRow["action"], string> = {
  created: "bg-[#edf7f0] text-[#16865b]",
  updated: "bg-[#eef4fb] text-[#4779b7]",
  deleted: "bg-[#fff1f0] text-[#b65b54]",
};

function describe(row: ActivityRow) {
  const entity = entityNames[row.entity_type] || row.entity_type.replaceAll("_", " ");
  if (row.action === "created") return `created ${entity.toLowerCase()}`;
  if (row.action === "deleted") return `deleted ${entity.toLowerCase()}`;
  return `updated ${entity.toLowerCase()}`;
}

export default function ActivityLogs({ supabase, workspaceId, userId }: Props) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    if (!supabase || !workspaceId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("activity_logs")
      .select("id,workspace_id,actor_id,action,entity_type,entity_id,entity_label,changed_fields,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (queryError) setError(queryError.message);
    else setRows((data || []) as ActivityRow[]);
    setLoading(false);
  }, [supabase, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const entities = useMemo(() => Array.from(new Set(rows.map(row => row.entity_type))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const text = [row.entity_label, row.entity_type, row.action, ...(row.changed_fields || [])].join(" ").toLowerCase();
    return (entityFilter === "all" || row.entity_type === entityFilter)
      && (actionFilter === "all" || row.action === actionFilter)
      && text.includes(search.toLowerCase());
  }), [rows, entityFilter, actionFilter, search]);

  function exportCsv() {
    const header = ["Date", "Actor", "Action", "Record type", "Record", "Changed fields"];
    const lines = filtered.map(row => [
      new Date(row.created_at).toISOString(),
      row.actor_id === userId ? "You" : "Workspace member",
      row.action,
      entityNames[row.entity_type] || row.entity_type,
      row.entity_label,
      (row.changed_fields || []).join("; "),
    ]);
    const csv = [header, ...lines].map(line => line.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "business-os-activity-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!supabase) return <section className="subtle-card p-5 text-sm">Connect Supabase to view workspace activity.</section>;

  return <div className="space-y-4">
    <section className="subtle-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold">Workspace activity</h2>
          <p className="mt-1 text-[10px] text-[#929c95]">A record of changes made across your workspace. Sensitive record contents are not shown.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="action-button"><ArrowDownToLine size={14}/>Export CSV</button>
          <button type="button" onClick={() => void load()} className="action-button"><RefreshCw size={14}/>Refresh</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_150px]">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#929c95]"/>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search activity or record..." className="field !pl-9"/>
        </label>
        <select value={entityFilter} onChange={event => setEntityFilter(event.target.value)} className="field">
          <option value="all">All record types</option>
          {entities.map(entity => <option key={entity} value={entity}>{entityNames[entity] || entity}</option>)}
        </select>
        <select value={actionFilter} onChange={event => setActionFilter(event.target.value)} className="field">
          <option value="all">All actions</option><option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option>
        </select>
      </div>
    </section>

    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

    <section className="subtle-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#edf0ee] px-4 py-3">
        <div><h3 className="text-[12px] font-bold">Activity history</h3><p className="mt-1 text-[10px] text-[#929c95]">Showing {filtered.length} of {rows.length} recent events</p></div>
        <Activity size={16} className="text-[#16865b]"/>
      </div>
      {loading ? <div className="flex min-h-[180px] items-center justify-center gap-2 text-xs text-[#929c95]"><RefreshCw size={15} className="animate-spin"/>Loading activity...</div>
      : filtered.length === 0 ? <div className="flex min-h-[190px] flex-col items-center justify-center px-5 text-center"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f5f2] text-[#16865b]"><FileText size={18}/></div><p className="mt-3 text-[12px] font-semibold text-[#526057]">{rows.length ? "No matching activity" : "No activity recorded yet"}</p><p className="mt-1 max-w-sm text-[10px] leading-relaxed text-[#929c95]">{rows.length ? "Try changing the search or filters." : "New tasks, customers, sales, invoices, inventory and team changes will appear here."}</p></div>
      : <div className="divide-y divide-[#f0f3f1]">
        {filtered.map(row => <article key={row.id} className="flex gap-3 px-4 py-3">
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f1f5f2] text-[#16865b]"><CalendarDays size={14}/></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-[#46534b]">{row.actor_id === userId ? "You" : "A workspace member"}</span>
              <span className="text-[#89938d]">{describe(row)}</span>
              <span className={"rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize " + actionStyles[row.action]}>{row.action}</span>
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold text-[#526057]">{row.entity_label}</p>
            {row.changed_fields?.length > 0 && <p className="mt-1 text-[10px] text-[#929c95]">Changed: {row.changed_fields.map(field => field.replaceAll("_", " ")).join(", ")}</p>}
            <p className="mt-1 text-[9px] text-[#a0aaa4]">{new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
        </article>)}
      </div>}
      {!loading && rows.length >= 200 && <p className="border-t border-[#edf0ee] px-4 py-3 text-[10px] text-[#929c95]">Showing the latest 200 events. Older activity is not included in this view yet.</p>}
    </section>
  </div>;
}

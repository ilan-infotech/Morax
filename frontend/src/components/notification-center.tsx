import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, CircleAlert, ClipboardCheck, ExternalLink, FileCheck2, LifeBuoy, ShieldAlert } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { morax } from "../api/morax";

type Notification = Record<string, any>;
type Summary = { total: number; unread: number; action_required: number; critical: number };
const emptySummary: Summary = { total: 0, unread: 0, action_required: 0, critical: 0 };
const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");
const relative = (value: unknown) => {
  if (!value) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(String(value)).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
const notificationIcon = (item: Notification) => item.category === "SUPPORT" ? <LifeBuoy size={16} /> : item.category === "SUBMISSION" ? <ClipboardCheck size={16} /> : item.priority === "CRITICAL" ? <ShieldAlert size={16} /> : <FileCheck2 size={16} />;

function notificationTarget(item: Notification, prefix: string) {
  if (item.reference_type === "ComplianceInstance") return `${prefix}/compliances/detail/${item.reference_id}`;
  if (item.reference_type === "SupportTicket") return `${prefix}/support-tickets?ticket=${encodeURIComponent(String(item.reference_id))}`;
  return `${prefix}/notifications`;
}

export function NotificationBell({ prefix, userId }: { prefix: string; userId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [items, setItems] = useState<Notification[]>([]);
  const refresh = async () => {
    try {
      const [nextSummary, page] = await Promise.all([morax.notificationSummary(), morax.notifications({ page: "1", page_size: "6" })]);
      setSummary(nextSummary); setItems(page.items);
    } catch { /* Bell must never disrupt navigation when notifications are unavailable. */ }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(timer); }, [userId]);
  const openItem = async (item: Notification) => {
    try { if (!item.read_at) await morax.readNotification(String(item.id)); } finally { await refresh(); setOpen(false); navigate(notificationTarget(item, prefix)); }
  };
  const markAll = async () => { await morax.markAllNotificationsRead(); await refresh(); };
  return <div className="notification-bell">
    <button className="topbar-icon-link notification-bell-button" type="button" aria-label="Notifications" aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }}><Bell size={18} />{summary.unread > 0 && <span className="notification-count">{summary.unread > 99 ? "99+" : summary.unread}</span>}</button>
    {open && <section className="notification-popover" aria-label="Recent notifications"><header><div><b>Notifications</b><small>{summary.unread ? `${summary.unread} unread` : "All caught up"}</small></div><button type="button" className="text-action" disabled={!summary.unread} onClick={() => void markAll()}><CheckCheck size={15} />Mark all read</button></header><div className="notification-popover-list">{items.length ? items.map((item) => <button className={`notification-popover-item ${item.read_at ? "" : "unread"}`} key={String(item.id)} type="button" onClick={() => void openItem(item)}><span className="notification-item-icon">{notificationIcon(item)}</span><span><b>{item.title}</b><small>{item.body || label(item.event_type)} · {relative(item.created_at)}</small></span></button>) : <p className="muted">No notifications yet.</p>}</div><Link to={`${prefix}/notifications`} onClick={() => setOpen(false)}>View all notifications <ExternalLink size={14} /></Link></section>}
  </div>;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { organizationId } = useParams();
  const prefix = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [filters, setFilters] = useState({ q: "", category: "", priority: "", unread_only: "", page: "1", page_size: "25" });
  const [data, setData] = useState<{ items: Notification[]; total: number; page: number; page_size: number; summary: Summary }>({ items: [], total: 0, page: 1, page_size: 25, summary: emptySummary });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => { setLoading(true); try { setData(await morax.notifications(filters)); setError(""); } catch { setError("Unable to load notifications. Please try again."); } finally { setLoading(false); } };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [JSON.stringify(filters)]);
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key !== "page" ? { page: "1" } : {}) }));
  const markRead = async (item: Notification) => { try { if (!item.read_at) await morax.readNotification(String(item.id)); await load(); navigate(notificationTarget(item, prefix)); } catch { setError("Unable to update this notification."); } };
  const markAll = async () => { try { await morax.markAllNotificationsRead(); await load(); } catch { setError("Unable to mark notifications as read."); } };
  const summary = data.summary ?? emptySummary;
  const cards = useMemo(() => [["Total notifications", summary.total, Bell], ["Unread", summary.unread, CircleAlert], ["Action required", summary.action_required, ClipboardCheck], ["Critical alerts", summary.critical, ShieldAlert]] as const, [summary]);
  return <section className="modern-page notification-page"><header className="workspace-page-header"><div><p className="eyebrow">NOTIFICATION CENTRE</p><h1>Notifications</h1><p>Compliance deadlines, reviews, assignments, and support updates in one place.</p></div><button className="button-secondary" type="button" disabled={!summary.unread} onClick={() => void markAll()}><CheckCheck size={16} />Mark all read</button></header>{error && <p className="alert error">{error}</p>}<section className="notification-summary-grid">{cards.map(([title, count, Icon]) => <article key={title}><span><Icon size={18} /></span><div><b>{count}</b><small>{title}</small></div></article>)}</section><section className="dashboard-section notification-list-panel"><div className="notification-filter-bar"><label><input value={filters.q} placeholder="Search notifications" onChange={(event) => setFilter("q", event.target.value)} /></label><select value={filters.category} onChange={(event) => setFilter("category", event.target.value)}><option value="">All categories</option><option value="COMPLIANCE">Compliance</option><option value="SUBMISSION">Submissions</option><option value="SUPPORT">Support tickets</option><option value="ASSIGNMENT">Assignments</option></select><select value={filters.priority} onChange={(event) => setFilter("priority", event.target.value)}><option value="">All priorities</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select><select value={filters.unread_only} onChange={(event) => setFilter("unread_only", event.target.value)}><option value="">All notifications</option><option value="true">Unread only</option></select><button className="button-secondary compact-action" type="button" onClick={() => setFilters({ q: "", category: "", priority: "", unread_only: "", page: "1", page_size: "25" })}>Clear filters</button></div>{loading ? <p className="muted">Loading notifications...</p> : data.items.length ? <div className="notification-list">{data.items.map((item) => <article key={String(item.id)} className={item.read_at ? "" : "unread"}><span className="notification-item-icon">{notificationIcon(item)}</span><div><div className="notification-list-title"><b>{item.title}</b>{item.priority !== "NORMAL" && <span className={`notification-priority ${String(item.priority).toLowerCase()}`}>{label(item.priority)}</span>}</div><p>{item.body || label(item.event_type)}</p><small>{label(item.category)} · {new Date(String(item.created_at)).toLocaleString()}</small></div><button className="button-secondary" type="button" onClick={() => void markRead(item)}>{item.read_at ? "Open" : "Open & mark read"}</button></article>)}</div> : <p className="empty-table-message">No notifications match the selected filters.</p>}</section></section>;
}

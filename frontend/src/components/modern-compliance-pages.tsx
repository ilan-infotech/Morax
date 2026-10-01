import { useEffect, useMemo, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Filter,
  History,
  Info,
  Layers3,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { morax } from "../api/morax";
import type { Evidence, GroupedCompliance, Instance, User } from "../api/morax";
import {
  ComplianceStatusBadge,
  DashboardMetricCard,
  DashboardSection,
  EmptyState,
  FilterChip,
  formatDate,
  humanize,
  InlineError,
  LoadingSkeleton,
  WorkspacePageHeader,
} from "./workspace-ui";

const STATUS_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#64748b",
  "#0f766e",
];

const recurringFrequencies = [
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "EVENT_BASED",
];

const statusOptions = [
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "CORRECTION_REQUIRED",
  "REJECTED",
  "NOT_APPLICABLE",
  "OVERDUE",
];

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateAfter = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
};

function isRecurring(instance: Instance) {
  return instance.frequency !== "ONE_TIME";
}

function dueSoon(instance: Instance) {
  const today = toDateInput(new Date());
  return (
    !instance.is_overdue &&
    instance.due_date >= today &&
    instance.due_date <= dateAfter(7) &&
    instance.status !== "APPROVED" &&
    instance.status !== "NOT_APPLICABLE"
  );
}

export function ModernDashboard() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [summary, setSummary] = useState<{
    total: number;
    statuses: Record<string, number>;
    overdue: number;
    completed_late: number;
  }>();
  const [statusData, setStatusData] = useState<Record<string, number>>({});
  const [frequencyData, setFrequencyData] = useState<Record<string, number>>({});
  const [entityData, setEntityData] = useState<
    { entity: string; due: number; overdue: number; done: number; rate: number }[]
  >([]);
  const [upcoming, setUpcoming] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboard, statuses, frequencies, entities, upcomingInstances] =
        await Promise.all([
          morax.dashboard(),
          morax.statusChart(),
          morax.frequencyChart(),
          morax.entityChart(),
          morax.instances({
            date_from: toDateInput(new Date()),
            date_to: dateAfter(14),
            page_size: "20",
          }),
        ]);
      setSummary(dashboard);
      setStatusData(statuses);
      setFrequencyData(frequencies);
      setEntityData(entities);
      setUpcoming(
        upcomingInstances.items.filter(
          (item) =>
            item.status !== "APPROVED" && item.status !== "NOT_APPLICABLE",
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load the dashboard.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const completed = summary?.statuses.APPROVED ?? 0;
  const pending =
    (summary?.statuses.PENDING ?? 0) +
    (summary?.statuses.IN_PROGRESS ?? 0) +
    (summary?.statuses.CORRECTION_REQUIRED ?? 0);
  const completionRate = summary?.total
    ? Math.round((completed / summary.total) * 100)
    : 0;
  const chartStatuses = Object.entries(statusData)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name: humanize(name), value }));
  const chartFrequencies = Object.entries(frequencyData)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name: humanize(name), value }));

  return (
    <div className="modern-page dashboard-page">
      <WorkspacePageHeader
        title="Compliance dashboard"
        description="A live view of organization obligations, due dates, and attention items."
        actions={
          <button className="button-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
        }
      />
      <InlineError message={error} />

      {loading && !summary ? (
        <DashboardSection title="Loading compliance health">
          <LoadingSkeleton rows={5} />
        </DashboardSection>
      ) : (
        <>
          <section className="dashboard-metric-grid" aria-label="Compliance overview">
            <DashboardMetricCard
              label="Total obligations"
              value={summary?.total ?? 0}
              helper="Across accessible entities"
            />
            <DashboardMetricCard
              label="Completed"
              value={completed}
              helper={summary?.total ? `${completionRate}% completion rate` : "No obligations yet"}
              tone="success"
            />
            <DashboardMetricCard
              label="Pending action"
              value={pending}
              helper="Drafts and corrections"
              tone="warning"
            />
            <DashboardMetricCard
              label="Overdue"
              value={summary?.overdue ?? 0}
              helper="Requires immediate attention"
              tone="critical"
            />
            <DashboardMetricCard
              label="Due in 7 days"
              value={upcoming.filter(dueSoon).length}
              helper="Upcoming open obligations"
              tone="warning"
            />
          </section>

          <section className="dashboard-layout dashboard-two-column">
            <DashboardSection
              title="Compliance status"
              description="Distribution of current workflow states."
              className="status-chart-section"
            >
              {chartStatuses.length ? (
                <div className="donut-chart">
                  <ResponsiveContainer width="100%" height={285}>
                    <PieChart>
                      <Pie
                        data={chartStatuses}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={104}
                        paddingAngle={3}
                      >
                        {chartStatuses.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, "Obligations"]} />
                      <Legend iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-chart-total">
                    <strong>{completionRate}%</strong>
                    <span>completed</span>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No status data yet"
                  description="Create and generate compliance obligations to see their status distribution."
                />
              )}
            </DashboardSection>

            <DashboardSection
              title="Upcoming deadlines"
              description="Open obligations due in the next 14 days."
              action={
                <Link className="text-link" to={`${base}/compliances/recurring`}>
                  View worklist
                </Link>
              }
            >
              {upcoming.length ? (
                <div className="deadline-list">
                  {upcoming.slice(0, 5).map((item) => (
                    <Link
                      className="deadline-item"
                      key={item.id}
                      to={`${base}/compliances/detail/${item.id}`}
                    >
                      <span className={item.is_overdue ? "deadline-icon overdue" : "deadline-icon"}>
                        {item.is_overdue ? (
                          <AlertTriangle size={18} />
                        ) : (
                          <CalendarClock size={18} />
                        )}
                      </span>
                      <span className="deadline-copy">
                        <b>{item.compliance_name}</b>
                        <small>{item.subject_name} · {humanize(item.frequency)}</small>
                      </span>
                      <span className={item.is_overdue ? "deadline-date overdue" : "deadline-date"}>
                        {formatDate(item.due_date)}
                        <small>
                          {item.is_overdue
                            ? `${item.days_overdue}d overdue`
                            : dueSoon(item)
                              ? "Due soon"
                              : "Upcoming"}
                        </small>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No upcoming deadlines"
                  description="There are no open compliance obligations due in the next 14 days."
                  icon={CheckCircle2}
                />
              )}
            </DashboardSection>
          </section>

          <section className="dashboard-layout dashboard-two-column">
            <DashboardSection
              title="Obligations by frequency"
              description="Recurring and one-time workload currently in scope."
            >
              {chartFrequencies.length ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartFrequencies} margin={{ top: 8, right: 8, left: -18, bottom: 10 }}>
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip cursor={{ fill: "#eff6ff" }} />
                      <Bar dataKey="value" name="Obligations" fill="#2563eb" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No frequency data yet"
                  description="Frequency insights appear after compliance instances are generated."
                />
              )}
            </DashboardSection>

            <DashboardSection
              title="Entity compliance health"
              description="Due, overdue, and completed obligations by accessible entity."
            >
              {entityData.length ? (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={entityData.slice(0, 8)} margin={{ top: 8, right: 8, left: -18, bottom: 10 }}>
                      <XAxis dataKey="entity" tickLine={false} axisLine={false} fontSize={11} interval={0} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="done" name="Completed" stackId="a" fill="#059669" />
                      <Bar dataKey="due" name="Open" stackId="a" fill="#4f46e5" />
                      <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="No entity summary yet"
                  description="Entity performance is available after obligations have been generated."
                />
              )}
            </DashboardSection>
          </section>
        </>
      )}
    </div>
  );
}

type WorklistFilters = {
  q: string;
  status: string;
  risk_level: string;
  entity_type: string;
  frequency: string;
  due_window: string;
};

const documentTypeLabels: Record<string, string> = {
  PROCEDURAL: "Procedural",
  REGISTER: "Register",
  REMITTANCE: "Remittance",
  RETURN: "Return",
  RECORDS: "Records",
  INTIMATION_FILING: "Intimation/Filing",
  DISPLAY: "Display",
  NOTICE: "Notice",
};

const documentTypeOrder = [
  "REMITTANCE", "RETURN", "REGISTER", "RECORDS", "INTIMATION_FILING", "DISPLAY", "NOTICE", "PROCEDURAL",
];

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

const requestMessage = (error: unknown, fallback = "Request failed") =>
  error instanceof Error ? error.message : fallback;

const canManageCompliance = (user?: User) =>
  !!user &&
  (user.platform_role === "MORAX_ADMIN" ||
    user.roles.some((role) =>
      ["ORGANIZATION_ADMIN", "UNIT_ADMIN", "CONTRACTOR_ADMIN"].includes(role),
    ));

const canCheckCompliance = (user?: User) =>
  !!user &&
  (user.platform_role === "MORAX_ADMIN" ||
    user.roles.some((role) =>
      [
        "ORGANIZATION_ADMIN",
        "UNIT_ADMIN",
        "CONTRACTOR_ADMIN",
        "UNIT_CHECKER",
        "CONTRACTOR_CHECKER",
      ].includes(role),
    ));

const isEditableCompliance = (item: Instance) =>
  !["APPROVED", "SUBMITTED", "UNDER_REVIEW", "NOT_APPLICABLE"].includes(item.status);

const detailText = (value: unknown, fallback = "Not provided") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const snapshotText = (item: Instance, key: string, fallback = "Not provided") =>
  detailText(item[key as keyof Instance] ?? item.rule_snapshot?.[key], fallback);

type ComplianceDialogTab = "overview" | "action" | "documents" | "history";
type DialogTabConfig = {
  id: ComplianceDialogTab;
  icon: ComponentType<{ size?: number }>;
  label: string;
};

const complianceDialogTabs: DialogTabConfig[] = [
  { id: "overview", icon: Info, label: "Overview" },
  { id: "action", icon: Send, label: "Action & Evidence" },
  { id: "documents", icon: FileText, label: "Documents" },
  { id: "history", icon: History, label: "History" },
];

type EntityOption = {
  id: string;
  name: string;
  type: string;
  helper?: string;
};

const recurringDateWindows = [
  ["", "All due dates"],
  ["THIS_MONTH", "This month"],
  ["NEXT_7", "Next 7 days"],
  ["NEXT_30", "Next 30 days"],
] as const;

const recurringStatusLabels: Record<string, string> = {
  DUE: "Due",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
  COMPLETED_LATE: "Completed Late",
  PENDING_FOR_APPROVAL: "Awaiting Approval",
  REJECTED_BY_CHECKER: "Rejected",
};

const daysFromToday = (value: string) => {
  const target = new Date(`${value.slice(0, 10)}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
};

function dueDateHelper(item: Instance) {
  if (item.is_overdue) return `${item.days_overdue}d overdue`;
  const days = daysFromToday(item.due_date);
  if (days === 0) return "Due today";
  if (days > 0) return `${days}d left`;
  return "";
}

function displayStatusLabel(status: string) {
  return recurringStatusLabels[status] ?? humanize(status);
}

function ComplianceKpiCard({
  label,
  value,
  helper,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  helper?: string;
  tone: "due" | "overdue" | "completed" | "late" | "rejected" | "approval" | "rate";
  icon: ComponentType<{ size?: number }>;
}) {
  return (
    <article className={`compliance-kpi-card ${tone}`}>
      <span className="compliance-kpi-icon" aria-hidden="true">
        <Icon size={21} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {helper && <small>{helper}</small>}
      </div>
    </article>
  );
}

function RuleCountChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "due" | "overdue" | "approval" | "rejected";
}) {
  if (!value && tone !== "neutral") return null;
  return <span className={`rule-summary-chip ${tone}`}>{value} {label}</span>;
}

function RecurringRuleGroup({
  group,
  expanded,
  onToggle,
  onOpen,
}: {
  group: GroupedCompliance;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (item: Instance) => void;
}) {
  const reference = group.records[0];
  const ruleReference = [reference?.act, reference?.rule_reference].filter(Boolean).join(" / ");
  return (
    <article className={`rule-group recurring-rule-group ${expanded ? "expanded" : ""}`}>
      <button className="rule-group-header recurring-rule-header" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="rule-group-title recurring-rule-title">
          <span className="rule-group-icon"><FileText size={18} /></span>
          <span>
            <b>{ruleReference || group.name}</b>
            {ruleReference && <small>{group.name}</small>}
          </span>
        </span>
        <span className="rule-group-meta recurring-rule-meta">
          <RuleCountChip label="compliances" value={group.compliance_count} />
          <RuleCountChip label="Due" value={group.due_count} tone="due" />
          <RuleCountChip label="Awaiting Approval" value={group.awaiting_approval_count ?? 0} tone="approval" />
          <RuleCountChip label="Overdue" value={group.overdue_count ?? 0} tone="overdue" />
          <ChevronDown size={18} className={expanded ? "chevron-up" : ""} />
        </span>
      </button>
      {expanded && (
        <div className="modern-table-wrap rule-records-table recurring-records-table">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Entity / Location</th>
                <th>Compliance Requirement</th>
                <th>Document Type</th>
                <th>Form No.</th>
                <th>Frequency</th>
                <th>Due Date</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {group.records.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b className="entity-badge">{item.subject_name}</b>
                    <small>{humanize(item.subject_type)}</small>
                  </td>
                  <td>
                    <b>{item.compliance_name}</b>
                    <small>{item.compliance_id}</small>
                  </td>
                  <td>{documentTypeLabels[item.document_type ?? ""] ?? humanize(item.document_type ?? "PROCEDURAL")}</td>
                  <td>{item.form_number || "-"}</td>
                  <td>{humanize(item.frequency)}<small>{item.period_key}</small></td>
                  <td>
                    <span className={item.is_overdue ? "table-due overdue" : "table-due"}>
                      {formatDate(item.due_date)}
                      <small>{dueDateHelper(item)}</small>
                    </span>
                  </td>
                  <td><span className={`risk-label ${item.risk_level.toLowerCase()}`}>{humanize(item.risk_level)}</span></td>
                  <td><ComplianceStatusBadge status={item.display_status ?? item.status} /></td>
                  <td>
                    <button className="icon-action open-compliance-action" type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.compliance_name}`}>
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function ComplianceActionDialog({
  item,
  onClose,
  detailPath,
  onUpdated,
}: {
  item: Instance | undefined;
  onClose: () => void;
  detailPath: string;
  onUpdated?: () => void | Promise<unknown>;
}) {
  const [activeTab, setActiveTab] = useState<ComplianceDialogTab>("overview");
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState("SUPPORTING_DOCUMENT");
  const [file, setFile] = useState<File | null>(null);
  const [verifyReason, setVerifyReason] = useState("");
  const [assignment, setAssignment] = useState({ maker: "", checker: "" });
  const [activityForm, setActivityForm] = useState({
    filing_reference: "",
    completed_on: "",
    amount: "",
    remarks: "",
  });
  const [working, setWorking] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["compliance-instance-detail", item?.id],
    queryFn: () => morax.instance(item?.id ?? ""),
    enabled: !!item,
  });
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: () => morax.me(),
    enabled: !!item,
    staleTime: 60_000,
  });
  const peopleQuery = useQuery({
    queryKey: ["organization-users-for-compliance-dialog"],
    queryFn: () => morax.users(),
    enabled: !!item,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!item) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    setActiveTab("overview");
    setNotice("");
    setDecisionNote("");
    setComment("");
    setFile(null);
    setVerifyReason("");
    setCategory("SUPPORTING_DOCUMENT");
  }, [item?.id]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;
    setActivityForm({
      filing_reference: detail.activity_reference ?? "",
      completed_on: detail.completed_on ?? "",
      amount: detail.amount?.toString() ?? "",
      remarks: detail.remarks ?? "",
    });
    const activeAssignments = detail.assignments ?? [];
    setAssignment({
      maker: activeAssignments.find((assignmentItem) => assignmentItem.assignment_type === "MAKER")?.user_id ?? "",
      checker: activeAssignments.find((assignmentItem) => assignmentItem.assignment_type === "CHECKER")?.user_id ?? "",
    });
  }, [detailQuery.data]);

  if (!item) return null;

  const detail = detailQuery.data ?? item;
  const user = userQuery.data;
  const people = peopleQuery.data ?? [];
  const editable = isEditableCompliance(detail);
  const manager = canManageCompliance(user);
  const checker = canCheckCompliance(user);
  const activeAssignments = detail.assignments ?? [];
  const assignedName = (type: "MAKER" | "CHECKER") =>
    people.find(
      (person) =>
        person.id ===
        activeAssignments.find((assignmentItem) => assignmentItem.assignment_type === type)?.user_id,
    )?.name ?? "Not assigned";
  const documentType =
    documentTypeLabels[detail.document_type ?? ""] ?? humanize(detail.document_type ?? "PROCEDURAL");
  const actionSummary = detail.required_document
    ? `Prepare and upload: ${detail.required_document}`
    : detail.description || detail.legal_description || "Review the requirement and record the compliance activity.";

  const refreshDetail = async () => {
    await detailQuery.refetch();
    await onUpdated?.();
  };

  const act = async (call: () => Promise<unknown>, success: string) => {
    setWorking(true);
    setNotice("");
    try {
      await call();
      setNotice(`Success: ${success}`);
      await refreshDetail();
    } catch (error) {
      setNotice(requestMessage(error, "Action failed"));
    } finally {
      setWorking(false);
    }
  };

  const verifyEvidence = async (evidence: Evidence, state: "VERIFIED" | "REJECTED") => {
    if (state === "REJECTED" && !verifyReason.trim()) {
      setNotice("Enter a rejection reason before rejecting evidence");
      return;
    }
    await act(
      () => morax.verifyDocument(evidence.id, state, verifyReason.trim() || undefined),
      state === "VERIFIED" ? "Evidence verified" : "Evidence rejected",
    );
    setVerifyReason("");
  };

  const submitActivity = (event: FormEvent) => {
    event.preventDefault();
    act(
      () =>
        morax.activity(detail.id, {
          ...activityForm,
          amount: activityForm.amount ? Number(activityForm.amount) : null,
          completed_on: activityForm.completed_on || null,
          row_version: detail.row_version,
        }),
      "Draft saved",
    );
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        className="compliance-dialog compliance-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compliance-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header compliance-dialog-hero">
          <div>
            <p className="eyebrow">RECURRING COMPLIANCE</p>
            <h2 id="compliance-dialog-title">{detail.compliance_name}</h2>
            <p>
              {[detail.act, detail.rule_reference || detail.section].filter(Boolean).join(" / ") ||
                detail.compliance_id}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-status-row compliance-hero-meta">
          <ComplianceStatusBadge status={detail.display_status ?? detail.status} />
          <span className={`risk-label ${detail.risk_level.toLowerCase()}`}>{humanize(detail.risk_level)}</span>
          <span className="dialog-pill">{humanize(detail.frequency)}</span>
          <span className={detail.is_overdue ? "dialog-due overdue" : "dialog-due"}>
            <CalendarClock size={16} />
            Due {formatDate(detail.due_date)}
          </span>
        </div>
        <div className="compliance-dialog-keyfacts" aria-label="Compliance summary">
          <div><span>Entity</span><b>{detail.subject_name}</b></div>
          <div><span>Document type</span><b>{documentType}</b></div>
          <div><span>Form number</span><b>{detail.form_number || "Not specified"}</b></div>
          <div><span>Period</span><b>{detail.period_key}</b></div>
        </div>
        <div className="required-action-panel">
          <span className="required-action-icon"><ClipboardList size={19} /></span>
          <div>
            <span>Required action</span>
            <p>{actionSummary}</p>
          </div>
        </div>
        <InlineError message={detailQuery.error instanceof Error ? detailQuery.error.message : ""} />
        <InlineError message={notice && !notice.startsWith("Success:") ? notice : ""} />
        {notice.startsWith("Success:") && <p className="alert success">{notice}</p>}
        {detailQuery.isLoading ? (
          <div className="dialog-loading-state">
            <LoadingSkeleton rows={6} />
          </div>
        ) : (
          <>
            <div className="compliance-dialog-tabs" role="tablist" aria-label="Compliance detail sections">
              {complianceDialogTabs.map(({ id, icon: Icon, label }) => (
                <button
                  className={activeTab === id ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  key={id}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            <div className="compliance-dialog-body">
              {activeTab === "overview" && (
                <div className="dialog-section-grid">
                  <section className="dialog-section wide">
                    <h3>Requirement</h3>
                    <dl className="dialog-detail-grid">
                      <div><dt>Compliance ID</dt><dd>{detail.compliance_id}</dd></div>
                      <div><dt>Act / Rule</dt><dd>{[detail.act, detail.rule_reference].filter(Boolean).join(" / ") || "Not provided"}</dd></div>
                      <div><dt>Compliance type</dt><dd>{detailText(detail.compliance_type)}</dd></div>
                      <div><dt>Organization unit / site</dt><dd>{detail.subject_name}<small>{humanize(detail.subject_type)}</small></dd></div>
                      <div><dt>Frequency / period</dt><dd>{humanize(detail.frequency)}<small>{detail.period_key}</small></dd></div>
                      <div><dt>Due date</dt><dd>{formatDate(detail.due_date)}{detail.is_overdue && <small>{detail.days_overdue} days overdue</small>}</dd></div>
                      <div><dt>Assigned owner</dt><dd>Maker: {assignedName("MAKER")}<small>Checker: {assignedName("CHECKER")}</small></dd></div>
                      <div><dt>Rule version</dt><dd>{detailText(detail.version ?? detail.rule_snapshot?.version, "Not available")}</dd></div>
                    </dl>
                  </section>
                  <section className="dialog-section">
                    <h3>Description</h3>
                    <p>{snapshotText(detail, "description")}</p>
                  </section>
                  <section className="dialog-section">
                    <h3>Compliance instructions</h3>
                    <p>{snapshotText(detail, "legal_description")}</p>
                  </section>
                  <section className="dialog-section">
                    <h3>Completion information</h3>
                    <dl className="compact-detail-list">
                      <div><dt>Reference</dt><dd>{detailText(detail.activity_reference)}</dd></div>
                      <div><dt>Completed on</dt><dd>{formatDate(detail.completed_on || undefined)}</dd></div>
                      <div><dt>Amount</dt><dd>{detail.amount ?? "Not recorded"}</dd></div>
                      <div><dt>Remarks</dt><dd>{detailText(detail.remarks)}</dd></div>
                    </dl>
                  </section>
                  <section className="dialog-section">
                    <h3>Applicability</h3>
                    {Object.entries(detail.applicability?.matched ?? {}).length ? (
                      <div className="applicability-list">
                        {Object.entries(detail.applicability?.matched ?? {}).map(([name, matched]) => (
                          <span className={matched ? "matched" : ""} key={name}>
                            {matched ? "Yes" : "No"} - {humanize(name)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>No applicability conditions were recorded.</p>
                    )}
                  </section>
                  <section className="dialog-section wide">
                    <h3>Risk and consequence</h3>
                    <p>{snapshotText(detail, "consequence_or_penalty")}</p>
                  </section>
                </div>
              )}

              {activeTab === "action" && (
                <div className="dialog-section-grid">
                  {manager && (
                    <section className="dialog-section wide">
                      <h3><UserCheck size={16} /> Assignments</h3>
                      <div className="dialog-form-grid compact">
                        <label>
                          Maker
                          <select value={assignment.maker} onChange={(event) => setAssignment({ ...assignment, maker: event.target.value })}>
                            <option value="">Select Maker</option>
                            {people
                              .filter((person) =>
                                person.roles.some(
                                  (role) =>
                                    role.includes("MAKER") ||
                                    role.endsWith("_ADMIN") ||
                                    ["MORAX_ADMIN", "SUPER_ADMIN"].includes(role),
                                ),
                              )
                              .map((person) => <option value={person.id} key={person.id}>{person.name} - {person.email}</option>)}
                          </select>
                        </label>
                        <label>
                          Checker
                          <select value={assignment.checker} onChange={(event) => setAssignment({ ...assignment, checker: event.target.value })}>
                            <option value="">Select Checker</option>
                            {people
                              .filter((person) =>
                                person.roles.some(
                                  (role) =>
                                    role.includes("CHECKER") ||
                                    role.endsWith("_ADMIN") ||
                                    ["MORAX_ADMIN", "SUPER_ADMIN"].includes(role),
                                ),
                              )
                              .map((person) => <option value={person.id} key={person.id}>{person.name} - {person.email}</option>)}
                          </select>
                        </label>
                        <div className="dialog-action-stack">
                          <button disabled={!assignment.maker || working} type="button" onClick={() => act(() => morax.assign(detail.id, { user_id: assignment.maker, assignment_type: "MAKER" }), "Maker assigned")}>Save Maker</button>
                          <button disabled={!assignment.checker || working} type="button" onClick={() => act(() => morax.assign(detail.id, { user_id: assignment.checker, assignment_type: "CHECKER" }), "Checker assigned")}>Save Checker</button>
                        </div>
                      </div>
                    </section>
                  )}
                  <section className="dialog-section wide">
                    <h3><ClipboardCheck size={16} /> Activity and remarks</h3>
                    <form className="dialog-form-grid" onSubmit={submitActivity}>
                      <label>
                        Filing reference
                        <input value={activityForm.filing_reference} disabled={!editable || working} onChange={(event) => setActivityForm({ ...activityForm, filing_reference: event.target.value })} />
                      </label>
                      <label>
                        Completed on
                        <input type="date" value={activityForm.completed_on} disabled={!editable || working} onChange={(event) => setActivityForm({ ...activityForm, completed_on: event.target.value })} />
                      </label>
                      <label>
                        Amount
                        <input type="number" value={activityForm.amount} disabled={!editable || working} onChange={(event) => setActivityForm({ ...activityForm, amount: event.target.value })} />
                      </label>
                      <label className="wide">
                        Remarks
                        <textarea value={activityForm.remarks} disabled={!editable || working} onChange={(event) => setActivityForm({ ...activityForm, remarks: event.target.value })} />
                      </label>
                      <button disabled={!editable || working}>Save draft</button>
                    </form>
                  </section>
                  <section className="dialog-section wide">
                    <h3><ShieldCheck size={16} /> Workflow action</h3>
                    <textarea placeholder="Decision comment or not-applicable reason" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} />
                    <div className="dialog-action-row">
                      {editable && <button disabled={working} type="button" onClick={() => act(() => morax.submit(detail.id), "Submitted for review")}>Submit for review</button>}
                      {detail.status === "SUBMITTED" && checker && <button disabled={working} type="button" onClick={() => act(() => morax.review(detail.id, { comment: decisionNote || "Review started", row_version: detail.row_version }), "Review started")}>Begin review</button>}
                      {detail.status === "UNDER_REVIEW" && checker && (
                        <>
                          <button disabled={working} type="button" onClick={() => act(() => morax.approve(detail.id, { comment: decisionNote || "Approved", row_version: detail.row_version }), "Approved")}>Approve</button>
                          <button className="button-secondary" disabled={working} type="button" onClick={() => act(() => morax.correction(detail.id, { comment: decisionNote || "Correction required", row_version: detail.row_version }), "Returned for correction")}>Request correction</button>
                          <button className="danger" disabled={working} type="button" onClick={() => act(() => morax.reject(detail.id, { comment: decisionNote || "Rejected", row_version: detail.row_version }), "Rejected")}>Reject</button>
                        </>
                      )}
                      {manager && editable && <button className="danger" disabled={working} type="button" onClick={() => decisionNote.trim() ? act(() => morax.notApplicable(detail.id, decisionNote.trim()), "Marked not applicable") : setNotice("Enter a reason before marking not applicable")}>Not applicable</button>}
                    </div>
                    <p className="muted">Required evidence must be uploaded and verified before final approval where configured.</p>
                  </section>
                </div>
              )}

              {activeTab === "documents" && (
                <div className="dialog-section-grid">
                  <section className="dialog-section wide">
                    <h3><FileUp size={16} /> Required documents / evidence</h3>
                    <p>{detail.required_document || "No required evidence is configured for this compliance."}</p>
                    <div className="dialog-form-grid compact evidence-upload-grid">
                      <label>
                        Category
                        <input value={category} disabled={!editable || working} onChange={(event) => setCategory(event.target.value)} />
                      </label>
                      <label>
                        File
                        <input type="file" disabled={!editable || working} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                      </label>
                      <button className="button-secondary" disabled={!file || !editable || working} type="button" onClick={() => file && act(() => morax.evidence(detail.id, file, category), "Evidence uploaded")}>Upload evidence</button>
                    </div>
                  </section>
                  <section className="dialog-section wide">
                    <h3>Uploaded documents</h3>
                    {detail.evidence?.length ? (
                      <div className="evidence-list">
                        {detail.evidence.map((evidence) => (
                          <article className="evidence-card" key={evidence.id}>
                            <div>
                              <b>{evidence.original_filename}</b>
                              <small>v{evidence.version} - {humanize(evidence.category)} - {humanize(evidence.verification_state ?? "PENDING")}</small>
                              {evidence.verification_reason && <small>Reason: {evidence.verification_reason}</small>}
                            </div>
                            <div className="dialog-action-row">
                              <button className="button-secondary" type="button" onClick={() => morax.downloadDocument(evidence.id, evidence.original_filename).catch((error) => setNotice(requestMessage(error)))}>
                                <Download size={15} />
                                Download
                              </button>
                              {checker && evidence.verification_state !== "VERIFIED" && (
                                <>
                                  <input aria-label="Evidence rejection reason" placeholder="Reason if rejecting" value={verifyReason} onChange={(event) => setVerifyReason(event.target.value)} />
                                  <button disabled={working} type="button" onClick={() => verifyEvidence(evidence, "VERIFIED")}>Verify</button>
                                  <button className="danger" disabled={working} type="button" onClick={() => verifyEvidence(evidence, "REJECTED")}>Reject</button>
                                </>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No uploaded documents" description="Evidence uploaded for this compliance will appear here." icon={FileText} />
                    )}
                  </section>
                </div>
              )}

              {activeTab === "history" && (
                <div className="dialog-section-grid">
                  <section className="dialog-section wide">
                    <h3><MessageSquare size={16} /> Comments</h3>
                    <div className="dialog-form-grid compact comment-form">
                      <label className="wide">
                        Add comment
                        <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
                      </label>
                      <button disabled={!comment.trim() || working} type="button" onClick={() => act(async () => { await morax.comment(detail.id, comment.trim()); setComment(""); }, "Comment added")}>Post comment</button>
                    </div>
                    {detail.comments?.length ? (
                      <div className="dialog-timeline">
                        {detail.comments.map((entry) => (
                          <article key={entry.id}>
                            <b>{people.find((person) => person.id === entry.author_id)?.name ?? "User"}</b>
                            <p>{entry.body}</p>
                            <small>{new Date(entry.created_at).toLocaleString()}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No comments yet.</p>
                    )}
                  </section>
                  <section className="dialog-section wide">
                    <h3><History size={16} /> Compliance history / activity</h3>
                    {detail.history?.length ? (
                      <div className="dialog-timeline">
                        {detail.history.map((entry) => (
                          <article key={entry.id}>
                            <b>{humanize(entry.action)}</b>
                            {entry.to_status && <span>{humanize(entry.from_status || "")} {"->"} {humanize(entry.to_status)}</span>}
                            {entry.comment && <p>{entry.comment}</p>}
                            <small>{new Date(entry.created_at).toLocaleString()}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No workflow activity" description="Status changes and review decisions will appear here." icon={History} />
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        )}
        <div className="dialog-footer">
          <button className="button-secondary" type="button" onClick={onClose}>Close</button>
          <Link className="button-primary" to={detailPath} onClick={onClose}>
            Full details page
            <ExternalLink size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function GroupedRecurringWorklist() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<Instance>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<WorklistFilters & { document_type: string; subject_id: string }>({
    q: "", status: "", risk_level: "", entity_type: "", subject_id: "", frequency: "", due_window: "THIS_MONTH", document_type: "",
  });
  const debouncedSearch = useDebouncedValue(filters.q.trim());
  const entityQueries = useQuery({
    queryKey: ["recurring-compliance-filter-entities"],
    queryFn: async () => {
      const [units, contractors, sites] = await Promise.all([
        morax.units(),
        morax.contractors(),
        morax.sites(),
      ]);
      return { units: units.items, contractors, sites };
    },
    staleTime: 60_000,
  });
  const entityOptions = useMemo<EntityOption[]>(() => {
    const rows: EntityOption[] = [];
    const push = (items: Record<string, unknown>[] = [], type: string) => {
      items.forEach((item) => rows.push({
        id: String(item.id),
        name: String(item.name ?? item.legal_name ?? "Unnamed entity"),
        type,
        helper: String(item.city ?? item.address ?? ""),
      }));
    };
    push(entityQueries.data?.units, "UNIT");
    push(entityQueries.data?.contractors, "CONTRACTOR");
    push(entityQueries.data?.sites, "CONTRACTOR_SITE");
    return rows
      .filter((item) => !filters.entity_type || item.type === filters.entity_type)
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [entityQueries.data, filters.entity_type]);
  const queryFilters = useMemo(() => {
    const values: Record<string, string> = { page: String(page), page_size: "20" };
    if (debouncedSearch) values.q = debouncedSearch;
    if (filters.status) values.status = filters.status;
    if (filters.risk_level) values.risk_level = filters.risk_level;
    if (filters.entity_type) values.entity_type = filters.entity_type;
    if (filters.subject_id) values.subject_id = filters.subject_id;
    if (filters.frequency) values.frequency = filters.frequency;
    if (filters.document_type) values.document_type = filters.document_type;
    if (filters.due_window === "THIS_MONTH") {
      const current = new Date();
      values.date_from = toDateInput(new Date(current.getFullYear(), current.getMonth(), 1));
      values.date_to = toDateInput(new Date(current.getFullYear(), current.getMonth() + 1, 0));
    }
    if (filters.due_window === "NEXT_7" || filters.due_window === "NEXT_30") {
      values.date_from = toDateInput(new Date());
      values.date_to = filters.due_window === "NEXT_7" ? dateAfter(7) : dateAfter(30);
    }
    return values;
  }, [debouncedSearch, filters, page]);
  const grouped = useQuery({
    queryKey: ["grouped-recurring-compliances", queryFilters],
    queryFn: () => morax.groupedInstances(queryFilters),
    staleTime: 20_000,
  });
  const data = grouped.data;
  const summary = data?.status_counts ?? {
    total: 0,
    due: 0,
    overdue: 0,
    completed: 0,
    completed_late: 0,
    rejected: 0,
    pending_approval: 0,
    compliance_rate: 0,
  };
  const totalPages = Math.max(1, Math.ceil((data?.total_rules ?? 0) / (data?.page_size ?? 20)));
  const selectedEntity = entityOptions.find((item) => item.id === filters.subject_id);
  const activeFilters = [
    filters.status && ["Status", humanize(filters.status)],
    filters.risk_level && ["Risk", humanize(filters.risk_level)],
    filters.entity_type && ["Entity type", humanize(filters.entity_type)],
    filters.subject_id && ["Entity", selectedEntity?.name ?? "Selected entity"],
    filters.frequency && ["Frequency", humanize(filters.frequency)],
    filters.due_window && ["Date range", recurringDateWindows.find(([value]) => value === filters.due_window)?.[1] ?? "Selected range"],
    filters.document_type && ["Document type", documentTypeLabels[filters.document_type]],
    filters.q && ["Search", filters.q],
  ].filter(Boolean) as [string, string][];
  const updateFilter = <K extends keyof typeof filters>(field: K, value: (typeof filters)[K]) => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "entity_type" ? { subject_id: "" } : {}),
    }));
  };
  const clearFilters = () => {
    setPage(1);
    setFilters({ q: "", status: "", risk_level: "", entity_type: "", subject_id: "", frequency: "", due_window: "", document_type: "" });
  };
  const removeFilter = (label: string) => {
    const fields: Record<string, keyof typeof filters> = {
      Status: "status", Risk: "risk_level", "Entity type": "entity_type", Entity: "subject_id", Frequency: "frequency",
      "Date range": "due_window", "Document type": "document_type", Search: "q",
    };
    updateFilter(fields[label], "");
  };
  const toggleGroup = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(data?.groups.map((group) => group.id) ?? []));

  return (
    <div className="modern-page grouped-compliance-page">
      <WorkspacePageHeader
        title="Compliances — Grouped by Rule"
        description="Recurring obligations grouped by their configured Act, regulation, or rule."
        actions={<button className="button-secondary" type="button" onClick={() => grouped.refetch()} disabled={grouped.isFetching}><RefreshCw size={16} className={grouped.isFetching ? "spin" : ""} />Refresh</button>}
      />
      <InlineError message={grouped.error instanceof Error ? grouped.error.message : ""} />

      <DashboardSection title="Filters" description="Results update automatically as filters change." className="filter-section" action={activeFilters.length ? <button className="text-button" type="button" onClick={clearFilters}><X size={15} />Clear all</button> : undefined}>
        <div className="filter-grid grouped-filter-grid">
          <label className="search-control"><span>Search</span><Search size={16} aria-hidden="true" /><input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search rule, compliance, or entity" /></label>
          <label>Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option>{statusOptions.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Risk level<select value={filters.risk_level} onChange={(event) => updateFilter("risk_level", event.target.value)}><option value="">All risk levels</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Entity type<select value={filters.entity_type} onChange={(event) => updateFilter("entity_type", event.target.value)}><option value="">All entities</option>{["UNIT", "CONTRACTOR", "CONTRACTOR_SITE"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Frequency<select value={filters.frequency} onChange={(event) => updateFilter("frequency", event.target.value)}><option value="">All recurring frequencies</option>{recurringFrequencies.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Due date<select value={filters.due_window} onChange={(event) => updateFilter("due_window", event.target.value)}><option value="">All due dates</option><option value="NEXT_7">Next 7 days</option><option value="NEXT_30">Next 30 days</option></select></label>
        </div>
        {activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters">{activeFilters.map(([label, value]) => <FilterChip key={label} label={`${label}: ${value}`} onRemove={() => removeFilter(label)} />)}</div>}
      </DashboardSection>

      <DashboardSection title="Compliances — Grouped by Rule" description={data ? `${data.total_compliances} compliance${data.total_compliances === 1 ? "" : "s"} across ${data.total_rules} applicable rule${data.total_rules === 1 ? "" : "s"}` : "Loading applicable rules"} className="grouped-compliance-section" action={<div className="group-actions"><button className="button-secondary compact-action" type="button" onClick={expandAll} disabled={!data?.groups.length}><ChevronDown size={15} />Expand all</button><button className="button-secondary compact-action" type="button" onClick={() => setExpanded(new Set())} disabled={!expanded.size}><ChevronDown size={15} className="collapse-icon" />Collapse all</button></div>}>
        <div className="document-type-tabs" aria-label="Filter by document type">
          <button className={`document-type-tab ${!filters.document_type ? "active" : ""}`} type="button" onClick={() => updateFilter("document_type", "")}>All <span>{data?.document_type_counts.reduce((total, item) => total + item.count, 0) ?? 0}</span></button>
          {documentTypeOrder.map((type) => {
            const count = data?.document_type_counts.find((item) => item.document_type === type)?.count ?? 0;
            return <button className={`document-type-tab ${filters.document_type === type ? "active" : ""}`} type="button" onClick={() => updateFilter("document_type", type)} key={type}>{documentTypeLabels[type]} <span>{count}</span></button>;
          })}
        </div>
        {grouped.isLoading ? <LoadingSkeleton rows={7} /> : data?.groups.length ? <div className="rule-group-list">{data.groups.map((group) => {
          const isExpanded = expanded.has(group.id);
          return <article className={`rule-group ${isExpanded ? "expanded" : ""}`} key={group.id}>
            <button className="rule-group-header" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={isExpanded}>
              <span className="rule-group-title"><span className="rule-group-icon"><Layers3 size={18} /></span><span>{group.name}</span><span className="rule-count">{group.compliance_count} compliance{group.compliance_count === 1 ? "" : "s"}</span></span>
              <span className="rule-group-meta"><span className={group.due_count ? "rule-due-count" : "rule-due-count clear"}>{group.due_count} due</span><ChevronDown size={19} className={isExpanded ? "chevron-up" : ""} /></span>
            </button>
            {isExpanded && <div className="modern-table-wrap rule-records-table"><table className="modern-table"><thead><tr><th>Entity</th><th>Compliance type</th><th>Document type</th><th>Form no.</th><th>Frequency / period</th><th>Due date</th><th>Risk</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{group.records.map((item) => <tr key={item.id}><td><b>{item.subject_name}</b><small>{humanize(item.subject_type)}</small></td><td><b>{item.compliance_name}</b><small>{item.compliance_id}</small></td><td>{documentTypeLabels[item.document_type ?? ""] ?? humanize(item.document_type ?? "PROCEDURAL")}</td><td>{item.form_number || "—"}</td><td>{humanize(item.frequency)}<small>{item.period_key}</small></td><td><span className={item.is_overdue ? "table-due overdue" : "table-due"}>{formatDate(item.due_date)}<small>{item.is_overdue ? `${item.days_overdue}d overdue` : dueSoon(item) ? "Due soon" : ""}</small></span></td><td><span className={`risk-label ${item.risk_level.toLowerCase()}`}>{humanize(item.risk_level)}</span></td><td><ComplianceStatusBadge status={item.display_status ?? item.status} /></td><td><button className="icon-action" type="button" onClick={() => setSelected(item)} aria-label={`Open ${item.compliance_name}`}><Eye size={16} /></button></td></tr>)}</tbody></table></div>}
          </article>;
        })}{totalPages > 1 && <div className="pagination-row"><span>Showing rule groups {(page - 1) * (data.page_size ?? 20) + 1}–{Math.min(page * (data.page_size ?? 20), data.total_rules)} of {data.total_rules}</span><div><button className="icon-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous rule groups"><ChevronLeft size={17} /></button><span>Page {page} of {totalPages}</span><button className="icon-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Next rule groups"><ChevronRight size={17} /></button></div></div>}</div> : <EmptyState title="No recurring compliance records match" description="Try removing a filter or generate applicable obligations from the Compliance Master." icon={FileText} />}
      </DashboardSection>
      <ComplianceActionDialog item={selected} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={() => grouped.refetch()} />
    </div>
  );
}

function EnterpriseRecurringWorklist() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<Instance>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<WorklistFilters & { document_type: string; subject_id: string }>({
    q: "", status: "", risk_level: "", entity_type: "", subject_id: "", frequency: "", due_window: "THIS_MONTH", document_type: "",
  });
  const debouncedSearch = useDebouncedValue(filters.q.trim());
  const entities = useQuery({
    queryKey: ["recurring-compliance-filter-entities"],
    queryFn: async () => {
      const [units, contractors, sites] = await Promise.all([morax.units(), morax.contractors(), morax.sites()]);
      return { units: units.items, contractors, sites };
    },
    staleTime: 60_000,
  });
  const entityOptions = useMemo<EntityOption[]>(() => {
    const rows: EntityOption[] = [];
    const push = (items: Record<string, unknown>[] = [], type: string) => {
      items.forEach((item) => rows.push({
        id: String(item.id),
        name: String(item.name ?? item.legal_name ?? "Unnamed entity"),
        type,
        helper: String(item.city ?? item.address ?? ""),
      }));
    };
    push(entities.data?.units, "UNIT");
    push(entities.data?.contractors, "CONTRACTOR");
    push(entities.data?.sites, "CONTRACTOR_SITE");
    return rows.filter((item) => !filters.entity_type || item.type === filters.entity_type).sort((left, right) => left.name.localeCompare(right.name));
  }, [entities.data, filters.entity_type]);
  const queryFilters = useMemo(() => {
    const values: Record<string, string> = { page: String(page), page_size: "20" };
    if (debouncedSearch) values.q = debouncedSearch;
    if (filters.status) values.status = filters.status;
    if (filters.risk_level) values.risk_level = filters.risk_level;
    if (filters.entity_type) values.entity_type = filters.entity_type;
    if (filters.subject_id) values.subject_id = filters.subject_id;
    if (filters.frequency) values.frequency = filters.frequency;
    if (filters.document_type) values.document_type = filters.document_type;
    if (filters.due_window === "THIS_MONTH") {
      const current = new Date();
      values.date_from = toDateInput(new Date(current.getFullYear(), current.getMonth(), 1));
      values.date_to = toDateInput(new Date(current.getFullYear(), current.getMonth() + 1, 0));
    }
    if (filters.due_window === "NEXT_7" || filters.due_window === "NEXT_30") {
      values.date_from = toDateInput(new Date());
      values.date_to = filters.due_window === "NEXT_7" ? dateAfter(7) : dateAfter(30);
    }
    return values;
  }, [debouncedSearch, filters, page]);
  const grouped = useQuery({
    queryKey: ["enterprise-recurring-compliances", queryFilters],
    queryFn: () => morax.groupedInstances(queryFilters),
    staleTime: 20_000,
  });
  const data = grouped.data;
  const summary = data?.status_counts ?? { total: 0, due: 0, overdue: 0, completed: 0, completed_late: 0, rejected: 0, pending_approval: 0, compliance_rate: 0 };
  const totalPages = Math.max(1, Math.ceil((data?.total_rules ?? 0) / (data?.page_size ?? 20)));
  const selectedEntity = entityOptions.find((item) => item.id === filters.subject_id);
  const activeFilters = [
    filters.status && ["Status", displayStatusLabel(filters.status)],
    filters.risk_level && ["Risk", humanize(filters.risk_level)],
    filters.entity_type && ["Entity type", humanize(filters.entity_type)],
    filters.subject_id && ["Entity", selectedEntity?.name ?? "Selected entity"],
    filters.frequency && ["Frequency", humanize(filters.frequency)],
    filters.due_window && ["Date range", recurringDateWindows.find(([value]) => value === filters.due_window)?.[1] ?? "Selected range"],
    filters.document_type && ["Document type", documentTypeLabels[filters.document_type]],
    filters.q && ["Search", filters.q],
  ].filter(Boolean) as [string, string][];
  const updateFilter = <K extends keyof typeof filters>(field: K, value: (typeof filters)[K]) => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "entity_type" ? { subject_id: "" } : {}),
    }));
  };
  const clearFilters = () => {
    setPage(1);
    setFilters({ q: "", status: "", risk_level: "", entity_type: "", subject_id: "", frequency: "", due_window: "", document_type: "" });
  };
  const removeFilter = (label: string) => {
    const fields: Record<string, keyof typeof filters> = {
      Status: "status", Risk: "risk_level", "Entity type": "entity_type", Entity: "subject_id", Frequency: "frequency",
      "Date range": "due_window", "Document type": "document_type", Search: "q",
    };
    updateFilter(fields[label], "");
  };
  const toggleGroup = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(data?.groups.map((group) => group.id) ?? []));

  return (
    <div className="modern-page grouped-compliance-page recurring-compliance-page">
      <WorkspacePageHeader
        eyebrow="COMPLIANCE MONITORING"
        title="Recurring Compliance"
        description="Track. Manage. Stay Compliant."
        actions={<button className="button-secondary" type="button" onClick={() => grouped.refetch()} disabled={grouped.isFetching}><RefreshCw size={16} className={grouped.isFetching ? "spin" : ""} />Refresh</button>}
      />
      <InlineError message={grouped.error instanceof Error ? grouped.error.message : ""} />

      <section className="recurring-kpi-grid" aria-label="Recurring compliance health">
        <ComplianceKpiCard label="Due" value={summary.due} helper="Open and not overdue" tone="due" icon={FileText} />
        <ComplianceKpiCard label="Overdue" value={summary.overdue} helper="Past due date" tone="overdue" icon={AlertTriangle} />
        <ComplianceKpiCard label="Completed" value={summary.completed} helper="Approved on time" tone="completed" icon={CheckCircle2} />
        <ComplianceKpiCard label="Completed Late" value={summary.completed_late} helper="Approved after due date" tone="late" icon={CalendarClock} />
        <ComplianceKpiCard label="Rejected" value={summary.rejected} helper="Rejected by checker" tone="rejected" icon={X} />
        <ComplianceKpiCard label="Pending Approval" value={summary.pending_approval} helper="Submitted or in review" tone="approval" icon={ShieldCheck} />
        <ComplianceKpiCard label="Compliance Rate" value={`${summary.compliance_rate}%`} helper={`${summary.total} matching records`} tone="rate" icon={CheckCircle2} />
      </section>

      <DashboardSection title="Filters" className="filter-section recurring-filter-section" action={activeFilters.length ? <button className="button-secondary compact-action" type="button" onClick={clearFilters}><RefreshCw size={15} />Clear filters</button> : undefined}>
        <div className="filter-grid grouped-filter-grid recurring-filter-grid">
          <label className="search-control"><span>Search compliances...</span><Search size={16} aria-hidden="true" /><input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search compliances..." /></label>
          <label>Entity Type<select value={filters.entity_type} onChange={(event) => updateFilter("entity_type", event.target.value)}><option value="">All</option>{["UNIT", "CONTRACTOR", "CONTRACTOR_SITE"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Entity<select value={filters.subject_id} onChange={(event) => updateFilter("subject_id", event.target.value)} disabled={entities.isLoading}><option value="">All Entities</option>{entityOptions.map((item) => <option value={item.id} key={`${item.type}-${item.id}`}>{item.name}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All</option>{Object.entries(recurringStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Risk Level<select value={filters.risk_level} onChange={(event) => updateFilter("risk_level", event.target.value)}><option value="">All</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Frequency<select value={filters.frequency} onChange={(event) => updateFilter("frequency", event.target.value)}><option value="">All</option>{recurringFrequencies.map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Date Range<select value={filters.due_window} onChange={(event) => updateFilter("due_window", event.target.value)}>{recurringDateWindows.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        {activeFilters.length > 0 && <div className="active-filters" aria-label="Active filters">{activeFilters.map(([label, value]) => <FilterChip key={label} label={`${label}: ${value}`} onRemove={() => removeFilter(label)} />)}</div>}
      </DashboardSection>

      <DashboardSection title="Compliances - Grouped by Rule" description={data ? `${data.total_compliances} compliance${data.total_compliances === 1 ? "" : "s"} across ${data.total_rules} rule${data.total_rules === 1 ? "" : "s"}` : "Loading applicable rules"} className="grouped-compliance-section recurring-grouped-section" action={<div className="group-actions"><button className="button-secondary compact-action" type="button" onClick={expandAll} disabled={!data?.groups.length}><ChevronDown size={15} />Expand all</button><button className="button-secondary compact-action" type="button" onClick={() => setExpanded(new Set())} disabled={!expanded.size}><ChevronDown size={15} className="collapse-icon" />Collapse all</button></div>}>
        <div className="document-type-tabs" aria-label="Filter by document type">
          <button className={`document-type-tab ${!filters.document_type ? "active" : ""}`} type="button" onClick={() => updateFilter("document_type", "")}>All <span>({data?.document_type_counts.reduce((total, item) => total + item.count, 0) ?? 0})</span></button>
          {documentTypeOrder.map((type) => {
            const count = data?.document_type_counts.find((item) => item.document_type === type)?.count ?? 0;
            return <button className={`document-type-tab ${filters.document_type === type ? "active" : ""}`} type="button" onClick={() => updateFilter("document_type", type)} key={type}>{documentTypeLabels[type]} <span>({count})</span></button>;
          })}
        </div>
        {grouped.isLoading ? <LoadingSkeleton rows={7} /> : data?.groups.length ? <div className="rule-group-list">{data.groups.map((group) => {
          const isExpanded = expanded.has(group.id);
          return <RecurringRuleGroup group={group} expanded={isExpanded} onToggle={() => toggleGroup(group.id)} onOpen={setSelected} key={group.id} />;
        })}{totalPages > 1 && <div className="pagination-row"><span>Showing rule groups {(page - 1) * (data.page_size ?? 20) + 1}-{Math.min(page * (data.page_size ?? 20), data.total_rules)} of {data.total_rules}</span><div><button className="icon-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous rule groups"><ChevronLeft size={17} /></button><span>Page {page} of {totalPages}</span><button className="icon-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Next rule groups"><ChevronRight size={17} /></button></div></div>}</div> : <EmptyState title="No recurring compliance records match" description="Try removing a filter or generate applicable obligations from the Compliance Master." icon={FileText} />}
      </DashboardSection>
      <ComplianceActionDialog item={selected} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={() => grouped.refetch()} />
    </div>
  );
}

export function ModernWorklist() {
  const { kind } = useParams();
  return kind === "recurring" ? <EnterpriseRecurringWorklist /> : <OneTimeWorklist />;
}

function OneTimeWorklist() {
  const { kind, organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const isOneTime = kind === "one-time";
  const [items, setItems] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<Instance>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<WorklistFilters>({
    q: "",
    status: "",
    risk_level: "",
    entity_type: "",
    frequency: "",
    due_window: "",
  });
  const [sort, setSort] = useState<"due_date" | "status" | "risk_level">("due_date");
  const [sortAscending, setSortAscending] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError("");
    const dateFrom =
      filters.due_window === "NEXT_7" || filters.due_window === "NEXT_30"
        ? toDateInput(new Date())
        : "";
    const dateTo =
      filters.due_window === "NEXT_7"
        ? dateAfter(7)
        : filters.due_window === "NEXT_30"
          ? dateAfter(30)
          : "";
    try {
      const result = await morax.instances({
        q: filters.q,
        status: filters.status,
        risk_level: filters.risk_level,
        entity_type: filters.entity_type,
        date_from: dateFrom,
        date_to: dateTo,
        page_size: "100",
      });
      setItems(result.items);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load compliance obligations.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delay = filters.q ? 350 : 0;
    const timer = window.setTimeout(load, delay);
    return () => window.clearTimeout(timer);
  }, [
    kind,
    filters.q,
    filters.status,
    filters.risk_level,
    filters.entity_type,
    filters.frequency,
    filters.due_window,
  ]);

  const visibleItems = useMemo(() => {
    const scoped = items
      .filter((item) => (isOneTime ? !isRecurring(item) : isRecurring(item)))
      .filter(
        (item) => !filters.frequency || item.frequency === filters.frequency,
      );
    return [...scoped].sort((left, right) => {
      const a =
        sort === "status"
          ? left.display_status ?? left.status
          : sort === "risk_level"
            ? left.risk_level
            : left.due_date;
      const b =
        sort === "status"
          ? right.display_status ?? right.status
          : sort === "risk_level"
            ? right.risk_level
            : right.due_date;
      return String(a).localeCompare(String(b)) * (sortAscending ? 1 : -1);
    });
  }, [items, isOneTime, filters.frequency, sort, sortAscending]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const completed = visibleItems.filter((item) => item.status === "APPROVED").length;
  const overdue = visibleItems.filter((item) => item.is_overdue).length;
  const dueSoonCount = visibleItems.filter(dueSoon).length;
  const open = visibleItems.filter(
    (item) => item.status !== "APPROVED" && item.status !== "NOT_APPLICABLE",
  ).length;
  const activeFilters = [
    filters.status && ["Status", humanize(filters.status)],
    filters.risk_level && ["Risk", humanize(filters.risk_level)],
    filters.entity_type && ["Entity type", humanize(filters.entity_type)],
    filters.frequency && ["Frequency", humanize(filters.frequency)],
    filters.due_window && [
      "Due date",
      filters.due_window === "NEXT_7" ? "Next 7 days" : "Next 30 days",
    ],
    filters.q && ["Search", filters.q],
  ].filter(Boolean) as [string, string][];
  const frequencies = isOneTime ? ["ONE_TIME"] : recurringFrequencies;

  const updateFilter = <K extends keyof WorklistFilters>(
    field: K,
    value: WorklistFilters[K],
  ) => {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  };
  const clearFilters = () => {
    setPage(1);
    setFilters({
      q: "",
      status: "",
      risk_level: "",
      entity_type: "",
      frequency: "",
      due_window: "",
    });
  };
  const toggleSort = (field: "due_date" | "status" | "risk_level") => {
    setPage(1);
    if (field === sort) setSortAscending((current) => !current);
    else {
      setSort(field);
      setSortAscending(true);
    }
  };

  return (
    <div className="modern-page worklist-page">
      <WorkspacePageHeader
        title={isOneTime ? "One-time compliance" : "Recurring compliance"}
        description={
          isOneTime
            ? "Track one-time statutory obligations and their workflow status."
            : "Prioritize recurring compliance actions, deadlines, and evidence."
        }
        actions={
          <button className="button-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
        }
      />
      <InlineError message={error} />

      <section className="worklist-summary" aria-label="Worklist overview">
        <DashboardMetricCard label="Total" value={visibleItems.length} helper="Matching obligations" />
        <DashboardMetricCard label="Completed" value={completed} helper="Approved obligations" tone="success" />
        <DashboardMetricCard label="Open" value={open} helper="Requires workflow action" tone="warning" />
        <DashboardMetricCard label="Overdue" value={overdue} helper="Past due date" tone="critical" />
        <DashboardMetricCard label="Due soon" value={dueSoonCount} helper="Due in 7 days" tone="warning" />
      </section>

      <DashboardSection
        title="Filters"
        description="Results update automatically as you change a filter."
        className="filter-section"
        action={
          activeFilters.length ? (
            <button className="text-button" type="button" onClick={clearFilters}>
              <X size={15} />
              Clear all
            </button>
          ) : undefined
        }
      >
        <div className="filter-grid">
          <label className="search-control">
            <span>Search</span>
            <Search size={16} aria-hidden="true" />
            <input
              value={filters.q}
              onChange={(event) => updateFilter("q", event.target.value)}
              placeholder="Compliance or entity"
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="">All statuses</option>
              {statusOptions.map((value) => (
                <option value={value} key={value}>{humanize(value)}</option>
              ))}
            </select>
          </label>
          <label>
            Risk level
            <select
              value={filters.risk_level}
              onChange={(event) => updateFilter("risk_level", event.target.value)}
            >
              <option value="">All risk levels</option>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
                <option value={value} key={value}>{humanize(value)}</option>
              ))}
            </select>
          </label>
          <label>
            Entity type
            <select
              value={filters.entity_type}
              onChange={(event) => updateFilter("entity_type", event.target.value)}
            >
              <option value="">All entities</option>
              {["UNIT", "CONTRACTOR", "CONTRACTOR_SITE"].map((value) => (
                <option value={value} key={value}>{humanize(value)}</option>
              ))}
            </select>
          </label>
          {!isOneTime && (
            <label>
              Frequency
              <select
                value={filters.frequency}
                onChange={(event) => updateFilter("frequency", event.target.value)}
              >
                <option value="">All recurring frequencies</option>
                {frequencies.map((value) => (
                  <option value={value} key={value}>{humanize(value)}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Due date
            <select
              value={filters.due_window}
              onChange={(event) => updateFilter("due_window", event.target.value)}
            >
              <option value="">All due dates</option>
              <option value="NEXT_7">Next 7 days</option>
              <option value="NEXT_30">Next 30 days</option>
            </select>
          </label>
        </div>
        {activeFilters.length > 0 && (
          <div className="active-filters" aria-label="Active filters">
            {activeFilters.map(([label, value]) => (
              <FilterChip
                key={label}
                label={`${label}: ${value}`}
                onRemove={() =>
                  updateFilter(
                    label === "Status"
                      ? "status"
                      : label === "Risk"
                        ? "risk_level"
                        : label === "Entity type"
                          ? "entity_type"
                          : label === "Frequency"
                            ? "frequency"
                            : label === "Due date"
                              ? "due_window"
                              : "q",
                    "",
                  )
                }
              />
            ))}
          </div>
        )}
      </DashboardSection>

      <DashboardSection
        title={isOneTime ? "One-time obligations" : "Recurring action items"}
        description={`${visibleItems.length} matching obligation${visibleItems.length === 1 ? "" : "s"}`}
        className="worklist-table-section"
        action={
          <span className="table-heading-icon">
            <Filter size={16} />
            Live results
          </span>
        }
      >
        {loading ? (
          <LoadingSkeleton rows={8} />
        ) : pagedItems.length ? (
          <>
            <div className="modern-table-wrap">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Compliance</th>
                    <th>Entity</th>
                    <th>Frequency</th>
                    <th>
                      <button className="table-sort" onClick={() => toggleSort("due_date")}>
                        Due date <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th>
                      <button className="table-sort" onClick={() => toggleSort("risk_level")}>
                        Risk <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th>
                      <button className="table-sort" onClick={() => toggleSort("status")}>
                        Status <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="compliance-name">
                          <span className="table-icon"><ClipboardCheck size={17} /></span>
                          <div>
                            <b>{item.compliance_name}</b>
                            <small>{item.compliance_id}</small>
                            {item.required_document && <small>Evidence: {item.required_document}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <b>{item.subject_name}</b>
                        <small>{humanize(item.subject_type)}</small>
                      </td>
                      <td>{humanize(item.frequency)}</td>
                      <td>
                        <span className={item.is_overdue ? "table-due overdue" : "table-due"}>
                          {formatDate(item.due_date)}
                          <small>{item.is_overdue ? `${item.days_overdue}d overdue` : dueSoon(item) ? "Due soon" : ""}</small>
                        </span>
                      </td>
                      <td><span className={`risk-label ${item.risk_level.toLowerCase()}`}>{humanize(item.risk_level)}</span></td>
                      <td><ComplianceStatusBadge status={item.display_status ?? item.status} /></td>
                      <td>
                        <button className="table-action" type="button" onClick={() => setSelected(item)}>
                          <Eye size={16} />
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-row">
              <span>
                Showing {Math.min((currentPage - 1) * pageSize + 1, visibleItems.length)}–{Math.min(currentPage * pageSize, visibleItems.length)} of {visibleItems.length}
              </span>
              <div>
                <button className="icon-button" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous page">
                  <ChevronLeft size={17} />
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button className="icon-button" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} aria-label="Next page">
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            title="No matching compliance actions"
            description="Try removing a filter or generate obligations from the Compliance Master."
            icon={FileText}
          />
        )}
      </DashboardSection>

      <ComplianceActionDialog
        item={selected}
        onClose={() => setSelected(undefined)}
        detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""}
        onUpdated={load}
      />
    </div>
  );
}

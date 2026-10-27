import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Eye,
  FileText,
  FileUp,
  Filter,
  History,
  Layers3,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Upload,
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

import { animate, useMotionValue, useTransform, motion } from "framer-motion";
import { SpecularCard } from "./specular-card";

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
  "DAILY",
  "WEEKLY",
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
  "UPCOMING",
  "DUE_SOON",
  "DUE_TODAY",
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
                <Link className="text-link" to={`${base}/compliances/company`}>
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
      ["ORGANIZATION_ADMIN", "UNIT_ADMIN"].includes(role),
    ));

const canCheckCompliance = (user?: User) =>
  !!user &&
  (user.platform_role === "MORAX_ADMIN" ||
    user.roles.some((role) =>
      [
        "ORGANIZATION_ADMIN",
        "UNIT_ADMIN",
        "UNIT_CHECKER",
      ].includes(role),
    ));

const canSubmitCompliance = (user?: User) =>
  !!user &&
  (user.platform_role === "MORAX_ADMIN" ||
    user.roles.some((role) =>
      ["ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER"].includes(role),
    ));

const isEditableCompliance = (item: Instance) =>
  !["APPROVED", "SUBMITTED", "UNDER_REVIEW", "NOT_APPLICABLE"].includes(item.status);

const detailText = (value: unknown, fallback = "Not provided") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const snapshotText = (item: Instance, key: string, fallback = "Not provided") =>
  detailText(item[key as keyof Instance] ?? item.rule_snapshot?.[key], fallback);

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
  UPCOMING: "Upcoming",
  DUE_SOON: "Due Soon",
  DUE_TODAY: "Due Today",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
  COMPLETED_LATE: "Completed Late",
  SUBMITTED: "Awaiting Approval",
  UNDER_REVIEW: "Under Review",
  REJECTED: "Rejected",
  NOT_APPLICABLE: "Not Applicable",
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
  onClick,
  active = false,
}: {
  label: string;
  value: number | string;
  helper?: string;
  tone: "due" | "overdue" | "completed" | "late" | "rejected" | "approval" | "rate";
  icon: ComponentType<{ size?: number }>;
  onClick?: () => void;
  active?: boolean;
}) {
  const isString = typeof value === "string";
  const numValue = isString ? parseFloat(value.replace(/[^0-9.]/g, "")) : (value as number);
  const suffix = isString ? value.replace(/[0-9.]/g, "") : "";

  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);

  useEffect(() => {
    if (!isNaN(numValue)) {
      const animation = animate(count, numValue, { duration: 1.5, ease: "easeOut" });
      return animation.stop;
    }
  }, [numValue, count]);

  const content = <SpecularCard
    className={active ? "metric-specular-card is-active" : "metric-specular-card"}
    tint={active ? "#F0F6EE" : undefined}
    baseColor={active ? "#8DAF86" : undefined}
    lineColor={active ? "#B9D0B7" : undefined}
    textColor={active ? "#234332" : undefined}
    style={{ display: "flex", gap: "1rem", alignItems: "center", padding: "1.1rem" }}
  >
    <span className="compliance-kpi-icon" aria-hidden="true">
      <Icon size={21} />
    </span>
    <div>
      <strong>
        {!isNaN(numValue) ? <motion.span>{rounded}</motion.span> : value}
        {!isNaN(numValue) && suffix}
      </strong>
      <span className="compliance-kpi-label">{label}</span>
      {helper && <small>{helper}</small>}
    </div>
  </SpecularCard>;
  return onClick ? (
    <button type="button" className={`compliance-kpi-card interactive ${tone} ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active} aria-label={`${label}: ${value}. ${active ? "Clear" : "Apply"} table filter`} title={active ? "Clear this metric filter" : `Show ${label.toLowerCase()} records`}>
      {content}
    </button>
  ) : <article className={`compliance-kpi-card ${tone}`} style={{ padding: 0, border: "none" }}>{content}</article>;
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
  onView,
  onSubmit,
  onReview,
  canSubmit,
  canReview,
}: {
  group: GroupedCompliance;
  expanded: boolean;
  onToggle: () => void;
  onView: (item: Instance) => void;
  onSubmit: (item: Instance) => void;
  onReview: (item: Instance) => void;
  canSubmit: boolean;
  canReview: boolean;
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
                    <div className="compliance-table-actions">
                    <button className="icon-action open-compliance-action" type="button" onClick={() => onView(item)} aria-label={`View ${item.compliance_name}`} title="View compliance details">
                      <Eye size={16} />
                    </button>
                    {canSubmit && isEditableCompliance(item) && <button className="icon-action submit-compliance-action" type="button" onClick={() => onSubmit(item)} aria-label={`Upload and submit ${item.compliance_name}`} title="Upload documents and submit">
                      <Upload size={16} />
                    </button>}
                    {canReview && ["SUBMITTED", "UNDER_REVIEW"].includes(item.status) && <button className="icon-action review-compliance-action" type="button" onClick={() => onReview(item)} aria-label={`Review ${item.compliance_name}`} title="Review compliance submission">
                      <ClipboardCheck size={16} />
                    </button>}
                    </div>
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

type ComplianceDialogMode = "workflow" | "view" | "submit" | "review";

function ComplianceActionDialog({
  item,
  onClose,
  detailPath,
  onUpdated,
  mode = "workflow",
}: {
  item: Instance | undefined;
  onClose: () => void;
  detailPath: string;
  onUpdated?: () => void | Promise<unknown>;
  mode?: ComplianceDialogMode;
}) {
  // Retained in the component contract so existing callers do not need route
  // changes; the direct dialog is now the complete review path.
  void detailPath;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState("SUPPORTING_DOCUMENT");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const [verifyReason, setVerifyReason] = useState("");
  const [assignment, setAssignment] = useState({ maker: "", checker: "" });
  const [activityForm, setActivityForm] = useState({
    filing_reference: "",
    completed_on: "",
    amount: "",
    remarks: "",
  });
  const [submissionForm, setSubmissionForm] = useState({
    filing_reference: "",
    completed_on: toDateInput(new Date()),
    remarks: "",
  });
  const [working, setWorking] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const hydratedDetailId = useRef<string | null>(null);

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
    setNotice("");
    setDecisionNote("");
    setComment("");
    setFiles([]);
    setUploadProgress("");
    setVerifyReason("");
    setCategory("SUPPORTING_DOCUMENT");
    setSummaryExpanded(false);
    setSubmissionForm({ filing_reference: "", completed_on: toDateInput(new Date()), remarks: "" });
    hydratedDetailId.current = null;
  }, [item?.id]);

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail || hydratedDetailId.current === detail.id) return;
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
    setSubmissionForm({
      filing_reference: detail.activity_reference ?? "",
      completed_on: detail.completed_on ?? toDateInput(new Date()),
      remarks: detail.remarks ?? "",
    });
    hydratedDetailId.current = detail.id;
  }, [detailQuery.data]);

  if (!item) return null;

  const detail = detailQuery.data ?? item;
  const user = userQuery.data;
  const people = peopleQuery.data ?? [];
  const editable = isEditableCompliance(detail);
  const manager = canManageCompliance(user);
  const checker = canCheckCompliance(user);
  const activeAssignments = detail.assignments ?? [];
  const latestReviewNote = [...(detail.history ?? [])]
    .reverse()
    .find((entry) => ["REJECT", "REQUEST_CORRECTION"].includes(entry.action) && entry.comment?.trim());
  const latestSubmission = [...(detail.history ?? [])]
    .reverse()
    .find((entry) => entry.action === "SUBMIT");
  const assignedName = (type: "MAKER" | "CHECKER") =>
    people.find(
      (person) =>
        person.id ===
        activeAssignments.find((assignmentItem) => assignmentItem.assignment_type === type)?.user_id,
    )?.name ?? "Not assigned";
  const submittedBy = latestSubmission?.actor_id
    ? people.find((person) => person.id === latestSubmission.actor_id)?.name ?? "Assigned Maker"
    : assignedName("MAKER");
  const documentType =
    documentTypeLabels[detail.document_type ?? ""] ?? humanize(detail.document_type ?? "PROCEDURAL");
  const actionSummary = detail.required_document
    ? `Prepare and upload: ${detail.required_document}`
    : detail.description || detail.legal_description || "Review the requirement and record the compliance activity.";
  const description = snapshotText(detail, "description", "");
  const instructions = snapshotText(detail, "legal_description", "");
  const consequence = snapshotText(detail, "consequence_or_penalty", "");
  // Compliance Master keeps the short Rule Description and the fuller legal
  // Section text separately.  Preserve both in the Eye popup instead of
  // duplicating Legal Description in two places.
  const ruleDescription = description;
  const summaryText = description || instructions || actionSummary;
  const subjectContext = detail.subject_context;
  const contextFacts = [
    { label: "Unit", value: subjectContext?.unit_name || (detail.subject_type === "UNIT" ? detail.subject_name : "") },
    { label: "Contractor", value: subjectContext?.contractor_name || (detail.subject_type === "CONTRACTOR" ? detail.subject_name : "") },
    { label: "Site", value: subjectContext?.site_name || (detail.subject_type === "CONTRACTOR_SITE" ? detail.subject_name : "") },
    { label: "State", value: subjectContext?.state_name || "" },
    { label: "Period", value: detail.period_key },
  ].filter((field) => field.value);
  const hasSubmission = Boolean(latestSubmission || detail.submitted_at || detail.activity_reference || detail.evidence?.length);
  const assignedMaker = assignedName("MAKER");
  const assignedChecker = assignedName("CHECKER");
  const hasAssignments = assignedMaker !== "Not assigned" || assignedChecker !== "Not assigned";

  const refreshDetail = async () => {
    await Promise.all([
      detailQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] }),
      queryClient.invalidateQueries({ queryKey: ["grouped-compliance"] }),
    ]);
    await onUpdated?.();
  };

  const act = async (call: () => Promise<unknown>, success: string) => {
    // The centralized API client owns success toasts; retain the parameter for
    // existing action call sites while avoiding a duplicate inline message.
    void success;
    setWorking(true);
    setNotice("");
    try {
      await call();
      await refreshDetail();
      return true;
    } catch (error) {
      setNotice(requestMessage(error, "Action failed"));
      return false;
    } finally {
      setWorking(false);
    }
  };

  const submitCompliance = async () => {
    if (!editable) {
      setNotice("This compliance is not available for Maker submission in its current status.");
      return;
    }
    if (!submissionForm.filing_reference.trim()) {
      setNotice("Enter the filing or return reference before submitting this compliance.");
      return;
    }
    if (detail.required_document && !detail.evidence?.length && !files.length) {
      setNotice("Upload at least one supporting document before submitting this compliance.");
      return;
    }
    if (!submissionForm.completed_on) {
      setNotice("Enter the completion date before submitting this compliance.");
      return;
    }
    if (submissionForm.completed_on > toDateInput(new Date())) {
      setNotice("Completion date cannot be in the future.");
      return;
    }
    setWorking(true);
    setNotice("");
    try {
      setUploadProgress("Saving submission details...");
      const savedActivity = await morax.activity(detail.id, {
        filing_reference: submissionForm.filing_reference.trim(),
        completed_on: submissionForm.completed_on,
        amount: detail.amount ?? null,
        remarks: submissionForm.remarks || null,
        row_version: detail.row_version,
      });
      for (let index = 0; index < files.length; index += 1) {
        setUploadProgress(`Uploading document ${index + 1} of ${files.length}...`);
        await morax.evidence(detail.id, files[index], category);
      }
      setUploadProgress("Submitting compliance for Checker review...");
      await morax.submit(detail.id, savedActivity.row_version);
      setFiles([]);
      setUploadProgress("");
      await refreshDetail();
      onClose();
    } catch (error) {
      setUploadProgress("");
      setNotice(requestMessage(error, "Could not upload and submit compliance."));
    } finally {
      setWorking(false);
    }
  };

  const addSubmissionFiles = (selectedFiles: File[]) => {
    setFiles((currentFiles) => [
      ...currentFiles,
      ...selectedFiles.filter(
        (selectedFile) =>
          !currentFiles.some(
            (currentFile) =>
              currentFile.name === selectedFile.name &&
              currentFile.size === selectedFile.size &&
              currentFile.lastModified === selectedFile.lastModified,
          ),
      ),
    ]);
  };

  const removeSubmissionFile = (fileIndex: number) => {
    setFiles((currentFiles) => currentFiles.filter((_, index) => index !== fileIndex));
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

  const decideSubmittedCompliance = async (target: "APPROVED" | "REJECTED") => {
    if (target === "REJECTED" && !decisionNote.trim()) {
      setNotice("Enter rejection remarks before rejecting this compliance.");
      return;
    }
    const comment = decisionNote.trim() || "Approved";
    const completed = await act(async () => {
      // The backend keeps BEGIN_REVIEW in the audit trail, while the Checker
      // gets one direct decision from the submitted-document popup.
      const reviewing = detail.status === "SUBMITTED"
        ? await morax.review(detail.id, { comment: "Review started", row_version: detail.row_version })
        : detail;
      return target === "APPROVED"
        ? morax.approve(detail.id, { comment, row_version: reviewing.row_version })
        : morax.reject(detail.id, { comment, row_version: reviewing.row_version });
    }, target === "APPROVED" ? "Approved" : "Rejected");
    if (completed) onClose();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        className={`compliance-dialog compliance-detail-dialog ${mode === "submit" || mode === "review" ? "compliance-submit-dialog" : mode === "view" ? "compliance-view-dialog" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compliance-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header compliance-dialog-hero">
          {mode === "submit" || mode === "review" || mode === "view" ? <div className="submit-dialog-title">{mode === "submit" ? <FileUp size={18} /> : mode === "review" ? <ClipboardCheck size={18} /> : <Eye size={18} />}<h2 id="compliance-dialog-title">{mode === "view" ? "Compliance details" : mode === "submit" ? "Submit" : "Review"}{mode === "view" ? ` — ${detail.compliance_name}` : ` ${detail.compliance_name}`}</h2></div> : <div>
            <p className="eyebrow">COMPLIANCE DETAILS</p>
            <h2 id="compliance-dialog-title">{detail.compliance_name}</h2>
            <p>
              {[detail.act, detail.rule_reference || detail.section].filter(Boolean).join(" / ") ||
                detail.compliance_id}
            </p>
          </div>}
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        {mode === "workflow" && <><div className="dialog-status-row compliance-hero-meta">
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
        </>}
        <InlineError message={detailQuery.error instanceof Error ? detailQuery.error.message : ""} />
        <InlineError message={notice && !notice.startsWith("Success:") ? notice : ""} />
        {notice.startsWith("Success:") && <p className="alert success">{notice}</p>}
        {detailQuery.isLoading ? (
          <div className="dialog-loading-state">
            <LoadingSkeleton rows={6} />
          </div>
        ) : (
          <>
            <div className="compliance-dialog-body">
              {mode === "view" ? (
                <div className="view-compliance-window">
                  <section className="submit-rule-summary view-rule-summary">
                    <h3>{detail.compliance_name}</h3>
                    {detail.compliance_id && <small className="view-compliance-id">{detail.compliance_id}</small>}
                    <div className="submit-status-chips">
                      <ComplianceStatusBadge status={detail.display_status ?? detail.status} />
                      <span className={`risk-label ${detail.risk_level.toLowerCase()}`}>{humanize(detail.risk_level)}</span>
                      <span className="dialog-pill">{humanize(detail.frequency)}</span>
                      {detail.compliance_type && <span className="view-compliance-type-pill">{detail.compliance_type}</span>}
                    </div>
                    {summaryText && <p className={summaryExpanded ? "view-summary-expanded" : ""}>{summaryText}</p>}
                    {summaryText.length > 180 && <button className="view-show-more" type="button" onClick={() => setSummaryExpanded((current) => !current)}>{summaryExpanded ? "Show less" : "Show more"}</button>}
                  </section>
                  <section className="view-compliance-facts" aria-label="Compliance facts">
                    <div className="view-fact-row context-row">
                      {contextFacts.map((fact) => <div key={fact.label}><span>{fact.label}</span><b>{fact.value}</b></div>)}
                    </div>
                    <div className="view-fact-row legal-row">
                      <div><span>Due date</span><b className={detail.is_overdue ? "overdue-text" : ""}>{formatDate(detail.due_date)}</b></div>
                      {detail.form_number && <div><span>Form</span><b>{detail.form_number}</b></div>}
                      {documentType && <div><span>Document type</span><b>{documentType}</b></div>}
                      {detail.act && <div className="fact-wide"><span>Act</span><b>{detail.act}</b></div>}
                    </div>
                    {(detail.section || instructions) && <div className="view-section-copy"><span>Section</span>{detail.section && <b>{detail.section}</b>}{instructions && <p>{instructions}</p>}</div>}
                    {detail.rule_reference && <div className="view-rule-reference"><span>Rule / legal reference</span><b>{detail.rule_reference}</b></div>}
                    {hasAssignments && <div className="view-assignment-row"><span>Assigned to</span>{assignedMaker !== "Not assigned" && <b>Maker: {assignedMaker}</b>}{assignedChecker !== "Not assigned" && <b>Checker: {assignedChecker}</b>}</div>}
                  </section>
                  {detail.required_document && <details className="view-accordion" open><summary><ClipboardList size={14} /> Required action &amp; instructions</summary><p>{detail.required_document}</p></details>}
                  {hasSubmission && <details className="view-accordion view-submission-accordion" open>
                    <summary><FileUp size={14} /> Submission &amp; review</summary>
                    <div className="view-submission-content">
                      <p><b>{submittedBy}</b>{detail.submitted_at ? ` submitted ${new Date(detail.submitted_at).toLocaleString()}` : " submitted this compliance."}</p>
                      {detail.activity_reference && <p>Filing / return reference: <b>{detail.activity_reference}</b></p>}
                      {detail.remarks && <p>Maker remarks: {detail.remarks}</p>}
                      {detail.evidence?.length ? <div className="view-evidence-links">{detail.evidence.map((evidence) => <button className="button-link" type="button" key={evidence.id} onClick={() => morax.downloadDocument(evidence.id, evidence.original_filename).catch((error) => setNotice(requestMessage(error)))}><Download size={14} />Download {(detail.evidence?.length ?? 0) === 1 ? "evidence" : evidence.original_filename}</button>)}</div> : <p className="muted">No supporting documents were attached.</p>}
                    </div>
                  </details>}
                  {(detail.rule_reference || ruleDescription) && <details className="view-accordion"><summary><FileText size={14} /> Rule description</summary>{detail.rule_reference && <b className="view-rule-description-reference">{detail.rule_reference}</b>}{ruleDescription && <p>{ruleDescription}</p>}</details>}
                  {consequence && <details className="view-accordion consequence"><summary><AlertTriangle size={14} /> Consequences of non-compliance</summary><p>{consequence}</p></details>}
                </div>
              ) : mode === "workflow" && (
                <div className="dialog-section-grid">
                  <section className="dialog-section wide">
                    <h3>Requirement</h3>
                    <dl className="dialog-detail-grid">
                      <div><dt>Compliance ID</dt><dd>{detail.compliance_id}</dd></div>
                      <div><dt>Act / Rule</dt><dd>{[detail.act, detail.rule_reference].filter(Boolean).join(" / ") || "Not provided"}</dd></div>
                      <div><dt>Compliance type</dt><dd>{detailText(detail.compliance_type)}</dd></div>
                      <div><dt>{detail.subject_type === "CONTRACTOR" ? "Contractor details" : "Organization unit / site"}</dt><dd>{detail.subject_name}<small>{humanize(detail.subject_type)}</small></dd></div>
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
                  <section className="dialog-section wide">
                    <h3><FileText size={16} /> Submitted evidence</h3>
                    {detail.evidence?.length ? <div className="evidence-list compact-evidence-list">{detail.evidence.map((evidence) => <article className="evidence-card" key={evidence.id}><div><b>{evidence.original_filename}</b><small>{humanize(evidence.category)}{evidence.size_bytes ? ` · ${Math.ceil(evidence.size_bytes / 1024)} KB` : ""}</small></div><div className="dialog-action-row">{/\.(pdf|png|jpe?g)$/i.test(evidence.original_filename) && <button className="button-secondary" type="button" onClick={() => morax.previewDocument(evidence.id).catch((error) => setNotice(requestMessage(error)))}><Eye size={15} />Preview</button>}<button className="button-secondary" type="button" onClick={() => morax.downloadDocument(evidence.id, evidence.original_filename).catch((error) => setNotice(requestMessage(error)))}><Download size={15} />Download</button></div></article>)}</div> : <p className="muted">No supporting documents have been submitted.</p>}
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

              {mode === "workflow" && (
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
                      {editable && <button disabled={working} type="button" onClick={() => act(() => morax.submit(detail.id, detail.row_version), "Submitted for review")}>SUBMIT COMPLIANCE</button>}
                      {detail.status === "SUBMITTED" && checker && <button disabled={working} type="button" onClick={() => act(() => morax.review(detail.id, { comment: decisionNote || "Review started", row_version: detail.row_version }), "Review started")}>Begin review</button>}
                      {detail.status === "UNDER_REVIEW" && checker && (
                        <>
                          <button disabled={working} type="button" onClick={() => act(() => morax.approve(detail.id, { comment: decisionNote || "Approved", row_version: detail.row_version }), "Approved")}>Approve</button>
                          <button className="button-secondary" disabled={working} type="button" onClick={() => decisionNote.trim() ? act(() => morax.correction(detail.id, { comment: decisionNote.trim(), row_version: detail.row_version }), "Returned for correction") : setNotice("Enter remarks before returning this compliance for correction.")}>Request correction</button>
                          <button className="danger" disabled={working} type="button" onClick={() => decisionNote.trim() ? act(() => morax.reject(detail.id, { comment: decisionNote.trim(), row_version: detail.row_version }), "Rejected") : setNotice("Enter rejection remarks before rejecting this compliance.")}>Reject</button>
                        </>
                      )}
                      {manager && editable && <button className="danger" disabled={working} type="button" onClick={() => decisionNote.trim() ? act(() => morax.notApplicable(detail.id, decisionNote.trim()), "Marked not applicable") : setNotice("Enter a reason before marking not applicable")}>Not applicable</button>}
                    </div>
                    <p className="muted">Required evidence must be uploaded and verified before final approval where configured.</p>
                  </section>
                </div>
              )}

              {mode === "review" ? (
                <div className="submit-compliance-window">
                  <section className="submit-rule-summary">
                    <h3>{detail.compliance_name}</h3>
                    <div className="submit-status-chips">
                      <ComplianceStatusBadge status={detail.display_status ?? detail.status} />
                      <span className={`risk-label ${detail.risk_level.toLowerCase()}`}>{humanize(detail.risk_level)}</span>
                      <span className="dialog-pill">{humanize(detail.frequency)}</span>
                    </div>
                    <p>{detail.description || detail.legal_description || "Review the submitted obligation and supporting evidence."}</p>
                  </section>
                  <section className="submit-fact-grid" aria-label="Compliance review details">
                    <div><span>Unit</span><b>{detail.subject_name}</b></div>
                    <div><span>Period</span><b>{detail.period_key}</b></div>
                    <div><span>Due date</span><b className={detail.is_overdue ? "overdue-text" : ""}>{formatDate(detail.due_date)}</b></div>
                    <div><span>Form</span><b>{detail.form_number || "Not specified"}</b></div>
                  </section>
                  <section className="submit-legal-card">
                    <span>Act</span><b>{detail.act || "Not provided"}</b>
                    <span>Section / Rule</span><b>{detail.rule_reference || detail.section || "Not provided"}</b>
                    <p>{snapshotText(detail, "legal_description")}</p>
                  </section>
                  <section className="dialog-section submit-compliance-section review-submission-section">
                    <div className="submit-section-heading"><h3><FileUp size={16} /> Maker submission</h3><small>{detail.submitted_at ? `Submitted ${new Date(detail.submitted_at).toLocaleString()}` : "Submission date not available"}</small></div>
                    <dl className="review-submission-grid">
                      <div><dt>Submitted by</dt><dd>{submittedBy}</dd></div>
                      <div><dt>Current status</dt><dd><ComplianceStatusBadge status={detail.status} /></dd></div>
                      <div><dt>Filing / return reference</dt><dd>{detail.activity_reference || "Not provided"}</dd></div>
                      <div><dt>Completion date</dt><dd>{formatDate(detail.completed_on || undefined)}</dd></div>
                      <div className="wide"><dt>Maker remarks</dt><dd>{detail.remarks || "No remarks provided."}</dd></div>
                    </dl>
                  </section>
                  <section className="dialog-section submit-compliance-section">
                    <div className="submit-section-heading"><h3><FileText size={16} /> Submitted evidence</h3><small>{detail.evidence?.length ?? 0} document{detail.evidence?.length === 1 ? "" : "s"}</small></div>
                    {detail.evidence?.length ? (
                      <div className="evidence-list compact-evidence-list">
                        {detail.evidence.map((evidence) => (
                          <article className="evidence-card" key={evidence.id}>
                            <div><b>{evidence.original_filename}</b><small>{humanize(evidence.category)} · {humanize(evidence.verification_state ?? "PENDING")}</small>{evidence.verification_reason && <small>Reason: {evidence.verification_reason}</small>}</div>
                            <div className="dialog-action-row">
                              {/\.(pdf|png|jpe?g)$/i.test(evidence.original_filename) && <button className="button-secondary" type="button" onClick={() => morax.previewDocument(evidence.id).catch((error) => setNotice(requestMessage(error)))}><Eye size={15} />Preview</button>}
                              <button className="button-secondary" type="button" onClick={() => morax.downloadDocument(evidence.id, evidence.original_filename).catch((error) => setNotice(requestMessage(error)))}><Download size={15} />Download</button>
                              {checker && evidence.verification_state !== "VERIFIED" && <button disabled={working} type="button" onClick={() => verifyEvidence(evidence, "VERIFIED")}>Verify</button>}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : <EmptyState title="No uploaded documents" description="No supporting evidence was submitted with this compliance." icon={FileText} />}
                  </section>
                  <section className="dialog-section submit-compliance-section review-decision-section">
                    <div className="submit-section-heading"><h3><ClipboardCheck size={16} /> Checker decision</h3><small>Approve, or reject with mandatory remarks.</small></div>
                    <label className="review-remarks-label">Rejection remarks <span className="field-required">*</span><textarea rows={2} value={decisionNote} disabled={working} placeholder="Required only when rejecting this submission" onChange={(event) => setDecisionNote(event.target.value)} /></label>
                  </section>
                </div>
              ) : mode === "submit" ? (
                <div className="submit-compliance-window">
                  {latestReviewNote && (
                    <aside className="submission-review-note" role="note">
                      <b>{latestReviewNote.action === "REJECT" ? "Checker rejection remarks" : "Checker correction remarks"}</b>
                      <p>{latestReviewNote.comment}</p>
                    </aside>
                  )}
                  <section className="submit-rule-summary">
                    <h3>{detail.compliance_name}</h3>
                    <div className="submit-status-chips">
                      <ComplianceStatusBadge status={detail.display_status ?? detail.status} />
                      <span className={`risk-label ${detail.risk_level.toLowerCase()}`}>{humanize(detail.risk_level)}</span>
                      <span className="dialog-pill">{humanize(detail.frequency)}</span>
                    </div>
                    <p>{detail.description || detail.legal_description || "Complete the required obligation and attach supporting evidence."}</p>
                  </section>
                  <section className="submit-fact-grid" aria-label="Compliance submission details">
                    <div><span>Unit</span><b>{detail.subject_name}</b></div>
                    <div><span>Period</span><b>{detail.period_key}</b></div>
                    <div><span>Due date</span><b className={detail.is_overdue ? "overdue-text" : ""}>{formatDate(detail.due_date)}</b></div>
                    <div><span>Form</span><b>{detail.form_number || "Not specified"}</b></div>
                  </section>
                  <section className="submit-legal-card">
                    <span>Act</span><b>{detail.act || "Not provided"}</b>
                    <span>Section / Rule</span><b>{detail.rule_reference || detail.section || "Not provided"}</b>
                    <p>{snapshotText(detail, "legal_description")}</p>
                  </section>
                  <details className="submit-consequence-card">
                    <summary><AlertTriangle size={14} /> Consequences of non-compliance</summary>
                    <p>{snapshotText(detail, "consequence_or_penalty", "No consequence is configured for this compliance.")}</p>
                  </details>
                  <section className="dialog-section submit-compliance-section">
                    <div className="submit-section-heading"><h3><FileUp size={16} /> Submission</h3><small>Submission date: {formatDate(toDateInput(new Date()))}</small></div>
                    <div className="dialog-form-grid compact evidence-upload-grid">
                      <label>
                        <span className="input-label">Filing / return reference <span className="field-required">*</span></span>
                        <input value={submissionForm.filing_reference} maxLength={120} placeholder="Enter filing or return reference" disabled={working} onChange={(event) => setSubmissionForm({ ...submissionForm, filing_reference: event.target.value })} required />
                        <small>Reference used for this compliance submission.</small>
                      </label>
                      <label>
                        <span className="input-label">Completion date <span className="field-required">*</span></span>
                        <input type="date" max={toDateInput(new Date())} value={submissionForm.completed_on} disabled={working} onChange={(event) => setSubmissionForm({ ...submissionForm, completed_on: event.target.value })} required />
                        <small>Today or an earlier date.</small>
                      </label>
                      <label className="wide">
                        <span className="input-label">Evidence documents {detail.required_document ? <span className="field-required">*</span> : null}</span>
                        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.doc,.docx,.zip" disabled={working} onChange={(event) => addSubmissionFiles(Array.from(event.target.files ?? []))} />
                        <small>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected. You can select more files to add them.` : "PDF, images, Excel, CSV, Word, or ZIP."}</small>
                      </label>
                      <label className="wide">
                        Submission remarks
                        <textarea rows={2} placeholder="Add any relevant notes or comments..." value={submissionForm.remarks} disabled={working} onChange={(event) => setSubmissionForm({ ...submissionForm, remarks: event.target.value })} />
                      </label>
                    </div>
                    {files.length ? (
                      <div className="submission-file-list" aria-label="Selected evidence documents">
                        {files.map((file, index) => (
                          <span key={`${file.name}-${file.lastModified}-${file.size}`}>
                            {file.name}
                            <button type="button" disabled={working} onClick={() => removeSubmissionFile(index)} aria-label={`Remove ${file.name}`}>
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {detail.required_document && <p className="required-document-note"><b>Required evidence:</b> {detail.required_document}</p>}
                    {uploadProgress && <p className="upload-progress" role="status">{uploadProgress}</p>}
                    {detail.evidence?.length ? <p className="muted">{detail.evidence.length} document{detail.evidence.length === 1 ? "" : "s"} already uploaded.</p> : null}
                  </section>
                </div>
              ) : mode === "workflow" ? (
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
                        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.doc,.docx,.zip" disabled={!editable || working} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                      </label>
                      <button className="button-secondary" disabled={!files.length || !editable || working} type="button" onClick={() => act(() => Promise.all(files.map((file) => morax.evidence(detail.id, file, category))), `${files.length} document(s) uploaded`)}>Upload documents</button>
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
              ) : null}

              {mode === "workflow" && (
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
          <button className="button-secondary" type="button" onClick={onClose}>{mode === "submit" ? "Cancel" : "Close"}</button>
          {mode === "submit" ? <button className="button-primary" disabled={working || !editable} type="button" onClick={submitCompliance}>
            <Upload size={16} /> {working ? "Submitting..." : "Submit Compliance"}
          </button> : mode === "review" && ["SUBMITTED", "UNDER_REVIEW"].includes(detail.status) ? <div className="dialog-action-row review-action-row"><button className="danger" disabled={working} type="button" onClick={() => decideSubmittedCompliance("REJECTED")}>Reject</button><button className="button-primary" disabled={working} type="button" onClick={() => decideSubmittedCompliance("APPROVED")}>{working ? "Saving..." : "Approve"}</button></div> : null}
        </div>
      </section>
    </div>
  );
}

function GroupedRecurringWorklist() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<Instance>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("view");
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: () => morax.me(), staleTime: 60_000 });
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
    upcoming: 0,
    due_soon: 0,
    due_today: 0,
    overdue: 0,
    completed: 0,
    completed_late: 0,
    not_applicable: 0,
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
            {isExpanded && <div className="modern-table-wrap rule-records-table"><table className="modern-table"><thead><tr><th>Entity</th><th>Compliance type</th><th>Document type</th><th>Form no.</th><th>Frequency / period</th><th>Due date</th><th>Risk</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{group.records.map((item) => <tr key={item.id}><td><b>{item.subject_name}</b><small>{humanize(item.subject_type)}</small></td><td><b>{item.compliance_name}</b><small>{item.compliance_id}</small></td><td>{documentTypeLabels[item.document_type ?? ""] ?? humanize(item.document_type ?? "PROCEDURAL")}</td><td>{item.form_number || "—"}</td><td>{humanize(item.frequency)}<small>{item.period_key}</small></td><td><span className={item.is_overdue ? "table-due overdue" : "table-due"}>{formatDate(item.due_date)}<small>{item.is_overdue ? `${item.days_overdue}d overdue` : dueSoon(item) ? "Due soon" : ""}</small></span></td><td><span className={`risk-label ${item.risk_level.toLowerCase()}`}>{humanize(item.risk_level)}</span></td><td><ComplianceStatusBadge status={item.display_status ?? item.status} /></td><td><div className="compliance-table-actions"><button className="icon-action" type="button" onClick={() => { setDialogMode("view"); setSelected(item); }} aria-label={`View ${item.compliance_name}`} title="View compliance details"><Eye size={16} /></button>{canSubmitCompliance(currentUser.data) && isEditableCompliance(item) && <button className="icon-action submit-compliance-action" type="button" onClick={() => { setDialogMode("submit"); setSelected(item); }} aria-label={`Upload and submit ${item.compliance_name}`} title="Upload documents and submit"><Upload size={16} /></button>}</div></td></tr>)}</tbody></table></div>}
          </article>;
        })}{totalPages > 1 && <div className="pagination-row"><span>Showing rule groups {(page - 1) * (data.page_size ?? 20) + 1}–{Math.min(page * (data.page_size ?? 20), data.total_rules)} of {data.total_rules}</span><div><button className="icon-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous rule groups"><ChevronLeft size={17} /></button><span>Page {page} of {totalPages}</span><button className="icon-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Next rule groups"><ChevronRight size={17} /></button></div></div>}</div> : <EmptyState title="No recurring compliance records match" description="Try removing a filter or generate applicable obligations from the Compliance Master." icon={FileText} />}
      </DashboardSection>
      <ComplianceActionDialog item={selected} mode={dialogMode} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={() => grouped.refetch()} />
    </div>
  );
}

function EnterpriseRecurringWorklist({ complianceArea }: { complianceArea?: "COMPANY" | "CONTRACTOR" }) {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<Instance>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("workflow");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<WorklistFilters & { document_type: string; subject_id: string }>({
    q: "", status: "", risk_level: "", entity_type: "", subject_id: "", frequency: "", due_window: "THIS_MONTH", document_type: "",
  });
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: () => morax.me(), staleTime: 60_000 });
  const pendingApprovals = useQuery({
    queryKey: ["my-pending-approvals"],
    queryFn: () => morax.myPendingApprovals(),
    enabled: canCheckCompliance(currentUser.data),
    staleTime: 15_000,
  });
  const debouncedSearch = useDebouncedValue(filters.q.trim());
  const entities = useQuery({
    queryKey: ["recurring-compliance-filter-entities", complianceArea],
    queryFn: async () => {
      if (complianceArea === "CONTRACTOR") {
        const contractors = await morax.contractors();
        return { units: [], contractors, sites: [] };
      }
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
    if (complianceArea) values.compliance_area = complianceArea;
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
  }, [complianceArea, debouncedSearch, filters, page]);
  const grouped = useQuery({
    queryKey: ["enterprise-recurring-compliances", queryFilters],
    queryFn: () => morax.groupedInstances(queryFilters),
    staleTime: 20_000,
  });
  const data = grouped.data;
  const summary = data?.status_counts ?? { total: 0, due: 0, upcoming: 0, due_soon: 0, due_today: 0, overdue: 0, completed: 0, completed_late: 0, not_applicable: 0, rejected: 0, pending_approval: 0, compliance_rate: 0 };
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
  const toggleMetricStatus = (status: string) => updateFilter("status", filters.status === status ? "" : status);
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
        title={complianceArea === "COMPANY" ? "Company Compliance" : complianceArea === "CONTRACTOR" ? "Contractor Compliance" : "Recurring Compliance"}
        description={complianceArea === "COMPANY" ? "Manage the company’s own labour-law obligations and filings." : complianceArea === "CONTRACTOR" ? "Manage contractor submissions, documents, and Principal Employer approvals." : "Track. Manage. Stay Compliant."}
        actions={<button className="button-secondary" type="button" onClick={() => grouped.refetch()} disabled={grouped.isFetching}><RefreshCw size={16} className={grouped.isFetching ? "spin" : ""} />Refresh</button>}
      />
      {complianceArea === "CONTRACTOR" && currentUser.data?.contractor_context?.active_contractor_name && (
        <p className="contractor-compliance-scope">
          Contractor: <strong>{currentUser.data.contractor_context.active_contractor_name}</strong>
        </p>
      )}
      {pendingApprovals.data && (
        <DashboardSection title="Pending My Approval" description="Submitted compliances assigned to you as Principal Employer Checker." className="pending-approval-section">
          {pendingApprovals.data.items.length ? (
            <div className="evidence-list">
              {pendingApprovals.data.items.map((item) => (
                <article className="evidence-card" key={item.id}>
                  <div><b>{item.compliance_name}</b><small>{item.subject_name} · {item.period_key} · submitted for approval</small></div>
                  <div className="compliance-table-actions">
                    <button className="icon-action" type="button" onClick={() => { setDialogMode("view"); setSelected(item); }} aria-label={`View ${item.compliance_name}`} title="View compliance details"><Eye size={16} /></button>
                    <button className="icon-action review-compliance-action" type="button" onClick={() => { setDialogMode("review"); setSelected(item); }} aria-label={`Review ${item.compliance_name}`} title="Review compliance submission"><ClipboardCheck size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="muted">No compliance is awaiting your approval.</p>}
        </DashboardSection>
      )}
      <InlineError message={grouped.error instanceof Error ? grouped.error.message : ""} />

      <section className="recurring-kpi-grid" aria-label="Recurring compliance health">
        <ComplianceKpiCard label="Upcoming" value={summary.upcoming} helper="More than 7 days remaining" tone="due" icon={FileText} onClick={() => toggleMetricStatus("UPCOMING")} active={filters.status === "UPCOMING"} />
        <ComplianceKpiCard label="Due Soon" value={summary.due_soon} helper="Due within 7 days" tone="due" icon={CalendarClock} onClick={() => toggleMetricStatus("DUE_SOON")} active={filters.status === "DUE_SOON"} />
        <ComplianceKpiCard label="Due Today" value={summary.due_today} helper="Deadline is today" tone="late" icon={AlertTriangle} onClick={() => toggleMetricStatus("DUE_TODAY")} active={filters.status === "DUE_TODAY"} />
        <ComplianceKpiCard label="Overdue" value={summary.overdue} helper="Past due date" tone="overdue" icon={AlertTriangle} onClick={() => toggleMetricStatus("OVERDUE")} active={filters.status === "OVERDUE"} />
        <ComplianceKpiCard label="Completed" value={summary.completed} helper="Approved on time" tone="completed" icon={CheckCircle2} onClick={() => toggleMetricStatus("COMPLETED")} active={filters.status === "COMPLETED"} />
        <ComplianceKpiCard label="Completed Late" value={summary.completed_late} helper="Approved after due date" tone="late" icon={CalendarClock} onClick={() => toggleMetricStatus("COMPLETED_LATE")} active={filters.status === "COMPLETED_LATE"} />
        <ComplianceKpiCard label="Not Applicable" value={summary.not_applicable} helper="Excluded with a recorded reason" tone="due" icon={FileText} onClick={() => toggleMetricStatus("NOT_APPLICABLE")} active={filters.status === "NOT_APPLICABLE"} />
        <ComplianceKpiCard label="Rejected" value={summary.rejected} helper="Rejected by checker" tone="rejected" icon={X} onClick={() => toggleMetricStatus("REJECTED")} active={filters.status === "REJECTED"} />
        <ComplianceKpiCard label="Pending Approval" value={summary.pending_approval} helper="Submitted or in review" tone="approval" icon={ShieldCheck} onClick={() => toggleMetricStatus("PENDING_APPROVAL")} active={filters.status === "PENDING_APPROVAL"} />
        <ComplianceKpiCard label="Total matching" value={summary.total} helper="Clear the metric filter" tone="rate" icon={CheckCircle2} onClick={() => toggleMetricStatus("")} active={!filters.status} />
      </section>

      <DashboardSection title="Filters" className="filter-section recurring-filter-section" action={activeFilters.length ? <button className="button-secondary compact-action" type="button" onClick={clearFilters}><RefreshCw size={15} />Clear filters</button> : undefined}>
        <div className="filter-grid grouped-filter-grid recurring-filter-grid">
          <label className="search-control"><span>Search compliances...</span><Search size={16} aria-hidden="true" /><input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search compliances..." /></label>
          <label>Entity Type<select value={filters.entity_type} onChange={(event) => updateFilter("entity_type", event.target.value)}><option value="">All</option>{["UNIT", "CONTRACTOR", "CONTRACTOR_SITE"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
          <label>Entity<select value={filters.subject_id} onChange={(event) => updateFilter("subject_id", event.target.value)} disabled={entities.isLoading}><option value="">All Entities</option>{entityOptions.map((item) => <option value={item.id} key={`${item.type}-${item.id}`}>{item.name}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All</option><option value="PENDING_ACTION">Pending action</option><option value="PENDING_APPROVAL">Pending approval</option>{Object.entries(recurringStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
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
          return <RecurringRuleGroup group={group} expanded={isExpanded} onToggle={() => toggleGroup(group.id)} onView={(item) => { setDialogMode("view"); setSelected(item); }} onSubmit={(item) => { setDialogMode("submit"); setSelected(item); }} onReview={(item) => { setDialogMode("review"); setSelected(item); }} canSubmit={canSubmitCompliance(currentUser.data)} canReview={canCheckCompliance(currentUser.data)} key={group.id} />;
        })}{totalPages > 1 && <div className="pagination-row"><span>Showing rule groups {(page - 1) * (data.page_size ?? 20) + 1}-{Math.min(page * (data.page_size ?? 20), data.total_rules)} of {data.total_rules}</span><div><button className="icon-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous rule groups"><ChevronLeft size={17} /></button><span>Page {page} of {totalPages}</span><button className="icon-button" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} aria-label="Next rule groups"><ChevronRight size={17} /></button></div></div>}</div> : <EmptyState title="No recurring compliance records match" description="Try removing a filter or generate applicable obligations from the Compliance Master." icon={FileText} />}
      </DashboardSection>
      <ComplianceActionDialog item={selected} mode={dialogMode} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={() => Promise.all([grouped.refetch(), pendingApprovals.refetch()])} />
    </div>
  );
}

export function ModernWorklist() {
  const { kind } = useParams();
  if (kind === "company") return <EnterpriseRecurringWorklist complianceArea="COMPANY" />;
  if (kind === "contractor") return <EnterpriseRecurringWorklist complianceArea="CONTRACTOR" />;
  return kind === "recurring" ? <EnterpriseRecurringWorklist /> : <OneTimeWorklist />;
}

type SubmissionRow = Instance & {
  submission_status?: string;
  submitted_date?: string;
  submitted_at?: string;
  filed_late?: boolean;
  submission_revision?: number;
};

export function MySubmissions() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<Instance>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("view");
  const [filters, setFilters] = useState({ q: "", status: "", frequency: "", timeliness: "", risk_level: "", date_from: "", date_to: "", sort_by: "submitted_at", sort_dir: "desc", page: "1", page_size: "25" });
  const query = useQuery({
    queryKey: ["my-submissions", filters],
    queryFn: () => morax.mySubmissions(filters),
    refetchInterval: 15_000,
  });
  const data = query.data;
  const summary = data?.summary ?? { all: 0, awaiting_review: 0, approved: 0, rejected: 0, filed_on_time: 0, filed_late: 0 };
  const setFilter = (name: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [name]: value, ...(name !== "page" && name !== "page_size" ? { page: "1" } : {}) }));
  const clearFilters = () => setFilters({ q: "", status: "", frequency: "", timeliness: "", risk_level: "", date_from: "", date_to: "", sort_by: "submitted_at", sort_dir: "desc", page: "1", page_size: "25" });
  const toggleSort = (field: "compliance_name" | "due_date" | "submitted_at" | "risk_level" | "status") => setFilters((current) => ({ ...current, sort_by: field, sort_dir: current.sort_by === field && current.sort_dir === "desc" ? "asc" : "desc" }));
  const metricFilter = (metric: "all" | "awaiting" | "approved" | "rejected" | "on-time" | "late") => {
    const active = metric === "all"
      ? !filters.status && !filters.timeliness
      : metric === "awaiting" ? filters.status === "AWAITING_REVIEW"
      : metric === "approved" ? filters.status === "APPROVED"
      : metric === "rejected" ? filters.status === "REJECTED"
      : metric === "on-time" ? filters.timeliness === "ON_TIME"
      : filters.timeliness === "LATE";
    setFilters((current) => active
      ? { ...current, status: "", timeliness: "", page: "1" }
      : {
          ...current,
          status: metric === "awaiting" ? "AWAITING_REVIEW" : metric === "approved" ? "APPROVED" : metric === "rejected" ? "REJECTED" : "",
          timeliness: metric === "on-time" ? "ON_TIME" : metric === "late" ? "LATE" : "",
          page: "1",
        });
  };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / Number(filters.page_size)));
  const currentPage = Number(filters.page);
  const status = (row: SubmissionRow) => row.submission_status ?? row.status;
  const submissionDate = (row: SubmissionRow) => row.submitted_date ?? row.submitted_at;

  return <div className="modern-page my-submissions-page">
    <WorkspacePageHeader eyebrow="DASHBOARD / MY SUBMISSIONS" title="My submissions" description="Track every compliance filing sent by you for Checker review." actions={<div className="page-actions"><button className="button-secondary" type="button" onClick={() => setFilter("status", "REJECTED")}>Resubmit rejected</button><Link className="button-secondary" to={`${base}/dashboard`}>Dashboard</Link></div>} />
    <section className="submission-summary-grid" aria-label="Submission summary">
      {[
        ["All submissions", summary.all, "all"], ["Awaiting review", summary.awaiting_review, "awaiting"], ["Approved", summary.approved, "approved"], ["Rejected", summary.rejected, "rejected"], ["Filed on time", summary.filed_on_time, "on-time"], ["Filed late", summary.filed_late, "late"],
      ].map(([label, value, tone]) => {
        const metric = tone as "all" | "awaiting" | "approved" | "rejected" | "on-time" | "late";
        const active = metric === "all" ? !filters.status && !filters.timeliness : metric === "awaiting" ? filters.status === "AWAITING_REVIEW" : metric === "approved" ? filters.status === "APPROVED" : metric === "rejected" ? filters.status === "REJECTED" : metric === "on-time" ? filters.timeliness === "ON_TIME" : filters.timeliness === "LATE";
        return <button className={`submission-summary-card ${tone} ${active ? "is-active" : ""}`} type="button" key={String(label)} aria-pressed={active} title={active ? "Clear this metric filter" : `Show ${String(label).toLowerCase()}`} onClick={() => metricFilter(metric)}><b>{value}</b><span>{label}</span></button>;
      })}
    </section>
    <DashboardSection title="Submission history" description={`${data?.total ?? 0} submission${(data?.total ?? 0) === 1 ? "" : "s"}`}>
      <div className="my-submissions-filters">
        <label className="search-control"><span>Search</span><Search size={16} /><input value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="Compliance, act, rule, document type..." /></label>
        <label>Status<select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}><option value="">All statuses</option><option value="AWAITING_REVIEW">Awaiting review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CORRECTION_REQUIRED">Correction required</option></select></label>
        <label>Compliance<select value={filters.frequency} onChange={(event) => setFilter("frequency", event.target.value)}><option value="">Recurring + one-time</option><option value="ONE_TIME">One-time</option><option value="MONTHLY">Recurring</option><option value="QUARTERLY">Recurring</option><option value="YEARLY">Recurring</option></select></label>
        <label>Timeliness<select value={filters.timeliness} onChange={(event) => setFilter("timeliness", event.target.value)}><option value="">On time + late</option><option value="ON_TIME">Filed on time</option><option value="LATE">Filed late</option></select></label>
        <label>Risk<select value={filters.risk_level} onChange={(event) => setFilter("risk_level", event.target.value)}><option value="">All risks</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option value={value} key={value}>{humanize(value)}</option>)}</select></label>
        <label>From<input type="date" value={filters.date_from} onChange={(event) => setFilter("date_from", event.target.value)} /></label>
        <label>To<input type="date" value={filters.date_to} onChange={(event) => setFilter("date_to", event.target.value)} /></label>
        <button className="button-secondary compact-action" type="button" onClick={clearFilters}>Clear filters</button>
      </div>
      <InlineError message={query.error instanceof Error ? "Unable to load submission history. Please try again." : ""} />
      <div className="modern-table-wrap"><table className="modern-table"><thead><tr><th><button type="button" onClick={() => toggleSort("compliance_name")}>Compliance</button></th><th><button type="button" onClick={() => toggleSort("due_date")}>Due</button></th><th><button type="button" onClick={() => toggleSort("submitted_at")}>Submitted</button></th><th><button type="button" onClick={() => toggleSort("risk_level")}>Risk</button></th><th><button type="button" onClick={() => toggleSort("status")}>Status</button></th><th>Actions</th></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={6}><LoadingSkeleton rows={3} /></td></tr> : (data?.items as SubmissionRow[] | undefined)?.length ? (data?.items as SubmissionRow[]).map((row) => <tr key={row.id}><td><b>{row.compliance_name}</b><small>{[row.act, row.rule_reference || row.section].filter(Boolean).join(" / ") || row.compliance_id}</small></td><td>{formatDate(row.due_date)}</td><td>{formatDate(submissionDate(row))}<small>{row.filed_late ? "Filed late" : "Filed on time"}</small></td><td><span className={`risk-label ${row.risk_level.toLowerCase()}`}>{humanize(row.risk_level)}</span></td><td><ComplianceStatusBadge status={status(row)} /></td><td><div className="compliance-table-actions"><button className="icon-action" type="button" title="View submission" aria-label={`View ${row.compliance_name}`} onClick={() => { setDialogMode("view"); setSelected(row); }}><Eye size={16} /></button>{["REJECTED", "CORRECTION_REQUIRED"].includes(status(row)) && <button className="icon-action submit-compliance-action" type="button" title="Correct and resubmit" aria-label={`Resubmit ${row.compliance_name}`} onClick={() => { setDialogMode("submit"); setSelected(row); }}><Upload size={16} /></button>}{row.evidence?.[0] && <button className="icon-action" type="button" title="Download latest supporting document" aria-label={`Download evidence for ${row.compliance_name}`} onClick={() => morax.downloadDocument(row.evidence![0].id, row.evidence![0].original_filename)}><Download size={16} /></button>}</div></td></tr>) : <tr><td colSpan={6} className="empty-table-message">You have not submitted anything yet.</td></tr>}</tbody></table></div>
      <div className="pagination-row"><label>Show <select value={filters.page_size} onChange={(event) => setFilter("page_size", event.target.value)}>{[10, 25, 50].map((value) => <option value={value} key={value}>{value}</option>)}</select> entries</label><span>Showing {data?.total ? (currentPage - 1) * Number(filters.page_size) + 1 : 0} to {Math.min(currentPage * Number(filters.page_size), data?.total ?? 0)} of {data?.total ?? 0}</span><div><button className="button-secondary" type="button" disabled={currentPage <= 1} onClick={() => setFilter("page", String(currentPage - 1))}>Previous</button><button className="button-secondary" type="button" disabled={currentPage >= totalPages} onClick={() => setFilter("page", String(currentPage + 1))}>Next</button></div></div>
    </DashboardSection>
    <ComplianceActionDialog item={selected} mode={dialogMode} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={() => query.refetch()} />
  </div>;
}

type CheckerQueueRow = Instance & {
  submitted_at?: string | null;
  submitted_by_name?: string;
  waiting_days?: number;
  submission_revision?: number | null;
};

type CheckerHistoryRow = CheckerQueueRow & {
  decision: "APPROVED" | "REJECTED";
  review_action: string;
  review_remarks?: string | null;
  reviewed_at: string;
  review_duration_hours?: number | null;
};

function EvidenceDownloadPicker({
  items,
  onClose,
}: {
  items: Evidence[] | undefined;
  onClose: () => void;
}) {
  if (!items) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dialog compliance-evidence-picker" role="dialog" aria-modal="true" aria-label="Download evidence" onMouseDown={(event) => event.stopPropagation()}>
      <div className="dialog-header"><div><p className="eyebrow">SUBMISSION EVIDENCE</p><h2>Download supporting documents</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="evidence-list compact-evidence-list">{items.length ? items.map((evidence) => <article className="evidence-card" key={evidence.id}><div><b>{evidence.original_filename}</b><small>{humanize(evidence.category)}{evidence.size_bytes ? ` · ${Math.ceil(evidence.size_bytes / 1024)} KB` : ""}</small></div><button className="button-secondary" type="button" onClick={() => morax.downloadDocument(evidence.id, evidence.original_filename)}><Download size={15} />Download</button></article>) : <EmptyState title="No uploaded documents" description="The Maker did not attach supporting evidence to this submission." icon={FileText} />}</div>
      <div className="dialog-footer"><button className="button-secondary" type="button" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}

function CheckerActionButtons({
  item,
  onView,
  onReview,
  onDownload,
}: {
  item: CheckerQueueRow;
  onView: () => void;
  onReview: () => void;
  onDownload: () => void;
}) {
  return <div className="compliance-table-actions">
    <button className="icon-action open-compliance-action" type="button" title="View compliance details" aria-label={`View ${item.compliance_name}`} onClick={onView}><Eye size={16} /></button>
    <button className="icon-action review-compliance-action" type="button" title="Review submission" aria-label={`Review ${item.compliance_name}`} onClick={onReview}><ClipboardCheck size={16} /></button>
    <button className="icon-action" type="button" title="Download evidence" aria-label={`Download evidence for ${item.compliance_name}`} onClick={onDownload}><Download size={16} /></button>
  </div>;
}

function useEvidenceDownload() {
  const [choices, setChoices] = useState<Evidence[] | undefined>();
  const [downloadError, setDownloadError] = useState("");
  const download = async (item: Instance) => {
    setDownloadError("");
    try {
      const detail = await morax.instance(item.id);
      const evidence = detail.evidence ?? [];
      if (evidence.length === 1) {
        await morax.downloadDocument(evidence[0].id, evidence[0].original_filename);
      } else {
        setChoices(evidence);
      }
    } catch (error) {
      setDownloadError(requestMessage(error, "Unable to download supporting documents."));
    }
  };
  return { choices, closeChoices: () => setChoices(undefined), download, downloadError };
}

function useCheckerEntityOptions() {
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: () => morax.me(), staleTime: 60_000 });
  const entities = useQuery({
    queryKey: ["checker-authorized-entities"],
    queryFn: async () => {
      const [units, contractors] = await Promise.all([morax.units(), morax.contractors()]);
      return { units: units.items, contractors };
    },
    enabled: Boolean(currentUser.data),
    staleTime: 60_000,
  });
  const options = useMemo(() => {
    const activeContractorId = currentUser.data?.contractor_context?.enabled
      ? currentUser.data.contractor_context.active_contractor_id
      : undefined;
    const scopes = (currentUser.data?.scopes ?? []).filter((scope) =>
      scope.role.endsWith("_CHECKER")
      && ["UNIT", "CONTRACTOR"].includes(scope.scope_type)
      // Contractor-only sessions are intentionally limited to the active
      // contractor context selected through the existing workspace switcher.
      && (!activeContractorId || scope.scope_type !== "CONTRACTOR" || scope.scope_id === activeContractorId),
    );
    const unitNames = new Map((entities.data?.units ?? []).map((unit) => [String(unit.id), String(unit.name ?? "Unit")]));
    const contractorNames = new Map((entities.data?.contractors ?? []).map((contractor) => [String(contractor.id), String(contractor.name ?? contractor.legal_name ?? "Contractor")]));
    return scopes.map((scope) => ({
      id: scope.scope_id,
      type: scope.scope_type,
      name: scope.scope_type === "UNIT" ? unitNames.get(scope.scope_id) : contractorNames.get(scope.scope_id),
    })).filter((option): option is { id: string; type: string; name: string } => Boolean(option.name));
  }, [currentUser.data, entities.data]);
  return { options, isLoading: currentUser.isLoading || entities.isLoading };
}

function CheckerDashboard() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [selected, setSelected] = useState<CheckerQueueRow>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("review");
  const { options: checkerEntities, isLoading: checkerEntitiesLoading } = useCheckerEntityOptions();
  const [subjectId, setSubjectId] = useState("");
  useEffect(() => { if (checkerEntities.length && !checkerEntities.some((entity) => entity.id === subjectId)) setSubjectId(checkerEntities[0].id); }, [checkerEntities, subjectId]);
  const reviewReady = !checkerEntitiesLoading && (!checkerEntities.length || Boolean(subjectId));
  const pending = useQuery({ queryKey: ["checker-dashboard-pending", subjectId], queryFn: () => morax.myPendingApprovals({ page_size: "100", subject_id: subjectId }), enabled: reviewReady, refetchInterval: 20_000 });
  const selectedEntity = checkerEntities.find((entity) => entity.id === subjectId);
  const overviewFilters: Record<string, string> = selectedEntity ? selectedEntity.type === "UNIT" ? { unit_id: subjectId } : { contractor_id: subjectId } : {};
  const overview = useQuery({ queryKey: ["checker-dashboard-overview", subjectId], queryFn: () => morax.dashboardOverview(overviewFilters), enabled: reviewReady, refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ["checker-dashboard-history"], queryFn: () => morax.myReviewHistory({ page_size: "100" }), refetchInterval: 20_000 });
  const { choices, closeChoices, download, downloadError } = useEvidenceDownload();
  const pendingRows = (pending.data?.items ?? []) as CheckerQueueRow[];
  const reviewSummary = history.data?.summary ?? { total_reviewed: 0, approved: 0, rejected: 0 };
  const complianceSummary = overview.data?.summary;
  const riskRows = ["HIGH", "MEDIUM", "LOW"].map((risk) => ({ name: humanize(risk), value: pendingRows.filter((row) => row.risk_level === risk).length }));
  const statusRows = [
    { name: "Pending review", value: pendingRows.length },
    { name: "Approved by me", value: reviewSummary.approved },
    { name: "Rejected by me", value: reviewSummary.rejected },
  ].filter((row) => row.value > 0);
  const refresh = () => Promise.all([pending.refetch(), history.refetch(), overview.refetch()]);

  return <div className="modern-page checker-dashboard-page">
    <WorkspacePageHeader eyebrow="CHECKER WORKSPACE" title="Compliance review dashboard" description="Review only Maker submissions assigned to your authorized entity. Decisions and documents remain linked to the correct compliance period." actions={<div className="page-actions">{checkerEntities.length > 1 && <label className="compact-entity-selector">Entity<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{checkerEntities.map((entity) => <option key={`${entity.type}-${entity.id}`} value={entity.id}>{entity.name}</option>)}</select></label>}<Link className="button-primary" to={`${base}/pending-reviews`}><ClipboardCheck size={16} />Pending reviews</Link><Link className="button-secondary" to={`${base}/review-history`}><History size={16} />My review history</Link></div>} />
    <InlineError message={pending.error instanceof Error ? "Unable to load your review queue. Please try again." : downloadError} />
    <section className="dashboard-metric-grid checker-summary-grid" aria-label="Checker review summary">
      <DashboardMetricCard label="Awaiting my review" value={pending.data?.summary.pending_review ?? 0} helper="Assigned Maker submissions" tone="warning" />
      <DashboardMetricCard label="Waiting over 3 days" value={pending.data?.summary.pending_more_than_3_days ?? 0} helper="Prioritize these reviews" tone="critical" />
      <DashboardMetricCard label="Upcoming compliance" value={complianceSummary?.upcoming ?? 0} helper="More than 7 days to deadline" tone="attention" />
      <DashboardMetricCard label="Due this month" value={(complianceSummary?.due_today ?? 0) + (complianceSummary?.due_soon ?? 0)} helper="Due today or within 7 days" tone="attention" />
      <DashboardMetricCard label="Overdue compliance" value={complianceSummary?.overdue ?? 0} helper="Authorized entity scope" tone="critical" />
      <DashboardMetricCard label="Rejected — awaiting resubmission" value={complianceSummary?.rejected ?? 0} helper="Maker correction required" tone="critical" />
      <DashboardMetricCard label="Approved by me" value={reviewSummary.approved} helper="All retained decisions" tone="success" />
      <DashboardMetricCard label="Rejected by me" value={reviewSummary.rejected} helper="Corrections requested" tone="critical" />
      <DashboardMetricCard label="Completed compliance" value={complianceSummary?.completed ?? 0} helper={`${complianceSummary?.completion_rate ?? 0}% compliance health`} tone="success" />
      <DashboardMetricCard label="Total reviewed" value={reviewSummary.total_reviewed} helper="Approval and rejection history" />
    </section>
    <section className="dashboard-layout dashboard-two-column">
      <DashboardSection title="Review queue status" description="Live queue and your completed decisions.">
        {statusRows.length ? <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={statusRows} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={3}>{statusRows.map((entry, index) => <Cell key={entry.name} fill={STATUS_COLORS[index]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <EmptyState title="No review activity yet" description="Maker submissions assigned to you will appear here." icon={ClipboardCheck} />}
      </DashboardSection>
      <DashboardSection title="Pending by risk" description="Use risk to prioritize review work.">
        <ResponsiveContainer width="100%" height={230}><BarChart data={riskRows}><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#2A3620" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>
      </DashboardSection>
    </section>
    <DashboardSection title="Latest review queue" description="Open a submission directly; no nested details screen is required." action={<Link className="text-button" to={`${base}/pending-reviews`}>View all</Link>}>
      {pending.isLoading ? <LoadingSkeleton rows={4} /> : pendingRows.length ? <div className="modern-table-wrap"><table className="modern-table"><thead><tr><th>Compliance</th><th>Due date</th><th>Submitted by</th><th>Waiting</th><th>Actions</th></tr></thead><tbody>{pendingRows.slice(0, 6).map((row) => <tr key={row.id}><td><b>{row.compliance_name}</b><small>{[row.act, row.rule_reference].filter(Boolean).join(" / ")}</small></td><td>{formatDate(row.due_date)}</td><td>{row.submitted_by_name ?? "Maker"}<small>{formatDate(row.submitted_at ?? undefined)}</small></td><td>{row.waiting_days ?? 0} day{row.waiting_days === 1 ? "" : "s"}</td><td><CheckerActionButtons item={row} onView={() => { setDialogMode("view"); setSelected(row); }} onReview={() => { setDialogMode("review"); setSelected(row); }} onDownload={() => void download(row)} /></td></tr>)}</tbody></table></div> : <EmptyState title="No submissions awaiting your review" description="New submissions will appear automatically when a Maker submits an assigned compliance." icon={ClipboardCheck} />}
    </DashboardSection>
    <ComplianceActionDialog item={selected} mode={dialogMode} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={refresh} />
    <EvidenceDownloadPicker items={choices} onClose={closeChoices} />
  </div>;
}

export function PendingReviews() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [filters, setFilters] = useState({ q: "", status: "", risk_level: "", frequency: "", date_from: "", date_to: "", waiting_over_days: "", page: "1", page_size: "25" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<CheckerQueueRow>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("review");
  const { options: checkerEntities, isLoading: checkerEntitiesLoading } = useCheckerEntityOptions();
  const [subjectId, setSubjectId] = useState("");
  useEffect(() => { if (checkerEntities.length && !checkerEntities.some((entity) => entity.id === subjectId)) setSubjectId(checkerEntities[0].id); }, [checkerEntities, subjectId]);
  const reviewReady = !checkerEntitiesLoading && (!checkerEntities.length || Boolean(subjectId));
  const pending = useQuery({ queryKey: ["checker-pending-reviews", filters, subjectId], queryFn: () => morax.myPendingApprovals({ ...filters, subject_id: subjectId }), enabled: reviewReady, refetchInterval: 15_000 });
  const { choices, closeChoices, download, downloadError } = useEvidenceDownload();
  const rows = (pending.data?.items ?? []) as CheckerQueueRow[];
  const groups = useMemo(() => {
    const result = new Map<string, { name: string; rows: CheckerQueueRow[] }>();
    rows.forEach((row) => {
      const key = row.rule_id || row.rule_reference || row.compliance_id;
      const current = result.get(key) ?? { name: row.rule_name || row.rule_reference || row.compliance_name, rows: [] };
      current.rows.push(row);
      result.set(key, current);
    });
    return [...result.entries()].map(([id, group]) => ({ id, ...group }));
  }, [rows]);
  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" || key === "page_size" ? {} : { page: "1" }) }));
  const clearFilters = () => setFilters({ q: "", status: "", risk_level: "", frequency: "", date_from: "", date_to: "", waiting_over_days: "", page: "1", page_size: "25" });
  const toggleQueueMetric = (status = "", waiting_over_days = "") => setFilters((current) => current.status === status && current.waiting_over_days === waiting_over_days ? { ...current, status: "", waiting_over_days: "", page: "1" } : { ...current, status, waiting_over_days, page: "1" });
  const refresh = () => pending.refetch();
  const totalPages = Math.max(1, Math.ceil((pending.data?.total ?? 0) / Number(filters.page_size)));
  const currentPage = Number(filters.page);
  const toggleGroup = (id: string) => setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <div className="modern-page pending-reviews-page">
    <WorkspacePageHeader eyebrow="COMPLIANCE / CHECKER" title="Pending reviews" description="Review compliance documents submitted by Makers assigned to you." actions={<div className="page-actions">{checkerEntities.length > 1 && <label className="compact-entity-selector">Entity<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{checkerEntities.map((entity) => <option key={`${entity.type}-${entity.id}`} value={entity.id}>{entity.name}</option>)}</select></label>}<Link className="button-secondary" to={`${base}/review-history`}><History size={16} />My review history</Link></div>} />
    <section className="dashboard-metric-grid checker-summary-grid"><DashboardMetricCard label="Total submitted" value={pending.data?.total ?? 0} helper="Your active review queue" onClick={() => toggleQueueMetric()} active={!filters.status && !filters.waiting_over_days} /><DashboardMetricCard label="Pending review" value={pending.data?.summary.pending_review ?? 0} helper="Awaiting your decision" tone="warning" onClick={() => toggleQueueMetric()} active={!filters.status && !filters.waiting_over_days} /><DashboardMetricCard label="Over 3 days" value={pending.data?.summary.pending_more_than_3_days ?? 0} helper="Needs priority" tone="critical" onClick={() => toggleQueueMetric("", "3")} active={filters.waiting_over_days === "3"} /><DashboardMetricCard label="Overdue" value={pending.data?.summary.overdue ?? 0} helper="In your review queue" tone="critical" onClick={() => toggleQueueMetric("OVERDUE")} active={filters.status === "OVERDUE"} /></section>
    <DashboardSection title="Filters" description="Search and filters apply together." className="filter-section" action={<button className="button-secondary compact-action" type="button" onClick={clearFilters}><RefreshCw size={15} />Clear filters</button>}>
      <div className="filter-grid grouped-filter-grid"><label className="search-control"><span>Search</span><Search size={16} /><input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Compliance, Act, Rule, or Maker" /></label><label>Status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All pending statuses</option><option value="SUBMITTED">Submitted</option><option value="UNDER_REVIEW">Under review</option><option value="OVERDUE">Overdue</option></select></label><label>Risk level<select value={filters.risk_level} onChange={(event) => updateFilter("risk_level", event.target.value)}><option value="">All risk levels</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label><label>Frequency<select value={filters.frequency} onChange={(event) => updateFilter("frequency", event.target.value)}><option value="">All frequencies</option>{recurringFrequencies.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</select></label><label>Due from<input type="date" value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} /></label><label>Due to<input type="date" value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} /></label></div>
    </DashboardSection>
    <InlineError message={pending.error instanceof Error ? "Unable to load pending reviews. Please try again." : downloadError} />
    <DashboardSection title="Compliances — Grouped by Rule" description={`${pending.data?.total ?? 0} submission${(pending.data?.total ?? 0) === 1 ? "" : "s"} awaiting your review`} className="grouped-compliance-section" action={<div className="group-actions"><button className="button-secondary compact-action" type="button" onClick={() => setExpanded(new Set(groups.map((group) => group.id)))} disabled={!groups.length}>Expand all</button><button className="button-secondary compact-action" type="button" onClick={() => setExpanded(new Set())} disabled={!expanded.size}>Collapse all</button></div>}>
      {pending.isLoading ? <LoadingSkeleton rows={7} /> : groups.length ? <div className="rule-group-list">{groups.map((group) => { const open = expanded.has(group.id); return <article className={`rule-group ${open ? "expanded" : ""}`} key={group.id}><button className="rule-group-header" type="button" onClick={() => toggleGroup(group.id)} aria-expanded={open}><span className="rule-group-title"><span className="rule-group-icon"><Layers3 size={18} /></span><span>{group.name}</span><span className="rule-count">{group.rows.length} submission{group.rows.length === 1 ? "" : "s"}</span></span><span className="rule-group-meta"><span className="rule-due-count">{group.rows.length} awaiting</span><ChevronDown size={19} className={open ? "chevron-up" : ""} /></span></button>{open && <div className="modern-table-wrap rule-records-table"><table className="modern-table"><thead><tr><th>Compliance type</th><th>Document type</th><th>Form no.</th><th>Frequency</th><th>Due date</th><th>Risk</th><th>Status</th><th>Submitted by</th><th>Actions</th></tr></thead><tbody>{group.rows.map((row) => <tr key={row.id}><td><b>{row.compliance_name}</b><small>{row.compliance_id}</small></td><td>{documentTypeLabels[row.document_type ?? ""] ?? humanize(row.document_type ?? "PROCEDURAL")}</td><td>{row.form_number || "—"}</td><td>{humanize(row.frequency)}<small>{row.period_key}</small></td><td><span className={row.is_overdue ? "table-due overdue" : "table-due"}>{formatDate(row.due_date)}<small>{row.waiting_days ? `${row.waiting_days}d waiting` : "New"}</small></span></td><td><span className={`risk-label ${row.risk_level.toLowerCase()}`}>{humanize(row.risk_level)}</span></td><td><ComplianceStatusBadge status="AWAITING_REVIEW" /></td><td>{row.submitted_by_name || "Maker"}<small>{formatDate(row.submitted_at ?? undefined)}</small></td><td><CheckerActionButtons item={row} onView={() => { setDialogMode("view"); setSelected(row); }} onReview={() => { setDialogMode("review"); setSelected(row); }} onDownload={() => void download(row)} /></td></tr>)}</tbody></table></div>}</article>; })}</div> : <EmptyState title="No submissions await your review" description="New Maker submissions assigned to you will appear here automatically." icon={ClipboardCheck} />}
      <div className="pagination-row"><label>Show <select value={filters.page_size} onChange={(event) => updateFilter("page_size", event.target.value)}>{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select> entries</label><span>Showing {pending.data?.total ? (currentPage - 1) * Number(filters.page_size) + 1 : 0} to {Math.min(currentPage * Number(filters.page_size), pending.data?.total ?? 0)} of {pending.data?.total ?? 0}</span><div><button className="button-secondary" type="button" disabled={currentPage <= 1} onClick={() => updateFilter("page", String(currentPage - 1))}>Previous</button><button className="button-secondary" type="button" disabled={currentPage >= totalPages} onClick={() => updateFilter("page", String(currentPage + 1))}>Next</button></div></div>
    </DashboardSection>
    <ComplianceActionDialog item={selected} mode={dialogMode} onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} onUpdated={refresh} />
    <EvidenceDownloadPicker items={choices} onClose={closeChoices} />
  </div>;
}

export function MyReviewHistory() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [filters, setFilters] = useState({ q: "", decision: "", date_from: "", date_to: "", sort_by: "reviewed_at", sort_dir: "desc", page: "1", page_size: "25" });
  const [selected, setSelected] = useState<CheckerHistoryRow>();
  const history = useQuery({ queryKey: ["checker-review-history", filters], queryFn: () => morax.myReviewHistory(filters), refetchInterval: 20_000 });
  const { choices, closeChoices, download, downloadError } = useEvidenceDownload();
  const rows = (history.data?.items ?? []) as CheckerHistoryRow[];
  const summary = history.data?.summary ?? { total_reviewed: 0, approved: 0, rejected: 0, average_review_hours: 0 };
  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" || key === "page_size" ? {} : { page: "1" }) }));
  const toggleDecisionMetric = (decision = "") => updateFilter("decision", filters.decision === decision ? "" : decision);
  const currentPage = Number(filters.page);
  const totalPages = Math.max(1, Math.ceil((history.data?.total ?? 0) / Number(filters.page_size)));
  return <div className="modern-page review-history-page"><WorkspacePageHeader eyebrow="COMPLIANCE / CHECKER" title="My review history" description="Every approval, rejection, and correction decision made by you is retained here." actions={<Link className="button-secondary" to={`${base}/pending-reviews`}><ClipboardCheck size={16} />Pending reviews</Link>} />
    <section className="dashboard-metric-grid checker-summary-grid"><DashboardMetricCard label="Total reviewed" value={summary.total_reviewed} helper="Your final decisions" onClick={() => toggleDecisionMetric()} active={!filters.decision} /><DashboardMetricCard label="Approved by me" value={summary.approved} helper="Completed submissions" tone="success" onClick={() => toggleDecisionMetric("APPROVED")} active={filters.decision === "APPROVED"} /><DashboardMetricCard label="Rejected by me" value={summary.rejected} helper="Corrections required" tone="critical" onClick={() => toggleDecisionMetric("REJECTED")} active={filters.decision === "REJECTED"} /><DashboardMetricCard label="Average review time" value={`${summary.average_review_hours}h`} helper="Submission to final decision" tone="attention" /></section>
    <DashboardSection title="Review history" description={`${history.data?.total ?? 0} decision${(history.data?.total ?? 0) === 1 ? "" : "s"}`} className="filter-section"><div className="filter-grid grouped-filter-grid"><label className="search-control"><span>Search</span><Search size={16} /><input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Compliance, Act, Rule, or entity" /></label><label>Decision<select value={filters.decision} onChange={(event) => updateFilter("decision", event.target.value)}><option value="">All decisions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected / correction</option></select></label><label>Sort by<select value={filters.sort_by} onChange={(event) => updateFilter("sort_by", event.target.value)}><option value="reviewed_at">Reviewed date</option><option value="submitted_at">Submitted date</option><option value="compliance_name">Compliance name</option><option value="decision">Decision</option><option value="review_duration">Review duration</option></select></label><label>Direction<select value={filters.sort_dir} onChange={(event) => updateFilter("sort_dir", event.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label><label>Reviewed from<input type="date" value={filters.date_from} onChange={(event) => updateFilter("date_from", event.target.value)} /></label><label>Reviewed to<input type="date" value={filters.date_to} onChange={(event) => updateFilter("date_to", event.target.value)} /></label><button className="button-secondary compact-action" type="button" onClick={() => setFilters({ q: "", decision: "", date_from: "", date_to: "", sort_by: "reviewed_at", sort_dir: "desc", page: "1", page_size: "25" })}>Clear filters</button></div></DashboardSection>
    <InlineError message={history.error instanceof Error ? "Unable to load review history. Please try again." : downloadError} />
    <DashboardSection title="Decisions" className="grouped-compliance-section">{history.isLoading ? <LoadingSkeleton rows={5} /> : rows.length ? <div className="modern-table-wrap"><table className="modern-table"><thead><tr><th>Compliance</th><th>Entity</th><th>Period</th><th>Submitted by</th><th>Reviewed</th><th>Decision</th><th>Review remarks</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.id}-${row.reviewed_at}-${row.review_action}`}><td><b>{row.compliance_name}</b><small>{[row.act, row.rule_reference].filter(Boolean).join(" / ")}</small></td><td>{row.subject_name}</td><td>{row.period_key}</td><td>{row.submitted_by_name}<small>{formatDate(row.submitted_at ?? undefined)}</small></td><td>{formatDate(row.reviewed_at)}</td><td><ComplianceStatusBadge status={row.decision} /></td><td>{row.review_remarks || "—"}</td><td><CheckerActionButtons item={row} onView={() => setSelected(row)} onReview={() => setSelected(row)} onDownload={() => void download(row)} /></td></tr>)}</tbody></table></div> : <EmptyState title="No review decisions yet" description="Your approvals and rejections will remain available here." icon={History} />}<div className="pagination-row"><label>Show <select value={filters.page_size} onChange={(event) => updateFilter("page_size", event.target.value)}>{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select> entries</label><span>Showing {history.data?.total ? (currentPage - 1) * Number(filters.page_size) + 1 : 0} to {Math.min(currentPage * Number(filters.page_size), history.data?.total ?? 0)} of {history.data?.total ?? 0}</span><div><button className="button-secondary" disabled={currentPage <= 1} type="button" onClick={() => updateFilter("page", String(currentPage - 1))}>Previous</button><button className="button-secondary" disabled={currentPage >= totalPages} type="button" onClick={() => updateFilter("page", String(currentPage + 1))}>Next</button></div></div></DashboardSection>
    <ComplianceActionDialog item={selected} mode="view" onClose={() => setSelected(undefined)} detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""} />
    <EvidenceDownloadPicker items={choices} onClose={closeChoices} />
  </div>;
}

export { CheckerDashboard };

function OneTimeWorklist() {
  const { kind, organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const isOneTime = kind === "one-time";
  const [items, setItems] = useState<Instance[]>([]);
  const [selected, setSelected] = useState<Instance>();
  const [dialogMode, setDialogMode] = useState<ComplianceDialogMode>("view");
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: () => morax.me(), staleTime: 60_000 });
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
  const toggleWorklistMetric = (status = "") => updateFilter("status", filters.status === status ? "" : status);
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
        <DashboardMetricCard label="Total" value={visibleItems.length} helper="Matching obligations" onClick={() => toggleWorklistMetric()} active={!filters.status} />
        <DashboardMetricCard label="Completed" value={completed} helper="Approved obligations" tone="success" onClick={() => toggleWorklistMetric("COMPLETED")} active={filters.status === "COMPLETED"} />
        <DashboardMetricCard label="Open" value={open} helper="Requires workflow action" tone="warning" onClick={() => toggleWorklistMetric("PENDING_ACTION")} active={filters.status === "PENDING_ACTION"} />
        <DashboardMetricCard label="Overdue" value={overdue} helper="Past due date" tone="critical" onClick={() => toggleWorklistMetric("OVERDUE")} active={filters.status === "OVERDUE"} />
        <DashboardMetricCard label="Due soon" value={dueSoonCount} helper="Due in 7 days" tone="warning" onClick={() => toggleWorklistMetric("DUE_SOON")} active={filters.status === "DUE_SOON"} />
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
                      <td><div className="compliance-table-actions"><button className="icon-action" type="button" onClick={() => { setDialogMode("view"); setSelected(item); }} aria-label={`View ${item.compliance_name}`} title="View compliance details"><Eye size={16} /></button>{canSubmitCompliance(currentUser.data) && isEditableCompliance(item) && <button className="icon-action submit-compliance-action" type="button" onClick={() => { setDialogMode("submit"); setSelected(item); }} aria-label={`Upload and submit ${item.compliance_name}`} title="Upload documents and submit"><Upload size={16} /></button>}</div></td>
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
        mode={dialogMode}
        onClose={() => setSelected(undefined)}
        detailPath={selected ? `${base}/compliances/detail/${selected.id}` : ""}
        onUpdated={load}
      />
    </div>
  );
}

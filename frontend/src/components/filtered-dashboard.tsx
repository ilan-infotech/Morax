import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { morax } from "../api/morax";
import type { User } from "../api/morax";
import {
  DashboardMetricCard,
  DashboardSection,
  EmptyState,
  formatDate,
  humanize,
  InlineError,
  LoadingSkeleton,
  WorkspacePageHeader,
} from "./workspace-ui";
import { PremiumComplianceAnalytics } from "./premium-compliance-analytics";

type DashboardFilters = {
  unit_id: string;
  entity_id: string;
  contractor_id: string;
  period_key: string;
};

function healthTone(rate: number, overdue: number) {
  if (overdue > 0) return "critical";
  if (rate >= 80) return "healthy";
  if (rate >= 50) return "watch";
  return "attention";
}

import { motion } from "framer-motion";

export function HealthRankings({
  rows,
  kind,
}: {
  rows: {
    id: string;
    name: string;
    entity_type?: string;
    total: number;
    completed: number;
    overdue: number;
    rate: number;
  }[];
  kind: "entity" | "contractor";
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title={"No " + kind + " health data"}
        description="Generate compliance obligations to compare health across the selected scope."
      />
    );
  }
  return (
    <motion.div 
      className="health-ranking"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
      }}
    >
      {rows.slice(0, 8).map((row, index) => {
        const tone = healthTone(row.rate, row.overdue);
        return (
          <motion.div 
            className="health-row" 
            key={row.id}
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
            }}
            whileHover={{ scale: 1.01 }}
          >
            <span className="health-rank shrink-0">{index + 1}</span>
            <div className="health-name min-w-0 flex-1 truncate">
              <b className="block truncate">{row.name}</b>
              <small className="block truncate text-ellipsis">
                {row.entity_type ? humanize(row.entity_type) : "Contractor"} ·{" "}
                {row.completed}/{row.total} completed
              </small>
            </div>
            <div
              className="health-progress hidden sm:block shrink-0 w-24 md:w-32"
              aria-label={row.rate + "% compliant"}
            >
              <span
                className={"health-progress-fill " + tone}
                style={{ width: row.rate + "%" }}
              />
            </div>
            <b className={`health-rate shrink-0 ${tone}`}>{row.rate}%</b>
            <span
              className={`shrink-0 ml-auto sm:ml-0 whitespace-nowrap ${
                row.overdue ? "health-overdue has-overdue" : "health-overdue"
              }`}
            >
              {row.overdue} overdue
            </span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function MainDashboard({ user }: { user: User }) {
  const { organizationId } = useParams();
  const base = organizationId ? "/app/organizations/" + organizationId : "/app";
  const roles = new Set(user.roles);
  const contractorOnly = ["CONTRACTOR_ADMIN", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"].some((role) => roles.has(role))
    && !["ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "UNIT_CHECKER", "AUDITOR"].some((role) => roles.has(role));
  const isMaker = [...roles].some((role) => role.endsWith("_MAKER"));
  const isChecker = [...roles].some((role) => role.endsWith("_CHECKER"));
  const isAuditor = roles.has("AUDITOR");
  const unitScopedOperator = !contractorOnly
    && !roles.has("ORGANIZATION_ADMIN")
    && !roles.has("UNIT_ADMIN")
    && !roles.has("AUDITOR")
    && (roles.has("UNIT_MAKER") || roles.has("UNIT_CHECKER"));
  const scopedKind = contractorOnly ? "CONTRACTOR" : unitScopedOperator ? "UNIT" : null;
  const scopedRole = contractorOnly
    ? (roles.has("CONTRACTOR_MAKER") ? "CONTRACTOR_MAKER" : "CONTRACTOR_CHECKER")
    : (roles.has("UNIT_MAKER") ? "UNIT_MAKER" : "UNIT_CHECKER");
  const scopedIds = contractorOnly
    ? (user.contractor_context?.options.map((option) => option.id) ?? user.scopes.filter((scope) => scope.role === scopedRole && scope.scope_type === "CONTRACTOR").map((scope) => scope.scope_id))
    : user.scopes.filter((scope) => scope.role === scopedRole && scope.scope_type === scopedKind).map((scope) => scope.scope_id);
  const initialScopedId = contractorOnly
    ? user.contractor_context?.active_contractor_id ?? scopedIds[0] ?? ""
    : scopedIds[0] ?? "";
  const [filters, setFilters] = useState<DashboardFilters>({
    unit_id: unitScopedOperator ? initialScopedId : "",
    entity_id: "",
    contractor_id: contractorOnly ? initialScopedId : "",
    period_key: "",
  });
  const [tableFilters, setTableFilters] = useState({ status: "", frequency: "", subjectId: "", q: "", page: 1 });
  const title = contractorOnly
    ? "Contractor compliance dashboard"
    : isChecker
      ? "Compliance approval dashboard"
      : isMaker
        ? "My compliance dashboard"
        : isAuditor
          ? "Compliance audit dashboard"
          : "Compliance dashboard";
  const worklistPath = contractorOnly ? "compliances/contractor" : "compliances/company";
  const overview = useQuery({
    // Context belongs in the cache key as a second layer of protection against
    // stale cards during organization impersonation or contractor switching.
    queryKey: ["dashboard-overview", user.id, user.organization_id, user.contractor_context?.active_contractor_id ?? "all", filters, tableFilters],
    queryFn: () => morax.dashboardOverview({
      ...filters,
      table_status: tableFilters.status,
      table_frequency: tableFilters.frequency,
      table_subject_id: tableFilters.subjectId,
      table_q: tableFilters.q,
      table_page: String(tableFilters.page),
      table_page_size: "25",
    }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const data = overview.data;
  const summary = data?.summary;
  const scopedOptions = scopedKind === "CONTRACTOR"
    ? (data?.filters.contractors ?? []).filter((item) => scopedIds.includes(item.id))
    : (data?.filters.units ?? []).filter((item) => scopedIds.includes(item.id));

  // A scoped operator must never default to a combined multi-entity view.
  // Persist their last valid choice per account, but only when it is still in
  // the backend-authorized options returned for the active session.
  useEffect(() => {
    if (!scopedKind || !scopedOptions.length) return;
    const storageKey = `morax-dashboard-${user.id}-${scopedKind.toLowerCase()}`;
    const saved = localStorage.getItem(storageKey);
    const selected = scopedKind === "CONTRACTOR" ? filters.contractor_id : filters.unit_id;
    const valid = scopedOptions.some((item) => item.id === selected);
    const next = valid ? selected : scopedOptions.some((item) => item.id === saved) ? saved! : scopedOptions[0].id;
    if (next !== selected) {
      setFilters((current) => scopedKind === "CONTRACTOR"
        ? { ...current, contractor_id: next, entity_id: "", period_key: "" }
        : { ...current, unit_id: next, entity_id: "", contractor_id: "", period_key: "" });
    }
  }, [scopedKind, scopedOptions.map((item) => item.id).join("|"), user.id]);

  const changeUnit = (unit_id: string) =>
    setFilters({ unit_id, entity_id: "", contractor_id: "", period_key: "" });
  const changeEntity = (entity_id: string) =>
    setFilters((current) => ({
      ...current,
      entity_id,
      contractor_id: "",
      period_key: "",
    }));
  const changeContractor = (contractor_id: string) =>
    setFilters((current) => ({ ...current, contractor_id, period_key: "" }));
  const changePeriod = (period_key: string) =>
    setFilters((current) => ({ ...current, period_key }));
  const setTableFilter = (patch: Partial<typeof tableFilters>) => setTableFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  const toggleTableStatus = (status: string) => setTableFilters((current) => ({ ...current, status: current.status === status ? "" : status, page: 1 }));
  const toggleTableFrequency = (frequency: string) => setTableFilters((current) => ({ ...current, frequency: current.frequency === frequency ? "" : frequency, page: 1 }));
  const toggleTableEntity = (subjectId: string) => setTableFilters((current) => ({ ...current, subjectId: current.subjectId === subjectId ? "" : subjectId, page: 1 }));
  const changeScopedEntity = (entityId: string) => {
    if (!scopedKind) return;
    localStorage.setItem(`morax-dashboard-${user.id}-${scopedKind.toLowerCase()}`, entityId);
    setFilters((current) => scopedKind === "CONTRACTOR"
      ? { ...current, contractor_id: entityId, entity_id: "", period_key: "" }
      : { ...current, unit_id: entityId, entity_id: "", contractor_id: "", period_key: "" });
  };

  return (
    <div className="modern-page dashboard-page">
      <WorkspacePageHeader
        title={title}
        actions={
          <button
            className="button-secondary"
            onClick={() => overview.refetch()}
            disabled={overview.isFetching}
          >
            <RefreshCw
              size={16}
              className={overview.isFetching ? "spin" : ""}
            />
            Refresh
          </button>
        }
      />
      <InlineError
        message={overview.error instanceof Error ? overview.error.message : ""}
      />

      {scopedKind ? scopedOptions.length > 1 && <DashboardSection
        title={`${scopedKind === "UNIT" ? "Unit" : "Contractor"} dashboard`}
        description="Showing only the selected entity that is assigned to you."
        className="dashboard-filter-section"
      >
        <div className="dashboard-filter-grid scoped-dashboard-selector"><label>
          {scopedKind === "UNIT" ? "Unit" : "Contractor"}
          <select value={scopedKind === "UNIT" ? filters.unit_id : filters.contractor_id} onChange={(event) => changeScopedEntity(event.target.value)}>
            {scopedOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label></div>
      </DashboardSection> : <DashboardSection
        title="Dashboard filters"
        description="Selections update every dashboard metric and insight automatically."
        className="dashboard-filter-section"
      >
        <div className="dashboard-filter-grid">
          {!contractorOnly && <label>
            Organization unit
            <select
              value={filters.unit_id}
              onChange={(event) => changeUnit(event.target.value)}
            >
              <option value="">All organization units</option>
              {data?.filters.units.map((unit) => (
                <option value={unit.id} key={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>}
          <label>
            Entity
            <select
              value={filters.entity_id}
              onChange={(event) => changeEntity(event.target.value)}
            >
              <option value="">All accessible entities</option>
              {data?.filters.entities.map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.name} · {humanize(entity.entity_type)}
                </option>
              ))}
            </select>
          </label>
          {data?.filters.contractors.length !== 1 && <label>
            Contractor
            <select
              value={filters.contractor_id}
              onChange={(event) => changeContractor(event.target.value)}
            >
              <option value="">All contractors</option>
              {data?.filters.contractors.map((contractor) => (
                <option value={contractor.id} key={contractor.id}>
                  {contractor.name}
                </option>
              ))}
            </select>
          </label>}
          <label>
            Period
            <select
              value={filters.period_key}
              onChange={(event) => changePeriod(event.target.value)}
            >
              <option value="">All periods</option>
              {data?.filters.periods.map((period) => (
                <option value={period} key={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>
        </div>
      </DashboardSection>}

      {overview.isLoading && !data ? (
        <DashboardSection title="Loading compliance health">
          <LoadingSkeleton rows={6} />
        </DashboardSection>
      ) : (
        <>
          <section
            className="dashboard-metric-grid"
            aria-label="Compliance overview"
          >
            <DashboardMetricCard
              label="Total obligations"
              value={summary?.total ?? 0}
              helper="Selected scope"
              onClick={() => setTableFilters((current) => ({ ...current, status: "", frequency: "", subjectId: "", page: 1 }))}
              active={!tableFilters.status && !tableFilters.frequency && !tableFilters.subjectId}
            />
            <DashboardMetricCard
              label="Completed"
              value={summary?.completed ?? 0}
              helper={(summary?.completion_rate ?? 0) + "% compliance"}
              tone="success"
              onClick={() => toggleTableStatus("COMPLETED_ALL")}
              active={tableFilters.status === "COMPLETED_ALL"}
            />
            <DashboardMetricCard
              label="Pending action"
              value={summary?.pending ?? 0}
              helper="Drafts and corrections"
              tone="warning"
              onClick={() => toggleTableStatus("PENDING_ACTION")}
              active={tableFilters.status === "PENDING_ACTION"}
            />
            {isChecker && <DashboardMetricCard
              label="Awaiting my review"
              value={summary?.awaiting_review ?? 0}
              helper="Maker submissions requiring a decision"
              tone="warning"
              onClick={() => toggleTableStatus("AWAITING_REVIEW")}
              active={tableFilters.status === "AWAITING_REVIEW"}
            />}
            {isMaker && <DashboardMetricCard
              label="Returned / rejected"
              value={summary?.rejected ?? 0}
              helper="Review remarks need attention"
              tone="critical"
              onClick={() => toggleTableStatus("REJECTED")}
              active={tableFilters.status === "REJECTED"}
            />}
            <DashboardMetricCard
              label="Overdue"
              value={summary?.overdue ?? 0}
              helper="Needs immediate attention"
              tone="critical"
              onClick={() => toggleTableStatus("OVERDUE")}
              active={tableFilters.status === "OVERDUE"}
            />
            <DashboardMetricCard
              label="Due today"
              value={summary?.due_today ?? 0}
              helper="Deadline is today"
              tone="warning"
              onClick={() => toggleTableStatus("DUE_TODAY")}
              active={tableFilters.status === "DUE_TODAY"}
            />
            <DashboardMetricCard
              label="Due in 7 days"
              value={summary?.due_soon ?? 0}
              helper="Excludes obligations due today"
              tone="attention"
              onClick={() => toggleTableStatus("DUE_SOON")}
              active={tableFilters.status === "DUE_SOON"}
            />
            <DashboardMetricCard
              label="Upcoming"
              value={summary?.upcoming ?? 0}
              helper="More than 7 days remaining"
              tone="attention"
              onClick={() => toggleTableStatus("UPCOMING")}
              active={tableFilters.status === "UPCOMING"}
            />
            <DashboardMetricCard
              label="Not applicable"
              value={summary?.not_applicable ?? 0}
              helper="Excluded with a recorded reason"
              onClick={() => toggleTableStatus("NOT_APPLICABLE")}
              active={tableFilters.status === "NOT_APPLICABLE"}
            />
          </section>

          <PremiumComplianceAnalytics
            status={data?.status_distribution ?? []}
            frequency={data?.frequency_distribution ?? []}
            entities={contractorOnly || Boolean(filters.contractor_id) ? data?.contractor_health ?? [] : (data?.entity_health ?? []).filter((item) => item.entity_type === "UNIT")}
            entityLabel={contractorOnly || Boolean(filters.contractor_id) ? "Contractor" : "Unit"}
            total={summary?.total ?? 0}
            completionRate={summary?.completion_rate ?? 0}
            selectedStatus={tableFilters.status}
            selectedFrequency={tableFilters.frequency}
            selectedEntityId={tableFilters.subjectId}
            onStatusToggle={toggleTableStatus}
            onFrequencyToggle={toggleTableFrequency}
            onEntityToggle={toggleTableEntity}
          />
          <section className="dashboard-layout dashboard-two-column">
            <DashboardSection
              title="Upcoming deadlines"
              description="Open obligations due over the next 14 days."
              action={
                <Link
                  className="text-link"
                  to={base + "/" + worklistPath}
                >
                  View worklist
                </Link>
              }
            >
              {data?.upcoming.length ? (
                <div className="deadline-list">
                  {data.upcoming.slice(0, 8).map((item) => (
                    <Link
                      className="deadline-item"
                      key={item.id}
                      to={base + "/compliances/detail/" + item.id}
                    >
                      <span className="deadline-icon">
                        <CalendarClock size={18} />
                      </span>
                      <span className="deadline-copy">
                        <b>{item.compliance_name}</b>
                        <small>
                          {item.subject_name} · {humanize(item.frequency)}
                        </small>
                      </span>
                      <span className="deadline-date">
                        {formatDate(item.due_date)}
                        <small>
                          {item.display_status === "DUE_TODAY"
                            ? "Due today"
                            : item.display_status === "DUE_SOON"
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
                  description="No open obligations are due in the next 14 days for this scope."
                  icon={CheckCircle2}
                />
              )}
            </DashboardSection>
          </section>

          <DashboardSection
            title="Compliance records"
            description="Analytics selections filter this authorized record list immediately."
            className="dashboard-records-section"
            action={
              <button className="button-secondary compact-action" type="button" onClick={() => setTableFilters({ status: "", frequency: "", subjectId: "", q: "", page: 1 })}>Reset filters</button>
            }
          >
            <div className="dashboard-records-toolbar"><label className="table-search"><input value={tableFilters.q} onChange={(event) => setTableFilter({ q: event.target.value })} placeholder="Search compliance or entity" /></label><span>{data?.table.total ?? 0} matching records</span></div>
            {data?.table.items.length ? <div className="modern-table-wrap"><table className="modern-table"><thead><tr><th>Compliance</th><th>Entity</th><th>Frequency</th><th>Due date</th><th>Status</th><th>Risk</th></tr></thead><tbody>{data.table.items.map((item) => <tr key={item.id}><td><b>{item.compliance_name}</b><small>{item.compliance_id}</small></td><td>{item.subject_name}</td><td>{humanize(item.frequency)}</td><td className={item.is_overdue ? "table-due overdue" : "table-due"}>{formatDate(item.due_date)}</td><td><span className="status-badge neutral">{humanize(item.display_status ?? item.status)}</span></td><td>{humanize(item.risk_level)}</td></tr>)}</tbody></table></div> : <EmptyState title="No matching compliance records" description="Change or reset an analytics selection to see records in your authorized scope." />}
            <div className="pagination-row"><span>Page {data?.table.page ?? 1} of {Math.max(1, Math.ceil((data?.table.total ?? 0) / (data?.table.page_size ?? 25)))}</span><div><button className="button-secondary" type="button" disabled={(data?.table.page ?? 1) <= 1} onClick={() => setTableFilter({ page: Math.max(1, tableFilters.page - 1) })}>Previous</button><button className="button-secondary" type="button" disabled={(data?.table.page ?? 1) >= Math.max(1, Math.ceil((data?.table.total ?? 0) / (data?.table.page_size ?? 25)))} onClick={() => setTableFilter({ page: tableFilters.page + 1 })}>Next</button></div></div>
          </DashboardSection>
        </>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert, Clock3, PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { DashboardHealth } from "../api/morax";
import { DashboardSection, EmptyState, humanize } from "./workspace-ui";

type Distribution = { name: string; value: number };
type SortKey = "rate" | "overdue";

const statusMeta: Record<string, { label: string; color: string }> = {
  DUE: { label: "Due", color: "#C9952F" },
  OVERDUE: { label: "Overdue", color: "#C2413A" },
  COMPLETED: { label: "Completed", color: "#168454" },
  COMPLETED_LATE: { label: "Completed late", color: "#5E9D73" },
  PENDING_FOR_APPROVAL: { label: "Pending for approval", color: "#5B7FD6" },
  REJECTED_BY_CHECKER: { label: "Rejected by Checker", color: "#A855B7" },
  NOT_APPLICABLE: { label: "Not applicable", color: "#718096" },
};

const statusDetails = (name: string) => statusMeta[name] ?? { label: humanize(name), color: "#667067" };
const percent = (value: number, total: number) => total ? Math.round((value / total) * 100) : 0;

export function PremiumComplianceAnalytics({
  status,
  frequency,
  entities,
  entityLabel,
  total,
  completionRate,
  selectedStatus,
  selectedFrequency,
  selectedEntityId,
  onStatusToggle,
  onFrequencyToggle,
  onEntityToggle,
}: {
  status: Distribution[];
  frequency: Distribution[];
  entities: DashboardHealth[];
  entityLabel: "Unit" | "Contractor" | "Entity";
  total: number;
  completionRate: number;
  selectedStatus: string;
  selectedFrequency: string;
  selectedEntityId: string;
  onStatusToggle: (status: string) => void;
  onFrequencyToggle: (frequency: string) => void;
  onEntityToggle: (entityId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [sortDescending, setSortDescending] = useState(true);
  const frequencyTotal = frequency.reduce((sum, item) => sum + item.value, 0);
  const maxFrequency = Math.max(1, ...frequency.map((item) => item.value));
  const sortedEntities = useMemo(
    () => [...entities].sort((left, right) => {
      const comparison = sortKey === "rate" ? left.rate - right.rate : left.overdue - right.overdue;
      return sortDescending ? -comparison : comparison;
    }),
    [entities, sortDescending, sortKey],
  );
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDescending((current) => !current);
    else {
      setSortKey(key);
      setSortDescending(true);
    }
  };

  return <section className="dashboard-layout dashboard-premium-analytics" aria-label="Compliance analytics">
    <DashboardSection title="Compliance status" description="Select a segment to filter the records below." className="premium-analytics-card status-analytics-card">
      {status.length ? <div className="premium-status-layout">
        <div className="premium-donut-wrap">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={status}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={88}
                paddingAngle={3}
                cornerRadius={7}
                stroke="var(--surface)"
                strokeWidth={2}
                onClick={(entry) => onStatusToggle(String((entry as Distribution).name))}
              >
                {status.map((entry) => <Cell className={selectedStatus === entry.name ? "is-selected" : ""} cursor="pointer" fill={statusDetails(entry.name).color} key={entry.name} />)}
              </Pie>
              <Tooltip
                cursor={false}
                contentStyle={{ borderRadius: 10, border: "1px solid #D9E4D6", boxShadow: "0 12px 28px rgb(35 67 50 / 14%)" }}
                formatter={(value, _name, item) => {
                  const count = Number(value ?? 0);
                  return [`${count} (${percent(count, total)}%)`, statusDetails(String(item.payload?.name ?? "Status")).label];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="premium-donut-center" aria-label={`${total} total obligations, ${completionRate}% completed`}>
            <b>{total}</b><span>Total</span><small>{completionRate}% completed</small>
          </div>
        </div>
        <div className="premium-status-legend" role="list" aria-label="Status legend">
          {status.map((item) => {
            const detail = statusDetails(item.name);
            const active = selectedStatus === item.name;
            return <button key={item.name} type="button" className={`premium-legend-item ${active ? "is-active" : ""}`} onClick={() => onStatusToggle(item.name)} aria-pressed={active}>
              <span className="legend-color" style={{ background: detail.color }} /><span className="legend-label">{detail.label}</span><b>{item.value}</b><small>{percent(item.value, total)}%</small>{active && <Check size={13} aria-hidden="true" />}
            </button>;
          })}
        </div>
      </div> : <EmptyState title="No status analytics" description="No obligations match the current dashboard scope." icon={PieChartIcon} />}
    </DashboardSection>

    <DashboardSection title="Frequency distribution" description="Select a schedule to filter the records below." className="premium-analytics-card frequency-analytics-card">
      {frequency.length ? <div className="premium-frequency-list" role="list">
        {frequency.map((item, index) => {
          const active = selectedFrequency === item.name;
          return <button key={item.name} type="button" className={`premium-frequency-row ${active ? "is-active" : ""}`} onClick={() => onFrequencyToggle(item.name)} aria-pressed={active}>
            <span className="frequency-name">{humanize(item.name)}</span>
            <span className="frequency-track"><span className={`frequency-fill fill-${index % 5}`} style={{ width: `${Math.max(4, item.value / maxFrequency * 100)}%` }} /></span>
            <b>{item.value}</b><small>{percent(item.value, frequencyTotal)}%</small>{active && <Check size={13} aria-hidden="true" />}
          </button>;
        })}
      </div> : <EmptyState title="No frequency analytics" description="No configured schedules match the current dashboard scope." icon={Clock3} />}
    </DashboardSection>

    <DashboardSection title={`${entityLabel} performance`} description="Select a row to filter the records below." className="premium-analytics-card entity-analytics-card">
      {entities.length ? <div className="premium-entity-summary-wrap"><table className="premium-entity-summary"><thead><tr><th>{entityLabel}</th><th>Due</th><th><button type="button" onClick={() => toggleSort("overdue")}>Overdue {sortKey === "overdue" ? sortDescending ? <ChevronDown size={13} /> : <ChevronUp size={13} /> : null}</button></th><th>Completed</th><th><button type="button" onClick={() => toggleSort("rate")}>Rate {sortKey === "rate" ? sortDescending ? <ChevronDown size={13} /> : <ChevronUp size={13} /> : null}</button></th></tr></thead><tbody>{sortedEntities.map((entity) => {
        const active = selectedEntityId === entity.id;
        return <tr key={entity.id} className={active ? "is-active" : ""} onClick={() => onEntityToggle(entity.id)} tabIndex={0} role="button" aria-pressed={active} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEntityToggle(entity.id); } }}><td><span className="entity-row-name">{entity.name}{active && <Check size={13} aria-hidden="true" />}</span></td><td>{entity.due ?? 0}</td><td className={entity.overdue ? "entity-overdue" : ""}>{entity.overdue}</td><td>{entity.completed}</td><td><span className="entity-rate"><span><i style={{ width: `${entity.rate}%` }} /></span><b>{entity.rate}%</b></span></td></tr>;
      })}</tbody></table></div> : <EmptyState title={`No ${entityLabel.toLowerCase()} performance data`} description="Generate obligations to compare the selected scope." icon={CircleAlert} />}
    </DashboardSection>
  </section>;
}

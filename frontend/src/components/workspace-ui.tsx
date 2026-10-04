import { useEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import GradientText from "./GradientText/GradientText";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { SpecularCard } from "./specular-card";
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileCheck2,
  Inbox,
  X,
} from "lucide-react";

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
}

export function ComplianceStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes("overdue") || normalized.includes("rejected")
    ? "critical"
    : normalized.includes("approved") || normalized.includes("completed")
      ? "success"
      : normalized.includes("review") || normalized.includes("submitted") || normalized.includes("approval")
        ? "warning"
        : normalized.includes("correction")
          ? "critical"
          : "neutral";

  const label = normalized.includes("pending_for_approval")
    ? "Awaiting Approval"
    : humanize(status);

  return <span className={`status-badge ${tone}`}>{label}</span>;
}

export function WorkspacePageHeader({
  eyebrow = "MORAX WORKSPACE",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div>
        <p className="eyebrow" style={{ fontWeight: 'bold' }}>
          <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>{eyebrow}</GradientText>
        </p>
        <h1 style={{ fontWeight: 'bold' }}>
          <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>{title}</GradientText>
        </h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

const metricIcons: Record<string, Icon> = {
  total: FileCheck2,
  success: CheckCircle2,
  warning: Clock3,
  attention: Clock3,
  critical: CircleAlert,
};

export function DashboardMetricCard({
  label,
  value,
  helper,
  tone = "total",
}: {
  label: string;
  value: number | string;
  helper?: string;
  tone?: "total" | "success" | "warning" | "attention" | "critical";
}) {
  const Icon = metricIcons[tone];
  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);

  useEffect(() => {
    if (typeof value === "number") {
      const animation = animate(count, value, { duration: 1.5, ease: "easeOut" });
      return animation.stop;
    }
  }, [value, count]);

  return (
    <motion.article
      className={`dashboard-metric ${tone}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ padding: 0, border: "none" }}
    >
      <SpecularCard style={{ padding: "1.05rem" }}>
        <span className="metric-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <div>
          <p>{label}</p>
          <strong>
            {typeof value === "number" ? <motion.span>{rounded}</motion.span> : value}
          </strong>
          {helper && <small>{helper}</small>}
        </div>
      </SpecularCard>
    </motion.article>
  );
}

export function DashboardSection({

  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`dashboard-section ${className}`}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-line" key={index} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  icon?: Icon;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="inline-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  );
}

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button className="filter-chip" type="button" onClick={onRemove}>
      {label}
      <X size={14} aria-hidden="true" />
      <span className="sr-only">Remove filter</span>
    </button>
  );
}

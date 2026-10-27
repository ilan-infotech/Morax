import { useCallback, useDeferredValue, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import ElasticMesh from "./components/ElasticMesh/ElasticMesh";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MoltenMetal from "./components/MoltenMetal/MoltenMetal";
import GradientText from "./components/GradientText/GradientText";
import Shuffle from "./components/Shuffle/Shuffle";
import type { FormEvent, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  Bell,
  BookOpenCheck,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardList,
  ClipboardCheck,
  History,
  FileArchive,
  FileText,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Settings as SettingsIcon,
  ShieldCheck,
  Users as UsersIcon,
  Download,
  RefreshCw,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Eye,
  EyeOff,
  MessageSquarePlus,
  KeyRound,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { setToken } from "./api/client";
import { morax } from "./api/morax";
import type { Evidence, Instance, Master, RoleScope, User } from "./api/morax";
import { CheckerDashboard, ModernWorklist, MyReviewHistory, MySubmissions, PendingReviews } from "./components/modern-compliance-pages";
import { MainDashboard } from "./components/filtered-dashboard";
import { ModernEntities } from "./components/entity-manager";
import { UserAccessManager } from "./components/user-access-manager";
import { ComplianceMasterManager } from "./components/compliance-master-manager";
import { DashboardMetricCard, DashboardSection, EmptyState, InlineError, LoadingSkeleton, WorkspacePageHeader } from "./components/workspace-ui";
import { DocumentLibrary } from "./components/document-library";
import { PasswordInput } from "./components/password-input";
import { SupportTicketManager } from "./components/support-ticket-manager";
import { NotificationBell, NotificationsPage } from "./components/notification-center";
import { ChangePasswordPage, ProfileManager } from "./components/profile-manager";
import "./App.css";

type Row = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);
const message = (error: unknown, fallback = "Request failed") =>
  error instanceof Error ? error.message : fallback;
const ErrorBox = ({ text }: { text: string }) =>
  text ? (
    <p className={`alert ${text.startsWith("Success:") ? "success" : "error"}`}>
      {text}
    </p>
  ) : null;
const Badge = ({ text }: { text: string }) => (
  <span className={`badge ${text.toLowerCase()}`}>
    {text.replaceAll("_", " ")}
  </span>
);
const Header = ({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) => (
  <header className="page-header">
    <div>
      <p className="eyebrow" style={{ fontWeight: 'bold' }}>
        <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>MORAX WORKSPACE</GradientText>
      </p>
      <h1 style={{ fontWeight: 'bold' }}>
        <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>{title}</GradientText>
      </h1>
    </div>
    {children}
  </header>
);
const Panel = ({ children }: { children: ReactNode }) => (
  <section className="panel">{children}</section>
);
const canManage = (user: User) =>
  user.platform_role === "MORAX_ADMIN" ||
  user.roles.some((role) =>
    ["ORGANIZATION_ADMIN", "UNIT_ADMIN"].includes(role),
  );
const canManageEntity = (user: User) =>
  user.platform_role === "MORAX_ADMIN" ||
  user.roles.includes("ORGANIZATION_ADMIN");
const canCheck = (user: User) =>
  user.platform_role === "MORAX_ADMIN" ||
  user.roles.some((role) =>
    [
      "ORGANIZATION_ADMIN",
      "UNIT_ADMIN",
      "UNIT_CHECKER",
    ].includes(role),
  );
const subjectLabel = (type: string) =>
  type === "CONTRACTOR_SITE"
    ? "Contractor site"
    : type[0] + type.slice(1).toLowerCase();
const objectToForm = (row: Row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value == null ? "" : String(value),
    ]),
  ) as Record<string, string>;
const payload = (form: Record<string, string>, numbers: string[] = []) =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [
      key,
      numbers.includes(key) ? Number(value || 0) : value === "" ? null : value,
    ]),
  );

export function UserProfileDropdown({ user, logout, organizationName }: { user: User; logout: () => void; organizationName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const organizationMatch = location.pathname.match(/\/app\/organizations\/([^/]+)/);
  const profileBase = organizationMatch ? `/app/organizations/${organizationMatch[1]}` : "/app";

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    menuRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        className="topbar-user"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, outline: 'none', display: 'flex', alignItems: 'center', gap: '0.65rem' }}
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <span className="avatar">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
          <b>{user.name}</b>
          <small>
            {user.platform_role || user.roles[0] || "Workspace user"}
          </small>
        </span>
        <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            tabIndex={-1}
            role="menu"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "0.5rem",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              padding: "24px",
              zIndex: 50,
              width: "320px",
              maxWidth: "calc(100vw - 2rem)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              outline: "none"
            }}
          >
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#2A3620",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.75rem",
              fontWeight: "bold"
            }}>
              {user.name.slice(0, 1).toUpperCase()}
            </div>

            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
              <strong style={{ fontSize: "1.1rem", color: "#111827", fontFamily: "inherit" }}>{user.name}</strong>
              <span style={{ fontSize: "0.85rem", color: "#6b7280", fontFamily: "inherit" }}>{user.platform_role || user.roles[0] || "Workspace user"}</span>
            </div>

            {organizationName && (
              <div style={{
                width: "100%",
                background: "#f3f4f6",
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "inherit" }}>Organization</span>
                <span style={{ fontSize: "0.9rem", color: "#111827", fontWeight: 500, fontFamily: "inherit" }}>{organizationName}</span>
              </div>
            )}

            <div className="profile-dropdown-actions" style={{ width: "100%", display: "grid", gap: "8px" }}>
              <button type="button" onClick={() => { setIsOpen(false); navigate(`${profileBase}/profile`); }}><UserRound size={17} />My Profile</button>
              <button type="button" onClick={() => { setIsOpen(false); navigate(`${profileBase}/change-password`); }}><KeyRound size={17} />Change Password</button>
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              style={{
                width: "100%",
                background: "#ef4444",
                color: "white",
                border: "none",
                padding: "12px",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "1rem",
                fontWeight: 500,
                marginTop: "4px",
                fontFamily: "inherit"
              }}
            >
              <LogOut size={18} />
              Log Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Login({ done }: { done: (user: User) => void }) {
  const [email, setEmail] = useState("admin@morax.example.com");
  const [password, setPassword] = useState("Admin@123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const response = await morax.login(email, password);
      setToken(response.access_token);
      done(response.user);
    } catch (err) {
      setError(message(err, "Login failed"));
    }
  }
  return (
    <main className="login-shell" style={{ position: "relative", overflow: "hidden", background: "transparent" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: -1, backgroundColor: "#1c2617" }}>
        <MoltenMetal
          color1="#2b3622"
          color2="#4b5a3f"
          color3="#b3bfa0"
        />
      </div>
      <div className="login-intro">
        <div className="eyebrow" style={{ margin: 0, padding: 0 }}>
          <GradientText colors={['#FFFFFF', '#D9EAD3', '#B6D7A8']}>
            MORAX · LABOUR COMPLIANCE
          </GradientText>
        </div>
        <Shuffle tag="h1" text="Every obligation. One auditable flow." textAlign="left" />
        <p style={{ marginTop: '1.25rem', lineHeight: 1.6, fontSize: '1.05rem', fontWeight: 800, maxWidth: '600px' }}>
          <GradientText colors={['#FFFFFF', '#D9EAD3', '#B6D7A8']}>
            Configure entities, govern the Compliance Master, prepare evidence, assign accountability, and complete review with confidence.
          </GradientText>
        </p>
      </div>
      <form className="login-card" onSubmit={submit}>
        <h2>Sign in</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <span className="password-input">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-visibility-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        <ErrorBox text={error} />
        <button>Sign in</button>
        <small>Demo: admin@morax.example.com / Admin@123</small>
      </form>
    </main>
  );
}

type WorkspaceFeature =
  | "dashboard"
  | "compliances.recurring"
  | "compliances.one_time"
  | "entities.units"
  | "entities.contractors"
  | "entities.sites"
  | "users"
  | "compliance_master"
  | "documents"
  | "notifications"
  | "reports"
  | "audit"
  | "settings"
  | "platform.organizations";

type WorkspaceLink = {
  label: string;
  path: string;
  feature: WorkspaceFeature;
};

const links: WorkspaceLink[] = [
  { label: "Dashboard", path: "dashboard", feature: "dashboard" },
  {
    label: "Company Compliance",
    path: "compliances/company",
    feature: "compliances.recurring",
  },
  { label: "My Submissions", path: "submissions", feature: "compliances.recurring" },
  { label: "Pending Reviews", path: "pending-reviews", feature: "compliances.recurring" },
  { label: "My Review History", path: "review-history", feature: "compliances.recurring" },
  {
    label: "Contractor Compliance",
    path: "compliances/contractor",
    feature: "compliances.recurring",
  },
  {
    label: "One-time",
    path: "compliances/one-time",
    feature: "compliances.one_time",
  },
  { label: "Units", path: "entities/units", feature: "entities.units" },
  {
    label: "Contractors",
    path: "entities/contractors",
    feature: "entities.contractors",
  },
  { label: "Sites", path: "entities/sites", feature: "entities.sites" },
  { label: "Users & access", path: "users", feature: "users" },
  {
    label: "Compliance Master",
    path: "compliance-master",
    feature: "compliance_master",
  },
  { label: "Document library", path: "documents", feature: "documents" },
  { label: "Notifications", path: "notifications", feature: "notifications" },
  { label: "Support Tickets", path: "support-tickets", feature: "notifications" },
  { label: "Reports", path: "reports", feature: "reports" },
  { label: "Audit trail", path: "audit", feature: "audit" },
  {
    label: "Organization settings",
    path: "settings",
    feature: "settings",
  },
];

const navIcons: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  "Company Compliance": CalendarClock,
  "My Submissions": ClipboardList,
  "Pending Reviews": ClipboardCheck,
  "My Review History": History,
  "Contractor Compliance": Landmark,
  "One-time": ClipboardList,
  Units: Building2,
  Contractors: Landmark,
  Sites: MapPinned,
  "Users & access": UsersIcon,
  "Compliance Master": BookOpenCheck,
  "Document library": FileArchive,
  Notifications: Bell,
  "Support Tickets": MessageSquarePlus,
  Reports: ChartNoAxesCombined,
  "Audit trail": ShieldCheck,
  "Organization settings": SettingsIcon,
  Organizations: Building2,
};

function WorkspaceNavLink({ label, to, collapsed }: { label: string; to: string; collapsed?: boolean }) {
  const Icon = navIcons[label] ?? FileText;
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `relative flex items-center gap-2 p-2 rounded-md transition-colors ${isActive ? "text-[#F5F5DC]" : "text-slate-300 hover:text-white hover:bg-slate-800"} ${collapsed ? "justify-center" : ""}`}
      title={collapsed ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="nav-highlight"
              className="absolute inset-y-0 left-0 w-1 bg-[#F5F5DC] rounded-r-md"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          {isActive && (
            <motion.div
              layoutId="nav-bg"
              className="absolute inset-0 bg-[#424B35] rounded-md -z-10"
              initial={false}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <Icon size={18} strokeWidth={2} aria-hidden="true" className="relative z-10" />
          {!collapsed && <span className="relative z-10">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function fallbackFeatures(user: User): WorkspaceFeature[] {
  if (
    user.platform_role === "MORAX_ADMIN" ||
    user.roles.includes("ORGANIZATION_ADMIN")
  )
    return links.map((link) => link.feature);
  const base: WorkspaceFeature[] = [
    "dashboard",
    "compliances.recurring",
    "compliances.one_time",
    "documents",
    "notifications",
    "settings",
  ];
  if (
    user.roles.some((role) => ["UNIT_ADMIN"].includes(role))
  )
    base.push("reports");
  if (user.roles.includes("AUDITOR")) base.push("reports", "audit");
  return base;
}

function featureSet(user: User) {
  return new Set<WorkspaceFeature>(
    ((user.features?.length ? user.features : fallbackFeatures(user)) as WorkspaceFeature[]),
  );
}

function hasFeature(user: User, feature: WorkspaceFeature) {
  return featureSet(user).has(feature);
}

function isContractorOnlyUser(user: User) {
  const contractorRoles = ["CONTRACTOR_ADMIN", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"];
  const broaderRoles = ["ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "UNIT_CHECKER"];
  return user.roles.some((role) => contractorRoles.includes(role)) &&
    !user.roles.some((role) => broaderRoles.includes(role));
}

function workspaceLinks(user: User) {
  const features = featureSet(user);
  const isMaker = user.roles.some((role) => role.includes("MAKER"));
  const isChecker = user.roles.some((role) => role.includes("CHECKER"));
  if (user.platform_role === "MORAX_ADMIN") {
    // Product administrators manage customer tenants and Product-owned
    // masters. Tenant operational pages are entered only through Login as
    // Organization, keeping the platform experience unambiguous.
    return links.filter((link) => ["dashboard", "compliance_master", "notifications", "audit"].includes(link.feature));
  }
  if (isContractorOnlyUser(user)) {
    return links.filter((link) => ["dashboard", "compliances/contractor", "notifications", "support-tickets"].includes(link.path) || (link.path === "submissions" && isMaker) || (["pending-reviews", "review-history"].includes(link.path) && isChecker));
  }
  return links.filter((link) => features.has(link.feature) && (link.path !== "submissions" || isMaker) && (!["pending-reviews", "review-history"].includes(link.path) || isChecker));
}

function defaultWorkspacePath(user: User) {
  return workspaceLinks(user)[0]?.path ?? "settings";
}

function FeatureGate({
  user,
  feature,
  children,
}: {
  user: User;
  feature: WorkspaceFeature;
  children: ReactNode;
}) {
  if (
    user.platform_role === "MORAX_ADMIN" &&
    !["platform.organizations", "dashboard", "compliance_master", "notifications", "audit"].includes(feature)
  ) {
    return (
      <Panel>
        Product administration is separate from an organization workspace. Open a customer from Organizations to manage its operational data.
      </Panel>
    );
  }
  if (isContractorOnlyUser(user) && !["dashboard", "compliances.recurring", "notifications"].includes(feature)) {
    return <Panel>Contractor access is limited to authorized Contractor Compliance.</Panel>;
  }
  if (hasFeature(user, feature)) return <>{children}</>;
  return (
    <Panel>
      This company login does not have access to this product area.
    </Panel>
  );
}

function ComplianceRoute({ user }: { user: User }) {
  const { kind } = useParams();
  if (isContractorOnlyUser(user) && kind !== "contractor") {
    return <Panel>Contractor access is limited to authorized Contractor Compliance.</Panel>;
  }
  return (
    <FeatureGate
      user={user}
      feature={kind === "one-time" ? "compliances.one_time" : "compliances.recurring"}
    >
      <ModernWorklist />
    </FeatureGate>
  );
}

function EntityRoute({ user, onImpersonate }: { user: User; onImpersonate: (userId: string) => Promise<void> }) {
  const { kind } = useParams();
  const feature =
    kind === "contractors"
      ? "entities.contractors"
      : kind === "sites"
        ? "entities.sites"
        : "entities.units";
  return (
    <FeatureGate user={user} feature={feature}>
      <ModernEntities user={user} onImpersonate={onImpersonate} />
    </FeatureGate>
  );
}

function ImpersonationBanner({
  user,
  endImpersonation,
  onChangeContractor,
}: {
  user: User;
  endImpersonation: () => Promise<void>;
  onChangeContractor?: () => void;
}) {
  const [error, setError] = useState("");
  const contractorContext = user.contractor_context;
  const roleLabel = user.roles
    .map((role) => role.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" "))
    .join(" · ");
  if (!user.impersonation?.active) return null;
  return (
    <div
      className="impersonation-banner"
      role="status"
      style={{
        background: "#fff3cd",
        border: "1px solid #e6b800",
        borderRadius: "0.5rem",
        color: "#5f4300",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        marginBottom: "1.25rem",
        padding: "0.75rem 1rem",
      }}
    >
      <div>
        <b>Viewing as: {user.name}{roleLabel ? ` · ${roleLabel}` : ""}</b>
        <div>Organization: {user.organization_name ?? "Current organization"}</div>
        {contractorContext?.active_contractor_name && <div>Contractor: {contractorContext.active_contractor_name}</div>}
        <span>
          {" "}
          You are using this user’s role and organization scope. Actions are
          audited.
        </span>
      </div>
      <div className="action-row">
        {(contractorContext?.options.length ?? 0) > 1 && onChangeContractor && (
          <button className="secondary" type="button" onClick={onChangeContractor}>Change contractor</button>
        )}
        <button
          className="secondary"
          onClick={async () => {
            try {
              await endImpersonation();
            } catch (err) {
              setError(message(err, "Could not return to administrator"));
            }
          }}
        >
          Return to administrator
        </button>
        {error && <small>{error}</small>}
      </div>
    </div>
  );
}

function ContractorWorkspaceBanner({ user, onChangeContractor }: { user: User; onChangeContractor: () => void }) {
  const context = user.contractor_context;
  if (user.impersonation?.active || !context?.active_contractor_id) return null;
  const roleLabel = user.roles
    .map((role) => role.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" "))
    .join(" / ");
  return (
    <div className="impersonation-banner" role="status">
      <div>
        <b>Contractor workspace: {context.active_contractor_name}</b>
        <div>{user.organization_name ?? "Current organization"} · {roleLabel || "Contractor user"}</div>
      </div>
      {context.options.length > 1 && (
        <button className="secondary" type="button" onClick={onChangeContractor}>Change contractor</button>
      )}
    </div>
  );
}

function ContractorContextDialog({
  user,
  open,
  selecting,
  onSelect,
  onClose,
  onExit,
}: {
  user: User;
  open: boolean;
  selecting: boolean;
  onSelect: (contractorId: string) => Promise<void>;
  onClose: () => void;
  onExit: () => Promise<void>;
}) {
  const context = user.contractor_context;
  const [selected, setSelected] = useState(
    context?.active_contractor_id ?? (context?.options.length === 1 ? context.options[0].id : ""),
  );
  const [error, setError] = useState("");
  if (!open || !context?.enabled) return null;
  const selectionRequired = context.selection_required;
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => !selectionRequired && !selecting && onClose()}>
      <section
        className="compliance-dialog contractor-context-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contractor-context-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">CONTRACTOR ACCESS</p>
            <h2 id="contractor-context-title">Select contractor workspace</h2>
            <p>Choose the contractor you want to manage in this session.</p>
          </div>
          {!selectionRequired && (
            <button className="icon-button" type="button" onClick={onClose} disabled={selecting} aria-label="Close contractor selection">
              <X size={18} />
            </button>
          )}
        </div>
        {context.options.length ? (
          <div className="contractor-context-options" role="radiogroup" aria-label="Authorized contractors">
            {context.options.map((contractor) => (
              <label key={contractor.id} className={selected === contractor.id ? "selected" : ""}>
                <input
                  type="radio"
                  name="active-contractor"
                  value={contractor.id}
                  checked={selected === contractor.id}
                  onChange={() => setSelected(contractor.id)}
                  disabled={selecting}
                />
                <span><b>{contractor.name}</b><small>{contractor.code}</small></span>
              </label>
            ))}
          </div>
        ) : (
          <p className="alert error">No active contractor is assigned to this user. Contact the Organization Admin.</p>
        )}
        {error && <p className="alert error">{error}</p>}
        <div className="dialog-footer">
          {!selectionRequired ? (
            <button className="secondary" type="button" onClick={onClose} disabled={selecting}>Cancel</button>
          ) : (
            <button
              className="secondary"
              type="button"
              disabled={selecting}
              onClick={() => onExit().catch((exitError) => setError(message(exitError, "Could not leave this session.")))}
            >
              {user.impersonation?.active ? "Return to administrator" : "Log out"}
            </button>
          )}
          <button
            className="primary-action"
            type="button"
            disabled={!selected || selecting}
            onClick={async () => {
              setError("");
              try {
                await onSelect(selected);
              } catch (selectionError) {
                setError(message(selectionError, "Could not open the selected contractor."));
              }
            }}
          >
            {selecting ? "Opening..." : "Open contractor"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Layout({
  user,
  logout,
  onImpersonate,
  endImpersonation,
  onChangeContractor,
}: {
  user: User;
  logout: () => void;
  onImpersonate: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
  onChangeContractor: () => void;
}) {
  const { organizationId } = useParams();
  const [organizationName, setOrganizationName] = useState("");
  const prefix = organizationId
    ? "/app/organizations/" + organizationId
    : "/app";
  useEffect(() => {
    morax
      .organization()
      .then((row) => setOrganizationName(String(row.name ?? "Organization context")))
      .catch(() => setOrganizationName(organizationId ? "Organization context" : ""));
  }, [organizationId, user.organization_id]);
  return (
    <main className="content">
      <header className="app-topbar">
        <div>
          <span className="topbar-context">
            {organizationId
              ? organizationName || "Organization workspace"
              : "MORAX Workspace"}
          </span>
        </div>
        <div className="topbar-actions" style={{ position: "relative" }}>
          <NotificationBell prefix={prefix} userId={user.id} />
          <UserProfileDropdown user={user} logout={logout} organizationName={organizationName || (organizationId ? "Organization workspace" : undefined)} />
        </div>
      </header>
      <ImpersonationBanner user={user} endImpersonation={endImpersonation} onChangeContractor={onChangeContractor} />
      <ContractorWorkspaceBanner user={user} onChangeContractor={onChangeContractor} />
      <Routes>
        <Route
          path="dashboard"
          element={
            <FeatureGate user={user} feature="dashboard">
              {user.roles.some((role) => role.endsWith("_CHECKER")) ? <CheckerDashboard /> : <MainDashboard user={user} />}
            </FeatureGate>
          }
        />
        <Route path="compliances/:kind" element={<ComplianceRoute user={user} />} />
        <Route path="submissions" element={<FeatureGate user={user} feature="compliances.recurring"><MySubmissions /></FeatureGate>} />
        <Route path="pending-reviews" element={<FeatureGate user={user} feature="compliances.recurring"><PendingReviews /></FeatureGate>} />
        <Route path="review-history" element={<FeatureGate user={user} feature="compliances.recurring"><MyReviewHistory /></FeatureGate>} />
        <Route
          path="compliances/detail/:id"
          element={<Detail user={user} />}
        />
        <Route
          path="entities/:kind"
          element={<EntityRoute user={user} onImpersonate={onImpersonate} />}
        />
        <Route
          path="users"
          element={
            <FeatureGate user={user} feature="users">
              <UserAccessManager user={user} onImpersonate={onImpersonate} />
            </FeatureGate>
          }
        />
        <Route
          path="compliance-master"
          element={
            <FeatureGate user={user} feature="compliance_master">
              <ComplianceMasterManager />
            </FeatureGate>
          }
        />
        <Route
          path="documents"
          element={
            <FeatureGate user={user} feature="documents">
              <DocumentLibrary user={user} />
            </FeatureGate>
          }
        />
        <Route
          path="notifications"
          element={
            <FeatureGate user={user} feature="notifications">
              <NotificationsPage />
            </FeatureGate>
          }
        />
        <Route path="support-tickets" element={<FeatureGate user={user} feature="notifications"><SupportTicketManager user={user} /></FeatureGate>} />
        <Route path="profile" element={<ProfileManager user={user} />} />
        <Route path="change-password" element={<ChangePasswordPage />} />
        <Route
          path="reports"
          element={
            <FeatureGate user={user} feature="reports">
              <Reports />
            </FeatureGate>
          }
        />
        <Route
          path="audit"
          element={
            <FeatureGate user={user} feature="audit">
              <Audit />
            </FeatureGate>
          }
        />
        <Route
          path="settings"
          element={
            <FeatureGate user={user} feature="settings">
              <Settings user={user} />
            </FeatureGate>
          }
        />
        <Route path="*" element={<Navigate to={defaultWorkspacePath(user)} replace />} />
      </Routes>
    </main>
  );
}

function Organizations({ user }: { user: User }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const deferredSearch = useDeferredValue(filters.q);
  const blank = {
    organization_name: "",
    organization_code: "",
    legal_name: "",
    registration_number: "",
    pan: "",
    gstin: "",
    registered_address: "",
    state_id: "",
    city: "",
    pincode: "",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    organization_admin_name: "",
    organization_admin_email: "",
    organization_admin_password: "",
    organization_admin_password_confirmation: "",
    compliance_start_date: today(),
    status: "ACTIVE",
  };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState("");
  const load = () =>
    morax
      .platformOrganizations(filters)
      .then(setRows)
      .catch((err) => setError(message(err)));
  useEffect(() => {
    if (user.platform_role !== "MORAX_ADMIN") return;
    morax
      .platformOrganizations({
        q: deferredSearch.trim(),
        status: filters.status,
      })
      .then(setRows)
      .catch((err) => setError(message(err)));
  }, [deferredSearch, filters.status, user.platform_role]);
  if (user.platform_role !== "MORAX_ADMIN")
    return <Panel>Platform administrator permission is required.</Panel>;
  const edit = (row: Row) => {
    setEditing(String(row.id));
    setForm({ ...blank, ...objectToForm(row) });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing && form.organization_admin_password !== form.organization_admin_password_confirmation) {
      setError("Organization Admin passwords do not match");
      return;
    }
    try {
      if (!editing) {
        const availability = await morax.emailAvailable(form.organization_admin_email);
        if (!availability.available) {
          setError("Email ID already exists.");
          return;
        }
      }
      const contactAvailability = await morax.emailAvailable(
        form.primary_contact_email,
        editing ? "ORGANIZATION" : undefined,
        editing || undefined,
      );
      if (!contactAvailability.available) {
        setError("Email ID already exists.");
        return;
      }
      const request = payload(form);
      delete request.organization_admin_password_confirmation;
      if (editing)
        await morax.updatePlatformOrganization(editing, request);
      else await morax.createPlatformOrganization(request);
      setError("Success: Organization saved");
      setEditing("");
      setForm(blank);
      load();
    } catch (err) {
      setError(message(err));
    }
  };
  return (
    <>
      <Header title="Organizations">
        <button
          className="secondary"
          onClick={() => {
            setEditing("");
            setForm(blank);
          }}
        >
          Create organization
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <div className="form-grid compact">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Name, legal name, or code"
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">All statuses</option>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </label>
          {(filters.q || filters.status) && (
            <button
              type="button"
              className="secondary"
              onClick={() => setFilters({ q: "", status: "" })}
            >
              Clear filters
            </button>
          )}
        </div>
      </Panel>
      <Panel>
        <h2>{editing ? "Edit organization" : "Create organization"}</h2>
        <form className="form-grid" onSubmit={save}>
          <label>
            Organization name
            <input
              value={form.organization_name}
              onChange={(e) =>
                setForm({ ...form, organization_name: e.target.value })
              }
              required
            />
          </label>
          <label>
            Organization code
            <input
              value={form.organization_code}
              onChange={(e) =>
                setForm({ ...form, organization_code: e.target.value })
              }
              required
            />
          </label>
          {!editing && (
            <>
              <label>
                Organization Admin name
                <input value={form.organization_admin_name} onChange={(e) => setForm({ ...form, organization_admin_name: e.target.value })} required />
              </label>
              <label>
                Organization Admin email
                <input type="email" value={form.organization_admin_email} onChange={(e) => setForm({ ...form, organization_admin_email: e.target.value })} required />
              </label>
              <label>
                Organization Admin password
                <input type="password" value={form.organization_admin_password} onChange={(e) => setForm({ ...form, organization_admin_password: e.target.value })} minLength={8} autoComplete="new-password" required />
              </label>
              <label>
                Confirm Organization Admin password
                <input type="password" value={form.organization_admin_password_confirmation} onChange={(e) => setForm({ ...form, organization_admin_password_confirmation: e.target.value })} minLength={8} autoComplete="new-password" required />
              </label>
            </>
          )}
          <label>
            Legal name
            <input
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </label>
          <label>
            Registration / CIN
            <input
              value={form.registration_number}
              onChange={(e) =>
                setForm({ ...form, registration_number: e.target.value })
              }
            />
          </label>
          <label>
            PAN
            <input
              value={form.pan}
              onChange={(e) => setForm({ ...form, pan: e.target.value })}
            />
          </label>
          <label>
            GSTIN
            <input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </label>
          <label>
            City
            <input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>
          <label>
            Pincode
            <input
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            />
          </label>
          <label>
            Compliance start
            <input
              type="date"
              value={form.compliance_start_date}
              onChange={(e) =>
                setForm({ ...form, compliance_start_date: e.target.value })
              }
            />
          </label>
          <label>
            Primary contact
            <input
              value={form.primary_contact_name}
              onChange={(e) =>
                setForm({ ...form, primary_contact_name: e.target.value })
              }
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={form.primary_contact_email}
              onChange={(e) =>
                setForm({ ...form, primary_contact_email: e.target.value })
              }
            />
          </label>
          <label>
            Contact phone
            <input
              value={form.primary_contact_phone}
              onChange={(e) =>
                setForm({ ...form, primary_contact_phone: e.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </label>
          <label className="wide">
            Registered address
            <textarea
              value={form.registered_address}
              onChange={(e) =>
                setForm({ ...form, registered_address: e.target.value })
              }
            />
          </label>
          <button>
            {editing ? "Save organization" : "Create organization"}
          </button>
        </form>
      </Panel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Code</th>
              <th>Status</th>
              <th>Contact</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <b>{String(row.organization_name)}</b>
                  <br />
                  <small>{String(row.legal_name ?? "")}</small>
                </td>
                <td>{String(row.organization_code)}</td>
                <td>
                  <Badge text={String(row.status)} />
                </td>
                <td>{String(row.primary_contact_email ?? "—")}</td>
                <td>
                  <div className="action-row">
                    <button className="secondary" onClick={() => edit(row)}>
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const result = await morax.enterPlatformOrganization(
                            String(row.id),
                          );
                          navigate(
                            `/app/organizations/${String(row.id)}/dashboard`,
                          );
                        } catch (err) {
                          setError(message(err));
                        }
                      }}
                    >
                      Manage
                    </button>
                    <button
                      className={
                        row.status === "ACTIVE" ? "danger" : "secondary"
                      }
                      onClick={async () => {
                        try {
                          await morax.setPlatformOrganizationStatus(
                            String(row.id),
                            row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          );
                          load();
                        } catch (err) {
                          setError(message(err));
                        }
                      }}
                    >
                      {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PlatformShell({
  user,
  logout,
  endImpersonation,
  children,
}: {
  user: User;
  logout: () => void;
  endImpersonation: () => Promise<void>;
  children: ReactNode;
}) {
  const [showLogout, setShowLogout] = useState(false);
  const { organizationId } = useParams();
  const prefix = organizationId
    ? "/app/organizations/" + organizationId
    : "/app";
  return (
    <main className="content">
      <header className="app-topbar">
        <span className="topbar-context">
          {organizationId
            ? "Organization workspace"
            : "Platform administration"}
        </span>
        <div className="topbar-actions" style={{ position: "relative" }}>
          <NotificationBell prefix={prefix} userId={user.id} />
          <UserProfileDropdown user={user} logout={logout} organizationName={organizationId ? "Organization workspace" : undefined} />
        </div>
      </header>
      <ImpersonationBanner user={user} endImpersonation={endImpersonation} />
      {children}
    </main>
  );
}

function OrganizationLanding({
  user,
  onLoginAsOrganization,
}: {
  user: User;
  onLoginAsOrganization: (organizationId: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState("");
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [adminPasswordTarget, setAdminPasswordTarget] = useState<Row | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deletingOrganization, setDeletingOrganization] = useState(false);
  const [adminReplacementPassword, setAdminReplacementPassword] = useState("");
  const [adminReplacementPasswordConfirmation, setAdminReplacementPasswordConfirmation] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState("");
  const [adminPasswordResetting, setAdminPasswordResetting] = useState(false);
  const [locationStates, setLocationStates] = useState<Master[]>([]);
  const [locationCities, setLocationCities] = useState<Master[]>([]);
  const [locationCitiesLoading, setLocationCitiesLoading] = useState(false);
  const [locationCitiesError, setLocationCitiesError] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const deferredSearch = useDeferredValue(filters.q);
  const blank = {
    organization_name: "",
    organization_code: "",
    legal_name: "",
    registration_number: "",
    pan: "",
    gstin: "",
    registered_address: "",
    state_id: "",
    city: "",
    pincode: "",
    primary_contact_name: "",
    primary_contact_email: "",
    primary_contact_phone: "",
    organization_admin_name: "",
    organization_admin_email: "",
    organization_admin_password: "",
    organization_admin_password_confirmation: "",
    compliance_start_date: today(),
    status: "ACTIVE",
  };
  const [form, setForm] = useState(blank);
  const organizationAdminPasswordMismatch = !editing && Boolean(form.organization_admin_password_confirmation) && form.organization_admin_password !== form.organization_admin_password_confirmation;
  const selectedOrganizationStateId = form.state_id;
  const load = () =>
    morax
      .platformOrganizations(filters)
      .then(setRows)
      .catch((err) => setError(message(err)));

  useEffect(() => {
    if (user.platform_role !== "MORAX_ADMIN") return;
    morax
      .platformOrganizations({
        q: deferredSearch.trim(),
        status: filters.status,
      })
      .then(setRows)
      .catch((err) => setError(message(err)));
  }, [deferredSearch, filters.status, user.platform_role]);
  useEffect(() => {
    if (user.platform_role !== "MORAX_ADMIN") return;
    morax.states().then(setLocationStates).catch((err) => setError(message(err, "Could not load States.")));
  }, [user.platform_role]);
  useEffect(() => {
    if (!selectedOrganizationStateId) {
      setLocationCities([]);
      setLocationCitiesError("");
      return;
    }
    let active = true;
    setLocationCitiesLoading(true);
    setLocationCitiesError("");
    morax.cities(selectedOrganizationStateId)
      .then((cities) => {
        if (active) setLocationCities(cities);
      })
      .catch((err) => {
        if (active) {
          setLocationCities([]);
          setLocationCitiesError(message(err, "Could not load City / District options."));
        }
      })
      .finally(() => {
        if (active) setLocationCitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedOrganizationStateId]);
  if (user.platform_role !== "MORAX_ADMIN")
    return <Panel>Platform administrator permission is required.</Panel>;

  const closeForm = () => {
    setShowForm(false);
    setEditing("");
    setForm(blank);
  };
  const edit = (row: Row) => {
    setEditing(String(row.id));
    setForm({ ...blank, ...objectToForm(row) });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const loginAsOrganization = async (id: string) => {
    try {
      await onLoginAsOrganization(id);
    } catch (err) {
      setError(message(err, "Could not open the Organization Admin session."));
    }
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing && form.organization_admin_password !== form.organization_admin_password_confirmation) {
      setError("Organization Admin passwords do not match");
      return;
    }
    try {
      if (!editing) {
        const availability = await morax.emailAvailable(form.organization_admin_email);
        if (!availability.available) {
          setError("Email ID already exists.");
          return;
        }
      }
      const contactAvailability = await morax.emailAvailable(
        form.primary_contact_email,
        editing ? "ORGANIZATION" : undefined,
        editing || undefined,
      );
      if (!contactAvailability.available) {
        setError("Email ID already exists.");
        return;
      }
      const request = payload(form);
      delete request.organization_admin_password_confirmation;
      if (editing)
        await morax.updatePlatformOrganization(editing, request);
      else await morax.createPlatformOrganization(request);
      setError("Success: Organization saved");
      closeForm();
      load();
    } catch (err) {
      setError(message(err));
    }
  }

  async function resetDevelopmentData(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    try {
      const result = await morax.resetPlatformOrganizationDevelopmentData(
        String(resetTarget.id),
        resetCode,
      );
      setError(`Success: ${result.message}`);
      setResetTarget(null);
      setResetCode("");
      load();
    } catch (err) {
      setError(message(err));
    } finally {
      setResetting(false);
    }
  }

  async function deleteOrganization(event: FormEvent) {
    event.preventDefault();
    if (!deleteTarget) return;
    setDeletingOrganization(true);
    try {
      const result = await morax.deletePlatformOrganization(String(deleteTarget.id), deleteCode);
      setError(`Success: ${result.message}`);
      setDeleteTarget(null);
      setDeleteCode("");
      load();
    } catch (err) {
      setError(message(err));
    } finally {
      setDeletingOrganization(false);
    }
  }

  async function resetOrganizationAdminPassword(event: FormEvent) {
    event.preventDefault();
    if (!adminPasswordTarget) return;
    if (adminReplacementPassword !== adminReplacementPasswordConfirmation) {
      setAdminPasswordError("Password and Confirm password must match.");
      return;
    }
    setAdminPasswordError("");
    setAdminPasswordResetting(true);
    try {
      const result = await morax.resetOrganizationAdminPassword(
        String(adminPasswordTarget.id),
        adminReplacementPassword,
      );
      setError(`Success: ${result.message}`);
      setAdminPasswordTarget(null);
      setAdminReplacementPassword("");
      setAdminReplacementPasswordConfirmation("");
      load();
    } catch (err) {
      setAdminPasswordError(message(err));
    } finally {
      setAdminPasswordResetting(false);
    }
  }

  return (
    <div className="platform-page">
      <Header title="Organizations">
        <div className="action-row">
          <button
            className="secondary"
            onClick={() => navigate("/app/dashboard")}
          >
            Back to workspace
          </button>
          <button
            onClick={() => {
              setShowForm(true);
              setEditing("");
              setForm(blank);
            }}
          >
            Create organization
          </button>
        </div>
      </Header>
      <ErrorBox text={error} />
      {resetTarget && (
        <Panel>
          <div className="split">
            <div>
              <h2>Reset organization data</h2>
              <p className="muted">
                This permanently clears all operational data for{" "}
                <b>{String(resetTarget.organization_name)}</b>: users, entities,
                rules, compliance history, imports, notifications, and uploaded
                files. The organization and its Product Admin setup are
                retained so you can start testing again. This action is
                available only on the local development database.
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setResetTarget(null);
                setResetCode("");
              }}
            >
              Cancel
            </button>
          </div>
          <form className="form-grid" onSubmit={resetDevelopmentData}>
            <label>
              Type organization code <code>{String(resetTarget.organization_code)}</code> to confirm
              <input
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <div className="action-row">
              <button className="danger" disabled={resetting}>
                {resetting ? "Resetting data…" : "Reset data"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={resetting}
                onClick={() => {
                  setResetTarget(null);
                  setResetCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}
      {deleteTarget && (
        <Panel>
          <div className="split">
            <div>
              <h2>Delete organization permanently</h2>
              <p className="muted">
                This permanently deletes <b>{String(deleteTarget.organization_name)}</b>, including all users, units, contractors, compliance records, documents, notifications, audit history, and stored files. This cannot be undone.
              </p>
            </div>
            <button type="button" className="secondary" disabled={deletingOrganization} onClick={() => { setDeleteTarget(null); setDeleteCode(""); }}>Cancel</button>
          </div>
          <form className="form-grid" onSubmit={deleteOrganization}>
            <label>
              Type organization code <code>{String(deleteTarget.organization_code)}</code> to permanently delete
              <input value={deleteCode} onChange={(e) => setDeleteCode(e.target.value)} autoComplete="off" required autoFocus />
            </label>
            <div className="action-row">
              <button className="danger" disabled={deletingOrganization}>
                {deletingOrganization ? "Deleting organization…" : "Delete organization permanently"}
              </button>
              <button type="button" className="secondary" disabled={deletingOrganization} onClick={() => { setDeleteTarget(null); setDeleteCode(""); }}>Cancel</button>
            </div>
          </form>
        </Panel>
      )}
      {adminPasswordTarget && createPortal(
        <div
          className="assignment-user-backdrop"
          role="presentation"
          onMouseDown={() => !adminPasswordResetting && setAdminPasswordTarget(null)}
        >
          <section
            className="crud-drawer assignment-user-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Set Organization Admin password"
            onMouseDown={(event) => event.stopPropagation()}
          >
          <div className="drawer-heading">
            <div>
              <span className="drawer-icon"><UsersIcon size={19} /></span>
              <div>
                <h2>Set Organization Admin password</h2>
              </div>
            </div>
            <button
              type="button"
              className="icon-action"
              disabled={adminPasswordResetting}
              onClick={() => setAdminPasswordTarget(null)}
              aria-label="Close password form"
            >
              <X size={18} />
            </button>
          </div>
          <form className="entity-form" onSubmit={resetOrganizationAdminPassword}>
            {adminPasswordError && <p className="alert error">{adminPasswordError}</p>}
            <div className="form-grid">
            <label>
              New password
              <PasswordInput
                value={adminReplacementPassword}
                onChange={(event) => setAdminReplacementPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm new password
              <PasswordInput
                value={adminReplacementPasswordConfirmation}
                onChange={(event) => setAdminReplacementPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            </div>
            <footer className="drawer-footer">
              <button
                type="button"
                className="secondary"
                disabled={adminPasswordResetting}
                onClick={() => {
                  setAdminPasswordTarget(null);
                  setAdminReplacementPassword("");
                  setAdminReplacementPasswordConfirmation("");
                  setAdminPasswordError("");
                }}
              >
                Cancel
              </button>
              <button disabled={adminPasswordResetting}>
                {adminPasswordResetting ? "Saving password…" : "Set new password"}
              </button>
            </footer>
          </form>
          </section>
        </div>,
        document.body,
      )}
      {showForm && (
        <Panel>
          <div className="split">
            <div>
              <h2>{editing ? "Edit organization" : "Create organization"}</h2>
            </div>
            <button className="secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
          <form className="form-grid organization-form" onSubmit={save}>
            <label>
              Organization name
              <input
                value={form.organization_name}
                onChange={(e) =>
                  setForm({ ...form, organization_name: e.target.value })
                }
                required
              />
            </label>
            {false && (editing ? (
              <label>
                Organization code
                <input value={form.organization_code} readOnly />
              </label>
            ) : (
              <label>
                Organization code
                <input value={form.organization_code || "Generating code…"} readOnly aria-label="Organization code" />
              </label>
            ))}
            {!editing && (
              <>
                <label>
                  Organization Admin name
                  <input
                    value={form.organization_admin_name}
                    onChange={(e) =>
                      setForm({ ...form, organization_admin_name: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Organization Admin email
                  <input
                    type="email"
                    value={form.organization_admin_email}
                    onChange={(e) =>
                      setForm({ ...form, organization_admin_email: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Organization Admin password
                  <PasswordInput
                    value={form.organization_admin_password}
                    onChange={(e) =>
                      setForm({ ...form, organization_admin_password: e.target.value })
                    }
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label>
                  Confirm Organization Admin password
                  <PasswordInput
                    value={form.organization_admin_password_confirmation}
                    onChange={(e) =>
                      setForm({ ...form, organization_admin_password_confirmation: e.target.value })
                    }
                    minLength={8}
                    autoComplete="new-password"
                    required
                  />
                  {organizationAdminPasswordMismatch && <small className="field-error">Password and Confirm password must match.</small>}
                </label>
              </>
            )}
            <label>
              Legal name
              <input
                value={form.legal_name}
                onChange={(e) =>
                  setForm({ ...form, legal_name: e.target.value })
                }
              />
            </label>
            <label>
              Registration / CIN
              <input
                value={form.registration_number}
                onChange={(e) =>
                  setForm({ ...form, registration_number: e.target.value })
                }
              />
            </label>
            <label>
              PAN
              <input
                value={form.pan}
                onChange={(e) => setForm({ ...form, pan: e.target.value })}
                maxLength={10}
                pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]"
                title="Enter PAN in ABCDE1234F format"
              />
            </label>
            <label>
              GSTIN
              <input
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                maxLength={15}
                pattern="[0-9A-Za-z]{15}"
                title="Enter a valid 15-character GSTIN"
              />
            </label>
            <label>
              State
              <select
                value={form.state_id}
                onChange={(e) => setForm({ ...form, state_id: e.target.value, city: "" })}
                required
              >
                <option value="">Select State</option>
                {locationStates.map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </label>
            <label>
              City / District
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                disabled={!form.state_id || locationCitiesLoading}
                required
              >
                <option value="">
                  {!form.state_id
                    ? "Select State first"
                    : locationCitiesLoading
                      ? "Loading districts…"
                      : locationCitiesError
                        ? "Districts could not be loaded"
                        : locationCities.length
                          ? "Select City / District"
                          : "No districts available"}
                </option>
                {locationCities.map((city) => (
                  <option key={city.id} value={city.name}>{city.name}</option>
                ))}
              </select>
              {locationCitiesError && <small className="field-error">{locationCitiesError}</small>}
            </label>
            <label>
              Pincode
              <input
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                title="Enter a valid 6-digit PIN code"
                required
              />
            </label>
            <label>
              Compliance start
              <input
                type="date"
                value={form.compliance_start_date}
                onChange={(e) =>
                  setForm({ ...form, compliance_start_date: e.target.value })
                }
                required
              />
            </label>
            <label>
              Primary contact
              <input
                value={form.primary_contact_name}
                onChange={(e) =>
                  setForm({ ...form, primary_contact_name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                value={form.primary_contact_email}
                onChange={(e) =>
                  setForm({ ...form, primary_contact_email: e.target.value })
                }
                required
              />
            </label>
            <label>
              Contact phone
              <input
                value={form.primary_contact_phone}
                onChange={(e) =>
                  setForm({ ...form, primary_contact_phone: e.target.value })
                }
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                minLength={10}
                maxLength={10}
                title="Enter a valid 10-digit Indian mobile number"
                required
              />
            </label>
            {editing && <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>ACTIVE</option>
                <option>INACTIVE</option>
              </select>
            </label>}
            <label className="wide">
              Registered address
              <textarea
                value={form.registered_address}
                onChange={(e) =>
                  setForm({ ...form, registered_address: e.target.value })
                }
                required
              />
            </label>
            <div className="action-row">
              <button>
                {editing ? "Save changes" : "Create organization"}
              </button>
              <button type="button" className="secondary" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      )}
      <Panel>
        <div className="form-grid compact">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Name, legal name, or code"
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">All statuses</option>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </label>
          {(filters.q || filters.status) && (
            <div className="action-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setFilters({ q: "", status: "" })}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </Panel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Code</th>
              <th>Status</th>
              <th>Organization Admin login</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <b>{String(row.organization_name)}</b>
                  <br />
                  <small>{String(row.legal_name ?? "")}</small>
                </td>
                <td>{String(row.organization_code)}</td>
                <td>
                  <Badge text={String(row.status)} />
                </td>
                <td>
                  {row.organization_admin ? (
                    <div className="entity-login-cell">
                      <b>{String((row.organization_admin as Row).name)}</b>
                      <small>{String((row.organization_admin as Row).email)}</small>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => {
                          setAdminPasswordTarget(row);
                          setAdminReplacementPassword("");
                          setAdminReplacementPasswordConfirmation("");
                          setAdminPasswordError("");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Set new password
                      </button>
                    </div>
                  ) : (
                    <span className="muted">No Organization Admin</span>
                  )}
                </td>
                <td>{String(row.primary_contact_email ?? "—")}</td>
                <td>
                  <div className="action-row">
                    <button className="secondary" onClick={() => edit(row)}>
                      View / Edit
                    </button>
                    <button
                      type="button"
                      disabled={row.status !== "ACTIVE" || !row.organization_admin}
                      onClick={() => loginAsOrganization(String(row.id))}
                    >
                      Login as Organization
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setResetTarget(row);
                        setResetCode("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Reset data
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setDeleteTarget(row);
                        setDeleteCode("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Delete organization
                    </button>
                    <button
                      className={
                        row.status === "ACTIVE" ? "danger" : "secondary"
                      }
                      onClick={async () => {
                        try {
                          await morax.setPlatformOrganizationStatus(
                            String(row.id),
                            row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          );
                          load();
                        } catch (err) {
                          setError(message(err));
                        }
                      }}
                    >
                      {row.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard() {
  const { organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [data, setData] = useState<{
    total: number;
    statuses: Record<string, number>;
    overdue: number;
    completed_late: number;
  }>();
  const [error, setError] = useState("");
  const load = () =>
    morax
      .dashboard()
      .then(setData)
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  const metrics = data
    ? [
      ["Total", data.total],
      ["Pending", data.statuses.PENDING ?? 0],
      ["In progress", data.statuses.IN_PROGRESS ?? 0],
      ["Under review", data.statuses.UNDER_REVIEW ?? 0],
      ["Overdue", data.overdue],
      ["Completed late", data.completed_late],
    ]
    : [];
  return (
    <>
      <Header title="Compliance dashboard">
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </Header>
      <ErrorBox text={error} />
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <p>{label}</p>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Panel>
        <h2>Operational control centre</h2>
        <p className="muted">
          Configure Master data, generate obligations, assign a Maker and
          Checker, then track submission through approval.
        </p>
        <div className="quick">
          <Link to={`${base}/compliances/company`}>View worklist</Link>
          <Link to={`${base}/compliance-master`}>Manage rules</Link>
          <Link to={`${base}/notifications`}>Open notifications</Link>
        </div>
      </Panel>
    </>
  );
}

function Worklist() {
  const { kind, organizationId } = useParams();
  const base = organizationId ? `/app/organizations/${organizationId}` : "/app";
  const [items, setItems] = useState<Instance[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    risk_level: "",
    entity_type: "",
  });
  const frequency = kind === "recurring" ? "MONTHLY" : "ONE_TIME";
  const load = () =>
    morax
      .instances({ ...filters, frequency })
      .then((r) => setItems(r.items))
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, [kind]);
  return (
    <>
      <Header
        title={
          kind === "one-time" ? "One-time compliance" : "Recurring compliance"
        }
      >
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <form
          className="form-grid compact"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label>
            Search
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Rule or entity"
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">All</option>
              {[
                "PENDING",
                "IN_PROGRESS",
                "SUBMITTED",
                "UNDER_REVIEW",
                "APPROVED",
                "CORRECTION_REQUIRED",
                "REJECTED",
                "NOT_APPLICABLE",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Risk
            <select
              value={filters.risk_level}
              onChange={(e) =>
                setFilters({ ...filters, risk_level: e.target.value })
              }
            >
              <option value="">All</option>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
            </select>
          </label>
          <label>
            Entity
            <select
              value={filters.entity_type}
              onChange={(e) =>
                setFilters({ ...filters, entity_type: e.target.value })
              }
            >
              <option value="">All</option>
              <option>UNIT</option>
              <option>CONTRACTOR</option>
              <option>CONTRACTOR_SITE</option>
            </select>
          </label>
          <button>Apply filters</button>
        </form>
      </Panel>
      {items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Compliance</th>
                <th>Entity</th>
                <th>Due date</th>
                <th>Risk</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <b>{i.compliance_id}</b>
                    <br />
                    <small>{i.compliance_name}</small>
                  </td>
                  <td>{i.subject_name}</td>
                  <td className={i.is_overdue ? "danger-text" : ""}>
                    {i.due_date}
                    {i.is_overdue ? ` · ${i.days_overdue}d late` : ""}
                  </td>
                  <td>{i.risk_level}</td>
                  <td>
                    <Badge text={i.display_status ?? i.status} />
                  </td>
                  <td>
                    <Link to={`${base}/compliances/detail/${i.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Panel>No compliance instances match this worklist.</Panel>
      )}
    </>
  );
}

function Detail({ user }: { user: User }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Instance>();
  const [people, setPeople] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("SUPPORTING_DOCUMENT");
  const [verifyReason, setVerifyReason] = useState("");
  const [assignment, setAssignment] = useState({ maker: "", checker: "" });
  const [form, setForm] = useState({
    filing_reference: "",
    completed_on: "",
    amount: "",
    remarks: "",
  });
  const load = () =>
    morax
      .instance(id)
      .then((r) => {
        setItem(r);
        setForm({
          filing_reference: r.activity_reference ?? "",
          completed_on: r.completed_on ?? "",
          amount: r.amount?.toString() ?? "",
          remarks: r.remarks ?? "",
        });
        const active = r.assignments ?? [];
        setAssignment({
          maker:
            active.find((a) => a.assignment_type === "MAKER")?.user_id ?? "",
          checker:
            active.find((a) => a.assignment_type === "CHECKER")?.user_id ?? "",
        });
      })
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
    morax
      .users()
      .then(setPeople)
      .catch(() => undefined);
  }, [id]);
  async function act(call: () => Promise<unknown>, success?: string) {
    try {
      await call();
      if (success) setError(`Success: ${success}`);
      await load();
    } catch (err) {
      setError(message(err, "Action failed"));
    }
  }
  if (!item) return <Panel>Loading compliance detail…</Panel>;
  const editable = ![
    "APPROVED",
    "SUBMITTED",
    "UNDER_REVIEW",
    "NOT_APPLICABLE",
  ].includes(item.status);
  const manager = canManage(user);
  const checker = canCheck(user);
  const activeAssignments = item.assignments ?? [];
  const assignedName = (type: "MAKER" | "CHECKER") =>
    people.find(
      (p) =>
        p.id ===
        activeAssignments.find((a) => a.assignment_type === type)?.user_id,
    )?.name ?? "Not assigned";
  return (
    <>
      <Header title={item.compliance_name}>
        <button className="secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </Header>
      <ErrorBox text={error} />
      <div className="detail-grid">
        <Panel>
          <div className="split">
            <div>
              <p className="eyebrow">{item.compliance_id}</p>
              <h2>{item.subject_name}</h2>
            </div>
            <Badge text={item.display_status ?? item.status} />
          </div>
          <dl>
            <dt>Frequency</dt>
            <dd>{item.frequency}</dd>
            <dt>Due date</dt>
            <dd>{item.due_date}</dd>
            <dt>Required evidence</dt>
            <dd>{item.required_document ?? "None"}</dd>
            <dt>Rule version</dt>
            <dd>{String(item.rule_snapshot?.version ?? "—")}</dd>
          </dl>
        </Panel>
        <Panel>
          <h2>Applicability</h2>
          {Object.entries(item.applicability?.matched ?? {}).map(
            ([name, matched]) => (
              <p key={name}>
                {matched ? "✓" : "×"} {name.replaceAll("_", " ")}
              </p>
            ),
          )}
        </Panel>
      </div>
      {manager && (
        <Panel>
          <h2>Assignments</h2>
          <p className="muted">
            Assign one active Maker and one active Checker. Reassigning replaces
            the existing assignment and is audited.
          </p>
          <div className="form-grid compact">
            <label>
              Maker
              <select
                value={assignment.maker}
                onChange={(e) =>
                  setAssignment({ ...assignment, maker: e.target.value })
                }
              >
                <option value="">Select Maker</option>
                {people
                  .filter((p) =>
                    p.roles.some(
                      (role) =>
                        role.includes("MAKER") ||
                        role.endsWith("_ADMIN") ||
                        ["MORAX_ADMIN", "SUPER_ADMIN"].includes(role),
                    ),
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} — {p.email}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Checker
              <select
                value={assignment.checker}
                onChange={(e) =>
                  setAssignment({ ...assignment, checker: e.target.value })
                }
              >
                <option value="">Select Checker</option>
                {people
                  .filter((p) =>
                    p.roles.some(
                      (role) =>
                        role.includes("CHECKER") ||
                        role.endsWith("_ADMIN") ||
                        ["MORAX_ADMIN", "SUPER_ADMIN"].includes(role),
                    ),
                  )
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} — {p.email}
                    </option>
                  ))}
              </select>
            </label>
            <div className="action-row">
              <button
                disabled={!assignment.maker}
                onClick={() =>
                  act(
                    () =>
                      morax.assign(id, {
                        user_id: assignment.maker,
                        assignment_type: "MAKER",
                      }),
                    "Maker assigned",
                  )
                }
              >
                Save Maker
              </button>
              <button
                disabled={!assignment.checker}
                onClick={() =>
                  act(
                    () =>
                      morax.assign(id, {
                        user_id: assignment.checker,
                        assignment_type: "CHECKER",
                      }),
                    "Checker assigned",
                  )
                }
              >
                Save Checker
              </button>
            </div>
          </div>
          <p className="muted">
            Current: Maker — {assignedName("MAKER")} · Checker —{" "}
            {assignedName("CHECKER")}
          </p>
        </Panel>
      )}
      <Panel>
        <h2>Maker activity</h2>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                morax.activity(id, {
                  ...form,
                  amount: form.amount ? Number(form.amount) : null,
                  completed_on: form.completed_on || null,
                  row_version: item.row_version,
                }),
              "Draft saved",
            );
          }}
        >
          <label>
            Filing reference
            <input
              value={form.filing_reference}
              disabled={!editable}
              onChange={(e) =>
                setForm({ ...form, filing_reference: e.target.value })
              }
            />
          </label>
          <label>
            Completed on
            <input
              type="date"
              value={form.completed_on}
              disabled={!editable}
              onChange={(e) =>
                setForm({ ...form, completed_on: e.target.value })
              }
            />
          </label>
          <label>
            Amount
            <input
              type="number"
              value={form.amount}
              disabled={!editable}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
          <label className="wide">
            Remarks
            <textarea
              value={form.remarks}
              disabled={!editable}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
          </label>
          <button disabled={!editable}>Save draft</button>
        </form>
      </Panel>
      <div className="detail-grid">
        <Panel>
          <h2>Evidence</h2>
          <div className="form-grid compact">
            <label>
              Category
              <input
                value={category}
                disabled={!editable}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
            <label>
              File
              <input
                type="file"
                disabled={!editable}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              className="secondary"
              disabled={!file || !editable}
              onClick={() =>
                file &&
                act(
                  () => morax.evidence(id, file, category),
                  "Evidence uploaded",
                )
              }
            >
              Upload evidence
            </button>
          </div>
          {item.evidence?.length ? (
            item.evidence.map((e) => (
              <EvidenceRow
                key={e.id}
                evidence={e}
                checker={checker}
                reason={verifyReason}
                setReason={setVerifyReason}
                reload={load}
                report={setError}
              />
            ))
          ) : (
            <p className="muted">No evidence uploaded.</p>
          )}
        </Panel>
        <Panel>
          <h2>Workflow</h2>
          <textarea
            placeholder="Decision comment (required for decisions)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="action-row">
            {editable && (
              <button
                onClick={() =>
                  act(() => morax.submit(id, item.row_version), "Submitted for review")
                }
              >
                Submit for review
              </button>
            )}
            {item.status === "SUBMITTED" && checker && (
              <button
                onClick={() =>
                  act(
                    () =>
                      morax.review(id, {
                        comment: note || "Review started",
                        row_version: item.row_version,
                      }),
                    "Review started",
                  )
                }
              >
                Begin review
              </button>
            )}
            {item.status === "UNDER_REVIEW" && checker && (
              <>
                <button
                  onClick={() =>
                    act(
                      () =>
                        morax.approve(id, {
                          comment: note || "Approved",
                          row_version: item.row_version,
                        }),
                      "Approved",
                    )
                  }
                >
                  Approve
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    act(
                      () =>
                        morax.correction(id, {
                          comment: note || "Correction required",
                          row_version: item.row_version,
                        }),
                      "Returned for correction",
                    )
                  }
                >
                  Request correction
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    act(
                      () =>
                        morax.reject(id, {
                          comment: note || "Rejected",
                          row_version: item.row_version,
                        }),
                      "Rejected",
                    )
                  }
                >
                  Reject
                </button>
              </>
            )}
            {manager && editable && (
              <button
                className="danger"
                onClick={() =>
                  note.trim()
                    ? act(
                      () => morax.notApplicable(id, note.trim()),
                      "Marked not applicable",
                    )
                    : setError("Enter a reason before marking not applicable")
                }
              >
                Not applicable
              </button>
            )}
          </div>
          <p className="muted">
            Required evidence must be verified by the assigned Checker before
            approval.
          </p>
        </Panel>
      </div>
      <Panel>
        <h2>Comments</h2>
        <div className="form-grid compact">
          <label className="wide">
            Add comment
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
          <button
            disabled={!comment.trim()}
            onClick={() =>
              act(async () => {
                await morax.comment(id, comment.trim());
                setComment("");
              }, "Comment added")
            }
          >
            Post comment
          </button>
        </div>
        {item.comments?.map((c) => (
          <p className="timeline" key={c.id}>
            <b>{people.find((p) => p.id === c.author_id)?.name ?? "User"}</b>
            <br />
            {c.body}
            <br />
            <small>{c.created_at}</small>
          </p>
        ))}
      </Panel>
      <Panel>
        <h2>History</h2>
        {item.history?.map((h) => (
          <p className="timeline" key={h.id}>
            <b>{h.action.replaceAll("_", " ")}</b>{" "}
            {h.to_status ? `→ ${h.to_status}` : ""}
            <br />
            <small>
              {h.created_at} {h.comment ? `— ${h.comment}` : ""}
            </small>
          </p>
        ))}
      </Panel>
    </>
  );
}

function EvidenceRow({
  evidence,
  checker,
  reason,
  setReason,
  reload,
  report,
}: {
  evidence: Evidence;
  checker: boolean;
  reason: string;
  setReason: (value: string) => void;
  reload: () => void;
  report: (value: string) => void;
}) {
  const act = async (state: "VERIFIED" | "REJECTED") => {
    if (state === "REJECTED" && !reason.trim()) {
      report("Enter a rejection reason before rejecting evidence");
      return;
    }
    try {
      await morax.verifyDocument(
        evidence.id,
        state,
        reason.trim() || undefined,
      );
      setReason("");
      await reload();
    } catch (err) {
      report(message(err));
    }
  };
  return (
    <div className="file-row">
      <b>{evidence.original_filename}</b>{" "}
      <small>
        v{evidence.version} · {evidence.category} ·{" "}
        {evidence.verification_state ?? "PENDING"}
      </small>
      <div className="action-row">
        <button
          className="secondary"
          onClick={() =>
            morax
              .downloadDocument(evidence.id, evidence.original_filename)
              .catch((err) => report(message(err)))
          }
        >
          Download
        </button>
        {checker && evidence.verification_state !== "VERIFIED" && (
          <>
            <input
              aria-label="Evidence rejection reason"
              placeholder="Rejection reason (only if rejecting)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button onClick={() => act("VERIFIED")}>Verify</button>
            <button className="danger" onClick={() => act("REJECTED")}>
              Reject evidence
            </button>
          </>
        )}
      </div>
      {evidence.verification_reason && (
        <small>Reason: {evidence.verification_reason}</small>
      )}
    </div>
  );
}

function Entities({ user }: { user: User }) {
  const { kind = "units" } = useParams();
  const [states, setStates] = useState<Master[]>([]);
  const [industries, setIndustries] = useState<Master[]>([]);
  const [units, setUnits] = useState<Row[]>([]);
  const [contractors, setContractors] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const initial = {
    name: "",
    code: "",
    unit_type: "",
    contractor_type: "",
    unit_id: "",
    contractor_id: "",
    state_id: "",
    industry_type_id: "",
    other_industry_name: "",
    city: "",
    pincode: "",
    address: "",
    registration_identifiers: "",
    gstin: "",
    pan: "",
    lin: "",
    employer_name: "",
    applicable_regulations: "",
    male_employees: "0",
    female_employees: "0",
    male_workers: "0",
    female_workers: "0",
    contact_email: "",
    contact_phone: "",
    effective_date: "",
    compliance_start_date: today(),
    status: "ACTIVE",
  };
  const [form, setForm] = useState(initial);
  const isUnit = kind === "units";
  const isSite = kind === "sites";
  const title = isUnit
    ? "Units / branches"
    : isSite
      ? "Contractor sites"
      : "Contractors";
  const otherIndustryId = industries.find(
    (industry) => industry.code.toUpperCase() === "OTHER",
  )?.id;
  const isOtherIndustry = form.industry_type_id === otherIndustryId;
  const load = () =>
    Promise.all([
      morax.states(),
      morax.industries(),
      morax.units(),
      morax.contractors(),
      morax.sites(),
    ])
      .then(([s, i, u, c, sites]) => {
        setStates(s);
        setIndustries(i);
        setUnits(u.items);
        setContractors(c);
        setRows(isUnit ? u.items : isSite ? sites : c);
      })
      .catch((err) => setError(message(err)));
  useEffect(() => {
    setSelected("");
    setForm(initial);
    load();
  }, [kind]);
  const choose = (value: string) => {
    setSelected(value);
    const row = rows.find((r) => String(r.id) === value);
    if (row) setForm({ ...initial, ...objectToForm(row) });
  };
  const remove = async (row: Row) => {
    if (!canManageEntity(user)) {
      setError("Organization administrator permission is required");
      return;
    }
    if (!window.confirm(`Delete ${String(row.name ?? "this record")}?`)) return;
    try {
      if (isUnit) await morax.deleteUnit(String(row.id));
      else if (isSite) await morax.deleteSite(String(row.id));
      else await morax.deleteContractor(String(row.id));
      setSelected("");
      setForm(initial);
      setError("Success: Entity deleted");
      load();
    } catch (err) {
      setError(message(err, "Could not delete entity"));
    }
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canManageEntity(user)) {
      setError("Organization administrator permission is required");
      return;
    }
    try {
      const body = payload(
        form,
        isUnit
          ? ["male_employees", "female_employees"]
          : ["male_workers", "female_workers"],
      );
      if (isUnit)
        selected
          ? await morax.updateUnit(selected, body)
          : await morax.createUnit(body);
      else if (isSite)
        selected
          ? await morax.updateSite(selected, body)
          : await morax.createSite(body);
      else
        selected
          ? await morax.updateContractor(selected, body)
          : await morax.createContractor(body);
      setError(`Success: ${selected ? "Entity updated" : "Entity created"}`);
      setSelected("");
      setForm(initial);
      load();
    } catch (err) {
      setError(message(err, "Could not save entity"));
    }
  }
  return (
    <>
      <Header title={title}>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <h2>
          {selected
            ? `Edit ${subjectLabel(isUnit ? "UNIT" : isSite ? "CONTRACTOR_SITE" : "CONTRACTOR")}`
            : `Add ${subjectLabel(isUnit ? "UNIT" : isSite ? "CONTRACTOR_SITE" : "CONTRACTOR")}`}
        </h2>
        {canManageEntity(user) && (
          <label>
            Existing record
            <select value={selected} onChange={(e) => choose(e.target.value)}>
              <option value="">New record</option>
              {rows.map((r) => (
                <option value={String(r.id)} key={String(r.id)}>
                  {String(r.name)} — {String(r.code)}
                </option>
              ))}
            </select>
          </label>
        )}
        <form className="form-grid" onSubmit={save}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Code
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </label>
          {isUnit && (
            <label>
              Unit type
              <input
                value={form.unit_type}
                onChange={(e) =>
                  setForm({ ...form, unit_type: e.target.value })
                }
              />
            </label>
          )}
          {!isUnit && (
            <label>
              Parent Unit
              <select
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Not linked</option>
                {units.map((r) => (
                  <option value={String(r.id)} key={String(r.id)}>
                    {String(r.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isUnit && !isSite && (
            <label>
              Contractor type
              <input
                value={form.contractor_type}
                onChange={(e) =>
                  setForm({ ...form, contractor_type: e.target.value })
                }
              />
            </label>
          )}
          {isSite && (
            <label>
              Contractor
              <select
                value={form.contractor_id}
                onChange={(e) =>
                  setForm({ ...form, contractor_id: e.target.value })
                }
                required
              >
                <option value="">Select contractor</option>
                {contractors.map((r) => (
                  <option value={String(r.id)} key={String(r.id)}>
                    {String(r.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            State
            <select
              value={form.state_id}
              onChange={(e) => setForm({ ...form, state_id: e.target.value })}
              required={isUnit || isSite}
            >
              <option value="">Not configured</option>
              {states.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Industry type
            <select
              value={form.industry_type_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  industry_type_id: e.target.value,
                  other_industry_name:
                    e.target.value === otherIndustryId
                      ? form.other_industry_name
                      : "",
                })
              }
              required={isUnit || isSite}
            >
              <option value="">Not configured</option>
              {industries.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.code.toUpperCase() === "OTHER" ? "Other industry" : i.name}
                </option>
              ))}
            </select>
          </label>
          {isOtherIndustry && (
            <label>
              Other industry name
              <input
                value={form.other_industry_name}
                onChange={(e) =>
                  setForm({ ...form, other_industry_name: e.target.value })
                }
                placeholder="Enter industry name"
                required
              />
            </label>
          )}
          <label>
            Compliance start
            <input
              type="date"
              value={form.compliance_start_date}
              onChange={(e) =>
                setForm({ ...form, compliance_start_date: e.target.value })
              }
              required={isUnit || isSite}
            />
          </label>
          <label>
            City
            <input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>
          <label>
            Pincode
            <input
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
            />
          </label>
          <label>
            GSTIN
            <input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </label>
          <label>
            PAN
            <input
              value={form.pan}
              onChange={(e) => setForm({ ...form, pan: e.target.value })}
            />
          </label>
          <label>
            LIN
            <input
              value={form.lin}
              onChange={(e) => setForm({ ...form, lin: e.target.value })}
            />
          </label>
          <label>
            Male {isUnit ? "employees" : "workers"}
            <input
              type="number"
              min="0"
              value={isUnit ? form.male_employees : form.male_workers}
              onChange={(e) =>
                setForm({
                  ...form,
                  [isUnit ? "male_employees" : "male_workers"]: e.target.value,
                })
              }
            />
          </label>
          <label>
            Female {isUnit ? "employees" : "workers"}
            <input
              type="number"
              min="0"
              value={isUnit ? form.female_employees : form.female_workers}
              onChange={(e) =>
                setForm({
                  ...form,
                  [isUnit ? "female_employees" : "female_workers"]:
                    e.target.value,
                })
              }
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </label>
          <label className="wide">
            Address
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          <label className="wide">
            Registration identifiers
            <textarea
              value={form.registration_identifiers}
              onChange={(e) =>
                setForm({ ...form, registration_identifiers: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Applicable regulations
            <textarea
              value={form.applicable_regulations}
              onChange={(e) =>
                setForm({ ...form, applicable_regulations: e.target.value })
              }
            />
          </label>
          <button disabled={!canManageEntity(user)}>
            {selected ? "Save changes" : "Add entity"}
          </button>
        </form>
      </Panel>
      <EntityTable
        rows={rows}
        onEdit={(row) => choose(String(row.id))}
        onDelete={remove}
        canEdit={canManageEntity(user)}
      />
    </>
  );
}

function EntityTable({
  rows,
  onEdit,
  onDelete,
  canEdit,
}: {
  rows: Row[];
  onEdit: (row: Row) => void;
  onDelete?: (row: Row) => void;
  canEdit: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>State</th>
            <th>Industry</th>
            <th>Workers / employees</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.name)}</td>
              <td>{String(r.code)}</td>
              <td>{String(r.state_name ?? "—")}</td>
              <td>{String(r.industry_name ?? "—")}</td>
              <td>{String(r.total_employees ?? r.total_workers ?? "—")}</td>
              <td>{String(r.status)}</td>
              <td>
                <div className="action-row">
                  <button className="secondary" onClick={() => onEdit(r)}>
                    View / Edit
                  </button>
                  {canEdit && onDelete && (
                    <button className="danger" onClick={() => onDelete(r)}>
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const roles = [
  "ORGANIZATION_ADMIN",
  "UNIT_ADMIN",
  "UNIT_MAKER",
  "UNIT_CHECKER",
  "CONTRACTOR_MAKER",
  "VIEWER",
  "AUDITOR",
];
function Users({
  user,
  onImpersonate,
}: {
  user: User;
  onImpersonate: (userId: string) => Promise<void>;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Row[]>([]);
  const [contractors, setContractors] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
  });
  const [selected, setSelected] = useState("");
  const [scopeRows, setScopeRows] = useState<RoleScope[]>([]);
  const load = () =>
    Promise.all([
      morax.users(),
      morax.units(),
      morax.contractors(),
      morax.sites(),
    ])
      .then(([rows, unitPage, contractorRows, siteRows]) => {
        setUsers(rows);
        setUnits(unitPage.items);
        setContractors(contractorRows);
        setSites(siteRows);
      })
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  const changeUser = (id: string) => {
    setSelected(id);
    const selectedUser = users.find((item) => item.id === id);
    setScopeRows(selectedUser?.scopes ?? []);
  };
  const choices = (type: string) =>
    type === "ORGANIZATION"
      ? [{ id: user.organization_id, name: "Entire organization" }]
      : type === "UNIT"
        ? units
        : type === "CONTRACTOR"
          ? contractors
          : sites;
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await morax.createUser({ ...form, mobile: form.mobile || null });
      setForm({ name: "", email: "", mobile: "", password: "" });
      setError("Success: User created");
      load();
    } catch (err) {
      setError(message(err));
    }
  }
  async function saveScopes(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      await morax.replaceScopes(selected, scopeRows);
      setError("Success: Role scopes saved");
      load();
    } catch (err) {
      setError(message(err));
    }
  }
  async function loginAs(target: User) {
    try {
      await onImpersonate(target.id);
    } catch (err) {
      setError(message(err, "Could not start impersonation"));
    }
  }
  return (
    <>
      <Header title="Users and access" />
      <ErrorBox text={error} />
      <Panel>
        <h2>Create user</h2>
        <form className="form-grid" onSubmit={create}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              required
            />
          </label>
          <label>
            Mobile
            <input
              value={form.mobile}
              onChange={(event) =>
                setForm({ ...form, mobile: event.target.value })
              }
            />
          </label>
          <label>
            Password
            <PasswordInput
              value={form.password}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
              required
              minLength={8}
            />
          </label>
          <button>Create user</button>
        </form>
      </Panel>
      <Panel>
        <h2>Role scopes</h2>
        <p className="muted">
          This screen saves the complete role-scope list for the selected user.
        </p>
        <form onSubmit={saveScopes}>
          <label>
            User
            <select
              value={selected}
              onChange={(event) => changeUser(event.target.value)}
              required
            >
              <option value="">Select user</option>
              {users.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} - {item.email}
                </option>
              ))}
            </select>
          </label>
          {scopeRows.map((scope, index) => (
            <div className="scope-row" key={index}>
              <label>
                Role
                <select
                  value={scope.role}
                  onChange={(event) =>
                    setScopeRows(
                      scopeRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, role: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  {roles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                Scope type
                <select
                  value={scope.scope_type}
                  onChange={(event) => {
                    const type = event.target.value;
                    const first = choices(type)[0];
                    setScopeRows(
                      scopeRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                            ...item,
                            scope_type: type,
                            scope_id: String(first?.id ?? ""),
                          }
                          : item,
                      ),
                    );
                  }}
                >
                  <option>ORGANIZATION</option>
                  <option>UNIT</option>
                  <option>CONTRACTOR</option>
                  <option>CONTRACTOR_SITE</option>
                </select>
              </label>
              <label>
                Assigned scope
                <select
                  value={scope.scope_id}
                  onChange={(event) =>
                    setScopeRows(
                      scopeRows.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, scope_id: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  {choices(scope.scope_type).map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {String(row.name)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setScopeRows(
                    scopeRows.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="action-row">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setScopeRows([
                  ...scopeRows,
                  {
                    role: "UNIT_MAKER",
                    scope_type: "UNIT",
                    scope_id: String(units[0]?.id ?? ""),
                  },
                ])
              }
            >
              Add role scope
            </button>
            <button disabled={!selected}>Save all scopes</button>
          </div>
        </form>
      </Panel>
      <Panel>
        <h2>Validate user access</h2>
        <p className="muted">
          Use Login as user to validate the selected user’s actual role and
          entity scope. This creates an audited, temporary session and never
          uses their password.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Roles</th>
                <th>Scopes</th>
                <th>Active</th>
                <th>Access validation</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name}</b>
                    <br />
                    <small>{item.email}</small>
                  </td>
                  <td>{item.roles.join(", ") || "Not assigned"}</td>
                  <td>
                    {item.scopes
                      .map((scope) => scope.role + ": " + scope.scope_type)
                      .join(", ") || "-"}
                  </td>
                  <td>{item.active === false ? "No" : "Yes"}</td>
                  <td>
                    <button
                      className="secondary"
                      disabled={
                        item.active === false ||
                        item.id === user.id ||
                        Boolean(item.platform_role)
                      }
                      onClick={() => loginAs(item)}
                    >
                      Login as user
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function ComplianceMaster() {
  const [rules, setRules] = useState<Row[]>([]);
  const [states, setStates] = useState<Master[]>([]);
  const [industries, setIndustries] = useState<Master[]>([]);
  const [units, setUnits] = useState<Row[]>([]);
  const [contractors, setContractors] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    rows?: {
      row_number: number;
      valid: boolean;
      errors: { field: string; message: string }[];
    }[];
  }>();
  const [generation, setGeneration] = useState({
    subject_type: "",
    subject_id: "",
    as_of_date: today(),
  });
  const [form, setForm] = useState({
    compliance_id: "",
    name: "",
    description: "",
    act: "",
    rule_reference: "",
    section: "",
    compliance_type: "",
    document_type: "",
    form_number: "",
    legal_description: "",
    consequence_or_penalty: "",
    version: "1",
    entity_type: "UNIT",
    state_id: "",
    industry_type_id: "",
    frequency: "MONTHLY",
    due_date_rule: "FIXED_DAY_OF_MONTH",
    due_date_offset: "15",
    due_date_anchor: "",
    grace_days: "0",
    required_document: "",
    risk_level: "MEDIUM",
    effective_from: today(),
    effective_to: "",
    active: "true",
  });
  const load = () =>
    Promise.all([
      morax.rules(),
      morax.states(),
      morax.industries(),
      morax.units(),
      morax.contractors(),
      morax.sites(),
    ])
      .then(([r, s, i, u, c, siteRows]) => {
        setRules(r);
        setStates(s);
        setIndustries(i);
        setUnits(u.items);
        setContractors(c);
        setSites(siteRows);
      })
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  const generationChoices =
    generation.subject_type === "UNIT"
      ? units
      : generation.subject_type === "CONTRACTOR"
        ? contractors
        : sites;
  return (
    <>
      <Header title="Compliance Master">
        <button
          className="secondary"
          onClick={() =>
            morax.downloadRuleTemplate().catch((err) => setError(message(err)))
          }
        >
          Download Excel template
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <h2>Generate obligations</h2>
        <form
          className="form-grid compact"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await morax.generate({
                subject_type: generation.subject_type || undefined,
                subject_id: generation.subject_id || undefined,
                as_of_date: generation.as_of_date || undefined,
              });
              setError(
                `Success: Generation completed — ${r.created} new obligation(s)`,
              );
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <label>
            Subject type
            <select
              value={generation.subject_type}
              onChange={(e) =>
                setGeneration({
                  ...generation,
                  subject_type: e.target.value,
                  subject_id: "",
                })
              }
            >
              <option value="">All accessible subjects</option>
              <option>UNIT</option>
              <option>CONTRACTOR</option>
              <option>CONTRACTOR_SITE</option>
            </select>
          </label>
          <label>
            Subject
            <select
              value={generation.subject_id}
              disabled={!generation.subject_type}
              onChange={(e) =>
                setGeneration({ ...generation, subject_id: e.target.value })
              }
            >
              <option value="">All of selected type</option>
              {generationChoices.map((r) => (
                <option value={String(r.id)} key={String(r.id)}>
                  {String(r.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            As-of date
            <input
              type="date"
              value={generation.as_of_date}
              onChange={(e) =>
                setGeneration({ ...generation, as_of_date: e.target.value })
              }
            />
          </label>
          <button>Run generation</button>
        </form>
      </Panel>
      <Panel>
        <h2>Excel import</h2>
        <p className="muted">
          Validate the workbook, inspect the rows, then explicitly confirm its
          import.
        </p>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
        />{" "}
        <button
          className="secondary"
          disabled={!importFile}
          onClick={async () => {
            try {
              const result = await morax.validateImport(importFile!);
              const detail = await morax.previewImport(result.id);
              setPreview({ ...result, rows: detail.rows });
            } catch (err) {
              setError(message(err, "Validation failed"));
            }
          }}
        >
          Validate workbook
        </button>
        {preview && (
          <div className="import-preview">
            <p className="alert success">
              {preview.valid_rows} valid of {preview.total_rows};{" "}
              {preview.error_rows} error rows.
            </p>
            {preview.rows
              ?.filter((row) => !row.valid)
              .map((row) => (
                <p className="alert error" key={row.row_number}>
                  Row {row.row_number}:{" "}
                  {row.errors
                    .map((e) => `${e.field} — ${e.message}`)
                    .join("; ")}
                </p>
              ))}
            <button
              onClick={async () => {
                try {
                  await morax.confirmImport(preview.id);
                  setPreview(undefined);
                  setError("Success: Import confirmed");
                  load();
                } catch (err) {
                  setError(message(err, "Import failed"));
                }
              }}
              disabled={preview.error_rows > 0}
            >
              Confirm import
            </button>
          </div>
        )}
      </Panel>
      <Panel>
        <h2>Add rule version</h2>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await morax.createRule({
                ...payload(form, ["version", "due_date_offset", "grace_days"]),
                active: form.active === "true",
              });
              setError("Success: Rule version saved");
              setForm({
                ...form,
                compliance_id: "",
                name: "",
                description: "",
              });
              load();
            } catch (err) {
              setError(message(err, "Could not save rule"));
            }
          }}
        >
          <label>
            Compliance ID
            <input
              value={form.compliance_id}
              onChange={(e) =>
                setForm({ ...form, compliance_id: e.target.value })
              }
              required
            />
          </label>
          <label>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Version
            <input
              type="number"
              min="1"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              required
            />
          </label>
          <label>
            Entity type
            <select
              value={form.entity_type}
              onChange={(e) =>
                setForm({ ...form, entity_type: e.target.value })
              }
            >
              <option>UNIT</option>
              <option>CONTRACTOR</option>
              <option>CONTRACTOR_SITE</option>
            </select>
          </label>
          <label>
            State
            <select
              value={form.state_id}
              onChange={(e) => setForm({ ...form, state_id: e.target.value })}
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Industry
            <select
              value={form.industry_type_id}
              onChange={(e) =>
                setForm({ ...form, industry_type_id: e.target.value })
              }
            >
              <option value="">All industries</option>
              {industries.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Frequency
            <select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              {[
                "MONTHLY",
                "QUARTERLY",
                "HALF_YEARLY",
                "ANNUAL",
                "ONE_TIME",
                "EVENT_BASED",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Due-date method
            <select
              value={form.due_date_rule}
              onChange={(e) =>
                setForm({ ...form, due_date_rule: e.target.value })
              }
            >
              {[
                "FIXED_DAY_OF_MONTH",
                "DAYS_AFTER_PERIOD_END",
                "FIXED_ANNUAL_DATE",
                "ONE_TIME_CONFIGURED_DATE",
                "MANUAL",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Due day / offset
            <input
              type="number"
              value={form.due_date_offset}
              onChange={(e) =>
                setForm({ ...form, due_date_offset: e.target.value })
              }
            />
          </label>
          <label>
            Due-date anchor
            <input
              value={form.due_date_anchor}
              onChange={(e) =>
                setForm({ ...form, due_date_anchor: e.target.value })
              }
            />
          </label>
          <label>
            Grace days
            <input
              type="number"
              min="0"
              value={form.grace_days}
              onChange={(e) => setForm({ ...form, grace_days: e.target.value })}
            />
          </label>
          <label>
            Risk
            <select
              value={form.risk_level}
              onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
            >
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option>CRITICAL</option>
            </select>
          </label>
          <label>
            Effective from
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) =>
                setForm({ ...form, effective_from: e.target.value })
              }
            />
          </label>
          <label>
            Effective to
            <input
              type="date"
              value={form.effective_to}
              onChange={(e) =>
                setForm({ ...form, effective_to: e.target.value })
              }
            />
          </label>
          <label>
            Required evidence
            <input
              value={form.required_document}
              onChange={(e) =>
                setForm({ ...form, required_document: e.target.value })
              }
            />
          </label>
          <label>
            Act
            <input
              value={form.act}
              onChange={(e) => setForm({ ...form, act: e.target.value })}
            />
          </label>
          <label>
            Rule reference
            <input
              value={form.rule_reference}
              onChange={(e) =>
                setForm({ ...form, rule_reference: e.target.value })
              }
            />
          </label>
          <label>
            Section
            <input
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            />
          </label>
          <label>
            Form number
            <input
              value={form.form_number}
              onChange={(e) =>
                setForm({ ...form, form_number: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Legal description
            <textarea
              value={form.legal_description}
              onChange={(e) =>
                setForm({ ...form, legal_description: e.target.value })
              }
            />
          </label>
          <label className="wide">
            Consequence / penalty
            <textarea
              value={form.consequence_or_penalty}
              onChange={(e) =>
                setForm({ ...form, consequence_or_penalty: e.target.value })
              }
            />
          </label>
          <button>Save rule version</button>
        </form>
      </Panel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Compliance ID</th>
              <th>Name</th>
              <th>Version</th>
              <th>Frequency</th>
              <th>Due-date method</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.compliance_id)}</td>
                <td>{String(r.name)}</td>
                <td>{String(r.version)}</td>
                <td>{String(r.frequency)}</td>
                <td>{String(r.due_date_rule)}</td>
                <td>{String(r.active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Documents({ user }: { user: User }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", entity_type: "" });
  const load = () =>
    morax
      .documents(filters)
      .then(setRows)
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Header title="Document library">
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <form
          className="form-grid compact"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <label>
            Search
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </label>
          <label>
            Entity type
            <select
              value={filters.entity_type}
              onChange={(e) =>
                setFilters({ ...filters, entity_type: e.target.value })
              }
            >
              <option value="">All</option>
              <option>UNIT</option>
              <option>CONTRACTOR</option>
              <option>CONTRACTOR_SITE</option>
            </select>
          </label>
          <button>Filter</button>
        </form>
      </Panel>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Entity</th>
              <th>Period</th>
              <th>Verification</th>
              <th>Uploaded</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  {String(row.original_filename)}
                  <br />
                  <small>v{String(row.version)}</small>
                </td>
                <td>{String(row.entity_type)}</td>
                <td>{String(row.period)}</td>
                <td>
                  <Badge text={String(row.verification_state ?? "PENDING")} />
                </td>
                <td>{String(row.created_at)}</td>
                <td>
                  <div className="action-row">
                    <button
                      className="secondary"
                      onClick={() =>
                        morax
                          .downloadDocument(
                            String(row.id),
                            String(row.original_filename),
                          )
                          .catch((err) => setError(message(err)))
                      }
                    >
                      Download
                    </button>
                    <Link
                      to={`/app/compliances/detail/${String(row.compliance_instance_id)}`}
                    >
                      Open workflow
                    </Link>
                    {canManage(user) && (
                      <button
                        className="danger"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete ${String(row.original_filename)}?`,
                            )
                          )
                            return;
                          try {
                            await morax.deleteDocument(String(row.id));
                            setError("Success: Document deleted");
                            load();
                          } catch (err) {
                            setError(message(err));
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LegacyNotifications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(false);
  const load = () =>
    morax
      .notifications({ unread_only: unread ? "true" : "" })
      .then((result) => setRows(result.items))
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, [unread]);
  return (
    <>
      <Header title="Notifications">
        <label className="inline">
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => setUnread(e.target.checked)}
          />{" "}
          Unread only
        </label>
      </Header>
      <ErrorBox text={error} />
      {rows.length ? (
        rows.map((row) => (
          <Panel key={String(row.id)}>
            <div className="split">
              <div>
                <h2>{String(row.title)}</h2>
                <p>{String(row.body ?? "")}</p>
                <small>{String(row.created_at)}</small>
              </div>
              <div className="action-row">
                {row.reference_type === "ComplianceInstance" && (
                  <Link
                    to={`/app/compliances/detail/${String(row.reference_id)}`}
                  >
                    Open
                  </Link>
                )}
                {!row.read_at && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await morax.readNotification(String(row.id));
                        load();
                      } catch (err) {
                        setError(message(err));
                      }
                    }}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          </Panel>
        ))
      ) : (
        <Panel>No notifications.</Panel>
      )}
    </>
  );
}

function Reports() {
  const [status, setStatus] = useState<Record<string, number>>({});
  const [frequency, setFrequency] = useState<Record<string, number>>({});
  const [entities, setEntities] = useState<
    {
      entity: string;
      due: number;
      overdue: number;
      done: number;
      rate: number;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextStatus, nextFrequency, nextEntities] = await Promise.all([
        morax.statusChart(),
        morax.frequencyChart(),
        morax.entityChart(),
      ]);
      setStatus(nextStatus);
      setFrequency(nextFrequency);
      setEntities(nextEntities);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const statusEntries = Object.entries(status);
  const frequencyEntries = Object.entries(frequency);
  const totalObligations = statusEntries.reduce((total, [, count]) => total + count, 0);
  const overdueObligations = entities.reduce((total, entity) => total + entity.overdue, 0);
  const averageCompletion = entities.length
    ? Math.round(entities.reduce((total, entity) => total + entity.rate, 0) / entities.length)
    : 0;
  const statusColors: Record<string, string> = {
    APPROVED: "#047857",
    COMPLETED: "#047857",
    COMPLETED_LATE: "#0f766e",
    OVERDUE: "#b91c1c",
    REJECTED: "#b91c1c",
    DUE_TODAY: "#b45309",
    DUE_SOON: "#4338ca",
    UPCOMING: "#2563eb",
    SUBMITTED: "#0369a1",
    UNDER_REVIEW: "#0369a1",
    PENDING_ACTION: "#b45309",
    PENDING_APPROVAL: "#4338ca",
    NOT_APPLICABLE: "#64748b",
  };
  const statusColor = (name: string, index: number) =>
    statusColors[name.toUpperCase()] ?? ["#2563eb", "#047857", "#b45309", "#64748b"][index % 4];
  const exports = [
    { label: "Compliance status", download: morax.downloadStatusReport },
    { label: "Overdue", download: morax.downloadOverdueReport },
    { label: "Completion", download: morax.downloadCompletionReport },
    { label: "Entity compliance", download: morax.downloadEntityReport },
  ];
  return (
    <section className="modern-page reports-page">
      <WorkspacePageHeader
        eyebrow="INSIGHTS & EXPORTS"
        title="Compliance reports"
        description="Review compliance status, frequency, and entity performance. Export detailed reports as CSV."
        actions={
          <button className="button-secondary" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
        }
      />
      <InlineError message={error} />
      {loading ? (
        <DashboardSection title="Loading reports">
          <LoadingSkeleton rows={5} />
        </DashboardSection>
      ) : (
        <>
          <section className="dashboard-metric-grid reports-metric-grid" aria-label="Report overview">
            <DashboardMetricCard label="Total obligations" value={totalObligations} helper="Across all reported statuses" />
            <DashboardMetricCard label="Overdue" value={overdueObligations} helper="Across reported entities" tone="critical" />
            <DashboardMetricCard label="Entities reported" value={entities.length} helper="Included in entity summary" tone="attention" />
            <DashboardMetricCard label="Average completion" value={`${averageCompletion}%`} helper="Average entity completion rate" tone="success" />
          </section>

          <DashboardSection title="CSV exports" description="Download detailed report data for analysis and record keeping." className="reports-export-section">
            <div className="reports-export-grid">
              {exports.map(({ label, download }) => (
                <button
                  key={label}
                  className="button-secondary"
                  type="button"
                  onClick={() => download().catch((err) => setError(message(err)))}
                >
                  <Download size={16} />
                  {label}
                </button>
              ))}
            </div>
          </DashboardSection>

          <div className="reports-chart-grid">
            <DashboardSection title="Status summary" description="Obligations by current compliance status." className="reports-chart-section">
              {statusEntries.length ? (
                <div className="reports-status-layout">
                  <div className="reports-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusEntries.map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={86}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {statusEntries.map(([name], index) => (
                            <Cell key={name} fill={statusColor(name, index)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [value, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="reports-status-legend">
                    {statusEntries.map(([name, value], index) => (
                      <div className="reports-legend-item" key={name}>
                        <span style={{ backgroundColor: statusColor(name, index) }} />
                        <b>{name.replaceAll("_", " ")}</b>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState title="No status data available" description="There are no compliance statuses to report yet." />
              )}
            </DashboardSection>

            <DashboardSection title="Frequency summary" description="Obligations by reporting frequency." className="reports-chart-section">
              {frequencyEntries.length ? (
                <div className="reports-chart reports-frequency-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={frequencyEntries.map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#526345" }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip cursor={{ fill: "#edf3e8" }} />
                      <Bar dataKey="value" fill="#526345" radius={[5, 5, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No frequency data available" description="There are no obligation frequencies to report yet." />
              )}
            </DashboardSection>
          </div>

          <DashboardSection title="Entity compliance summary" description={`${entities.length} entit${entities.length === 1 ? "y" : "ies"} included in this report.`}>
            {entities.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entity</th>
                      <th>Due</th>
                      <th>Overdue</th>
                      <th>Done</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((row) => (
                      <tr key={row.entity}>
                        <td>{row.entity}</td>
                        <td>{row.due}</td>
                        <td>{row.overdue}</td>
                        <td>{row.done}</td>
                        <td>{row.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No entity data available" description="Entity compliance summaries will appear here when report data is available." />
            )}
          </DashboardSection>
        </>
      )}
    </section>
  );
}

function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const load = () =>
    morax
      .audit()
      .then((r) => setRows(r.items))
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Header title="Audit trail">
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </Header>
      <ErrorBox text={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Module</th>
              <th>Entity</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>{String(r.created_at)}</td>
                <td>{String(r.action)}</td>
                <td>{String(r.module)}</td>
                <td>{String(r.entity_type)}</td>
                <td>{String(r.reason ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Settings({ user }: { user: User }) {
  const [org, setOrg] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
  });
  const load = () =>
    morax
      .organization()
      .then((row) => setOrg(objectToForm(row)))
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Header title="Workspace settings" />
      <ErrorBox text={error} />
      <Panel>
        <h2>Organization profile</h2>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await morax.updateOrganization({
                ...payload(org),
                compliance_start_date: org.compliance_start_date || null,
              });
              setError("Success: Organization updated");
              load();
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <label>
            Name
            <input
              value={org.name ?? ""}
              onChange={(e) => setOrg({ ...org, name: e.target.value })}
              required
            />
          </label>
          <label>
            Legal name
            <input
              value={org.legal_name ?? ""}
              onChange={(e) => setOrg({ ...org, legal_name: e.target.value })}
            />
          </label>
          <label>
            Code
            <input
              value={org.code ?? ""}
              onChange={(e) => setOrg({ ...org, code: e.target.value })}
              required
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={org.contact_email ?? ""}
              onChange={(e) =>
                setOrg({ ...org, contact_email: e.target.value })
              }
            />
          </label>
          <label>
            Contact phone
            <input
              value={org.contact_phone ?? ""}
              onChange={(e) =>
                setOrg({ ...org, contact_phone: e.target.value })
              }
            />
          </label>
          <label>
            Compliance start
            <input
              type="date"
              value={org.compliance_start_date ?? ""}
              onChange={(e) =>
                setOrg({ ...org, compliance_start_date: e.target.value })
              }
            />
          </label>
          <label>
            Status
            <select
              value={org.status ?? "DRAFT"}
              onChange={(e) => setOrg({ ...org, status: e.target.value })}
            >
              <option>DRAFT</option>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </label>
          <label className="wide">
            Identifiers
            <textarea
              value={org.identifiers ?? ""}
              onChange={(e) => setOrg({ ...org, identifiers: e.target.value })}
            />
          </label>
          <label className="wide">
            Address
            <textarea
              value={org.address ?? ""}
              onChange={(e) => setOrg({ ...org, address: e.target.value })}
            />
          </label>
          <button disabled={!canManage(user)}>Save organization</button>
        </form>
      </Panel>
      <Panel>
        <h2>Change my password</h2>
        <form
          className="form-grid compact"
          onSubmit={async (e) => {
            e.preventDefault();
            if (passwords.new_password !== passwordConfirmation) {
              setError("New password and Confirm password must match.");
              return;
            }
            try {
              await morax.changePassword(passwords);
              setPasswords({ current_password: "", new_password: "" });
              setPasswordConfirmation("");
              setError("Success: Password changed");
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <label>
            Current password
            <PasswordInput
              value={passwords.current_password}
              onChange={(e) =>
                setPasswords({ ...passwords, current_password: e.target.value })
              }
              required
              minLength={8}
            />
          </label>
          <label>
            New password
            <PasswordInput
              value={passwords.new_password}
              onChange={(e) =>
                setPasswords({ ...passwords, new_password: e.target.value })
              }
              required
              minLength={8}
            />
          </label>
          <label>
            Confirm password
            <PasswordInput
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button>Change password</button>
        </form>
      </Panel>
    </>
  );
}

function OrganizationSettings({ user }: { user: User }) {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const base = organizationId ? "/app/organizations/" + organizationId : "/app";
  const [organization, setOrganization] = useState<Row>();
  const [error, setError] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
  });
  const load = () =>
    morax
      .organization()
      .then(setOrganization)
      .catch((err) => setError(message(err)));
  useEffect(() => {
    load();
  }, [organizationId]);

  return (
    <>
      <Header title="Organization settings">
        <button
          className="secondary"
          onClick={() => navigate(base + "/dashboard")}
        >
          Back to dashboard
        </button>
      </Header>
      <ErrorBox text={error} />
      <Panel>
        <div className="split">
          <div>
            <p className="eyebrow">SELECTED ORGANIZATION</p>
            <h2>{String(organization?.name ?? "Loading organization…")}</h2>
          </div>
          {Boolean(organization?.status) && (
            <Badge text={String(organization?.status)} />
          )}
        </div>
        <dl>
          <dt>Organization code</dt>
          <dd>{String(organization?.code ?? "—")}</dd>
          <dt>Legal name</dt>
          <dd>{String(organization?.legal_name ?? "—")}</dd>
          <dt>Compliance start</dt>
          <dd>{String(organization?.compliance_start_date ?? "—")}</dd>
          <dt>Contact</dt>
          <dd>
            {String(organization?.contact_email ?? "—")}
            {organization?.contact_phone
              ? " · " + String(organization.contact_phone)
              : ""}
          </dd>
          <dt>Address</dt>
          <dd>{String(organization?.address ?? "—")}</dd>
        </dl>
        {user.platform_role === "MORAX_ADMIN" ? (
          <div className="action-row">
            <Link to="/app/organizations">
              Edit organization details in Organizations
            </Link>
          </div>
        ) : (
          <p className="muted">
            Organization identity, status, and tenant profile are managed by a
            MORAX platform administrator.
          </p>
        )}
      </Panel>
      <Panel>
        <h2>My security</h2>
        <p className="muted">
          Change only your own password. Organization access is managed in Users
          & access by an authorized administrator.
        </p>
        <form
          className="form-grid compact"
          onSubmit={async (e) => {
            e.preventDefault();
            if (passwords.new_password !== passwordConfirmation) {
              setError("New password and Confirm password must match.");
              return;
            }
            try {
              await morax.changePassword(passwords);
              setPasswords({ current_password: "", new_password: "" });
              setPasswordConfirmation("");
              setError("Success: Password changed");
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <label>
            Current password
            <PasswordInput
              value={passwords.current_password}
              onChange={(e) =>
                setPasswords({ ...passwords, current_password: e.target.value })
              }
              required
              minLength={8}
            />
          </label>
          <label>
            New password
            <PasswordInput
              value={passwords.new_password}
              onChange={(e) =>
                setPasswords({ ...passwords, new_password: e.target.value })
              }
              required
              minLength={8}
            />
          </label>
          <label>
            Confirm password
            <PasswordInput
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button>Change password</button>
        </form>
      </Panel>
    </>
  );
}
function GlobalSidebar({ user, logout, collapsed, setCollapsed }: { user: User; logout: () => void; collapsed: boolean; setCollapsed: (c: boolean) => void }) {
  const location = useLocation();
  const match = location.pathname.match(/\/app\/organizations\/([^\/]+)/);
  const organizationId = match && match[1] !== "settings" ? match[1] : undefined;
  const prefix = organizationId ? "/app/organizations/" + organizationId : "/app";
  const visibleLinks = workspaceLinks(user);
  const complianceLinks = visibleLinks.filter((link) => ["compliances/company", "compliances/contractor", "compliances/one-time"].includes(link.path));
  const entityLinks = visibleLinks.filter((link) => ["entities/units", "entities/contractors"].includes(link.path));
  // Sites remain available by direct authorized route, but are intentionally
  // removed from the primary sidebar to keep operational navigation compact.
  const otherLinks = visibleLinks.filter((link) => !["compliances/company", "compliances/contractor", "compliances/one-time", "entities/units", "entities/contractors", "entities/sites"].includes(link.path));
  const complianceActive = complianceLinks.some((link) => location.pathname === `${prefix}/${link.path}`);
  const entitiesActive = entityLinks.some((link) => location.pathname === `${prefix}/${link.path}`);
  const [complianceOpen, setComplianceOpen] = useState(complianceActive);
  const [entitiesOpen, setEntitiesOpen] = useState(entitiesActive);
  useEffect(() => { if (complianceActive) setComplianceOpen(true); }, [complianceActive]);
  useEffect(() => { if (entitiesActive) setEntitiesOpen(true); }, [entitiesActive]);

  return (
    <aside className={collapsed ? "collapsed" : ""}>
      <div className="brand" style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', width: '100%', marginBottom: collapsed ? '2rem' : '1.5rem', flexDirection: collapsed ? 'column' : 'row', gap: collapsed ? '1rem' : '0' }}>
        {!collapsed && (
          <div style={{ width: "140px", height: "140px", display: "block", margin: "-10px 0 0 -10px", borderRadius: "0.35rem", overflow: "hidden" }}>
            <ElasticMesh image="/morax/Mora_Final_Logo-01_3.png" interaction="hover" stiffness={0.15} damping={0.15} showGrid={false} color1="#172A1B" color2="#172A1B" />
          </div>
        )}
        {collapsed && (
          <div style={{ width: "40px", height: "40px", display: "block", borderRadius: "0.35rem", overflow: "hidden" }}>
            <ElasticMesh image="/morax/Mora_Final_Logo-01_3.png" interaction="hover" stiffness={0.15} damping={0.15} showGrid={false} color1="#172A1B" color2="#172A1B" />
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }} className="hover:bg-slate-800 hover:text-white transition-colors" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </div>

      <nav aria-label="Workspace navigation">
        {hasFeature(user, "platform.organizations") && (
          <WorkspaceNavLink label="Organizations" to="/app/organizations" collapsed={collapsed} />
        )}
        {otherLinks.slice(0, 1).map(({ label, path }) => (
          <WorkspaceNavLink
            key={path}
            label={label}
            to={prefix + "/" + path}
            collapsed={collapsed}
          />
        ))}
        {complianceLinks.length > 0 && (collapsed ? complianceLinks.map(({ label, path }) => <WorkspaceNavLink key={path} label={label} to={prefix + "/" + path} collapsed />) : <div className={`sidebar-compliance-group ${complianceActive ? "active" : ""}`}>
          <button type="button" className="sidebar-compliance-toggle" onClick={() => setComplianceOpen((open) => !open)} aria-expanded={complianceOpen}>
            <CalendarClock size={18} /><span>Compliance</span><ChevronDown size={16} className={complianceOpen ? "chevron-up" : ""} />
          </button>
          {complianceOpen && <div className="sidebar-compliance-children">{complianceLinks.map(({ label, path }) => <WorkspaceNavLink key={path} label={label} to={prefix + "/" + path} />)}</div>}
        </div>)}
        {entityLinks.length > 0 && (collapsed ? entityLinks.map(({ label, path }) => <WorkspaceNavLink key={path} label={label} to={prefix + "/" + path} collapsed />) : <div className={`sidebar-compliance-group ${entitiesActive ? "active" : ""}`}>
          <button type="button" className="sidebar-compliance-toggle" onClick={() => setEntitiesOpen((open) => !open)} aria-expanded={entitiesOpen}>
            <Building2 size={18} /><span>Entities</span><ChevronDown size={16} className={entitiesOpen ? "chevron-up" : ""} />
          </button>
          {entitiesOpen && <div className="sidebar-compliance-children">{entityLinks.map(({ label, path }) => <WorkspaceNavLink key={path} label={label} to={prefix + "/" + path} />)}</div>}
        </div>)}
        {otherLinks.slice(1).map(({ label, path }) => (
          <WorkspaceNavLink key={path} label={label} to={prefix + "/" + path} collapsed={collapsed} />
        ))}
      </nav>
      <button className="logout hover:bg-slate-800 hover:text-white transition-colors rounded-md" onClick={logout} style={{ padding: collapsed ? '0.5rem' : '0.5rem 1rem', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', alignItems: 'center', gap: '0.5rem', marginTop: 'auto', color: '#fecaca', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }} title={collapsed ? "Log out" : undefined}>
        <LogOut size={18} />
        {!collapsed && <span>Log out</span>}
      </button>
    </aside>
  );
}

function AccountActivation() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="content" style={{ maxWidth: 560, margin: "4rem auto" }}>
      <Panel>
        <p className="eyebrow">ACCOUNT ACTIVATION</p>
        <h1>Set your MORAX password</h1>
        <p className="muted">
          Choose a password to activate your account. This link can be used only once.
        </p>
        <ErrorBox text={error} />
        {!token ? (
          <p className="alert error">This activation link is incomplete. Ask your administrator to resend it.</p>
        ) : (
          <form
            className="form-grid compact"
            onSubmit={async (event) => {
              event.preventDefault();
              if (password !== confirmPassword) {
                setError("Passwords do not match");
                return;
              }
              setSubmitting(true);
              try {
                const result = await morax.activateAccount(token, password);
                setError(`Success: ${result.message}`);
                setPassword("");
                setConfirmPassword("");
              } catch (activationError) {
                setError(message(activationError));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label>
              New password
              <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
            </label>
            <label>
              Confirm password
              <PasswordInput value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
            </label>
            <div className="action-row">
              <button disabled={submitting}>{submitting ? "Activating…" : "Activate account"}</button>
              <button type="button" className="secondary" onClick={() => navigate("/")}>Back to sign in</button>
            </div>
          </form>
        )}
      </Panel>
    </main>
  );
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [selectingContractor, setSelectingContractor] = useState(false);
  useEffect(() => {
    morax
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);
  if (!ready) return <div className="loading">Loading MORAX…</div>;
  if (location.pathname === "/activate") return <AccountActivation />;
  const resetTenantWorkspace = () => queryClient.clear();
  if (!user) return <Login done={(signedIn) => {
    resetTenantWorkspace();
    setUser(signedIn);
    navigate(signedIn.platform_role === "MORAX_ADMIN" ? "/app/organizations" : `/app/${defaultWorkspacePath(signedIn)}`, { replace: true });
  }} />;
  const impersonate = async (userId: string) => {
    const response = await morax.impersonate(userId);
    resetTenantWorkspace();
    setToken(response.access_token);
    setUser(response.user);
    navigate(`/app/${defaultWorkspacePath(response.user)}`, { replace: true });
  };
  const loginAsOrganization = async (organizationId: string) => {
    const response = await morax.loginAsOrganization(organizationId);
    resetTenantWorkspace();
    setToken(response.access_token);
    setUser(response.user);
    navigate(`/app/${defaultWorkspacePath(response.user)}`, { replace: true });
  };
  const endImpersonation = async () => {
    const response = await morax.endImpersonation();
    resetTenantWorkspace();
    setToken(response.access_token);
    setUser(response.user);
    navigate(
      response.user.platform_role === "MORAX_ADMIN"
        ? "/app/organizations"
        : `/app/${defaultWorkspacePath(response.user)}`,
      { replace: true },
    );
  };
  const selectContractor = async (contractorId: string) => {
    setSelectingContractor(true);
    try {
      const selectedUser = await morax.selectContractorContext(contractorId);
      resetTenantWorkspace();
      setUser(selectedUser);
      setContractorPickerOpen(false);
      navigate("/app/compliances/contractor", { replace: true });
    } finally {
      setSelectingContractor(false);
    }
  };
  const logout = async () => {
    try {
      if (user.impersonation?.active) await endImpersonation();
      await morax.logout();
    } finally {
      resetTenantWorkspace();
      setToken(null);
      setUser(null);
    }
  };
  const home =
    user.platform_role === "MORAX_ADMIN"
      ? "/app/organizations"
      : "/app/" + defaultWorkspacePath(user);
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <GlobalSidebar user={user} logout={logout} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
      <Routes>
        <Route
          path="/app/organizations"
          element={
            <PlatformShell
              user={user}
              logout={logout}
              endImpersonation={endImpersonation}
            >
              <OrganizationLanding user={user} onLoginAsOrganization={loginAsOrganization} />
            </PlatformShell>
          }
        />
        <Route
          path="/app/organizations/:organizationId/settings"
          element={
            <PlatformShell
              user={user}
              logout={logout}
              endImpersonation={endImpersonation}
            >
              <OrganizationSettings user={user} />
            </PlatformShell>
          }
        />
        <Route
          path="/app/settings"
          element={
            <PlatformShell
              user={user}
              logout={logout}
              endImpersonation={endImpersonation}
            >
              <OrganizationSettings user={user} />
            </PlatformShell>
          }
        />
        <Route
          path="/app/organizations/:organizationId/*"
          element={
            <Layout
              key={`workspace-${user.id}-${user.organization_id}-${user.contractor_context?.active_contractor_id ?? "none"}`}
              user={user}
              logout={logout}
              onImpersonate={impersonate}
              endImpersonation={endImpersonation}
              onChangeContractor={() => setContractorPickerOpen(true)}
            />
          }
        />
        <Route
          path="/app/*"
          element={
            <Layout
              key={`workspace-${user.id}-${user.organization_id}-${user.contractor_context?.active_contractor_id ?? "none"}`}
              user={user}
              logout={logout}
              onImpersonate={impersonate}
              endImpersonation={endImpersonation}
              onChangeContractor={() => setContractorPickerOpen(true)}
            />
          }
        />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      {(contractorPickerOpen || Boolean(user.contractor_context?.selection_required)) && (
        <ContractorContextDialog
          key={`${user.id}-${user.contractor_context?.active_contractor_id ?? "required"}`}
          user={user}
          open
          selecting={selectingContractor}
          onSelect={selectContractor}
          onClose={() => setContractorPickerOpen(false)}
          onExit={user.impersonation?.active ? endImpersonation : logout}
        />
      )}
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter basename="/morax">
      <ScrollToTop />
      <AppRoutes />
      <Toaster position="top-right" richColors closeButton duration={4000} />
    </BrowserRouter>
  )
}

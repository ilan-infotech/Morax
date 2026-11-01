import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Download, Eye, FileSpreadsheet, FileUp, Files, ListChecks, Plus, RefreshCw, Send, Settings2, ShieldCheck, Upload, UsersRound, X } from "lucide-react";
import { toast } from "sonner";
import { morax } from "../api/morax";
import type { RegisterDashboard, RegisterRecord, RegisterTemplate, User } from "../api/morax";
import { DashboardMetricCard, DashboardSection, EmptyState, formatDate, InlineError, LoadingSkeleton, WorkspacePageHeader } from "./workspace-ui";

type Dataset = "EMPLOYEE" | "ATTENDANCE" | "PAYROLL";
type Entity = { id: string; name: string; entity_type: "UNIT" | "CONTRACTOR" };
const nowPeriod = () => new Date().toISOString().slice(0, 7);
const title = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const canManageTemplates = (user: User) => user.platform_role === "MORAX_ADMIN" || user.roles.some((role) => ["ORGANIZATION_ADMIN", "UNIT_ADMIN", "CONTRACTOR_ADMIN"].includes(role));
const canMake = (user: User) => user.platform_role === "MORAX_ADMIN" || user.roles.some((role) => role.endsWith("_MAKER") || role.endsWith("_ADMIN"));
const canCheck = (user: User) => user.platform_role === "MORAX_ADMIN" || user.roles.some((role) => role.endsWith("_CHECKER") || role.endsWith("_ADMIN"));

const navigation = [
  ["dashboard", "Dashboard", Files], ["employees", "Employee Master", UsersRound], ["attendance", "Attendance", ListChecks], ["payroll", "Salary & Payroll", FileSpreadsheet], ["generate", "Generate Registers", Plus], ["library", "Register Library", Files], ["reviews", "Pending Reviews", ShieldCheck], ["templates", "Templates & Configuration", Settings2],
] as const;

function entityList(user: User, units: Record<string, unknown>[], contractors: Record<string, unknown>[]): Entity[] {
  if (user.contractor_context?.enabled) return user.contractor_context.options.map((item) => ({ id: item.id, name: item.name, entity_type: "CONTRACTOR" }));
  return [
    ...units.map((item) => ({ id: String(item.id), name: String(item.name), entity_type: "UNIT" as const })),
    ...contractors.map((item) => ({ id: String(item.id), name: String(item.name), entity_type: "CONTRACTOR" as const })),
  ];
}

function UploadDataset({ dataset, entity, period, reload }: { dataset: Dataset; entity: Entity; period: string; reload: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof morax.validateRegisterUpload>> | null>(null);
  const [working, setWorking] = useState(false);
  const [mappingName, setMappingName] = useState("");
  const datasetLabel = dataset === "EMPLOYEE" ? "Employee Master" : dataset === "ATTENDANCE" ? "Monthly Attendance" : "Salary & Payroll";

  const validate = async () => {
    if (!file) return toast.warning("Choose an Excel workbook first.");
    setWorking(true);
    try {
      const response = await morax.validateRegisterUpload(dataset, { entity_type: entity.entity_type, entity_id: entity.id, period_key: dataset === "EMPLOYEE" ? undefined : period, file });
      setResult(response);
      toast.success(Number(response.batch.error_rows) ? "Validation found errors to correct." : "Excel data validated successfully.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to validate the upload."); }
    finally { setWorking(false); }
  };
  const importRows = async () => {
    if (!result) return;
    setWorking(true);
    try { await morax.importRegisterUpload(String(result.batch.id)); toast.success(`${datasetLabel} imported successfully.`); setResult(null); setFile(null); reload(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to import validated rows."); }
    finally { setWorking(false); }
  };
  const saveMapping = async () => {
    if (!result || !mappingName.trim()) return;
    try { await morax.saveRegisterMapping({ dataset_type: dataset, name: mappingName.trim(), mapping: result.mapping }); setMappingName(""); toast.success("Column mapping saved for future uploads."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save this mapping."); }
  };

  return <DashboardSection title={datasetLabel} description="Upload once, validate the data, then use it to generate all eligible register templates." action={<button className="button-secondary" type="button" onClick={() => void morax.downloadRegisterDatasetTemplate(dataset)}><Download size={15} />Excel template</button>}>
    <div className="register-steps">{["Entity", "Upload", "Map", "Validate", "Import", "Generate"].map((step, index) => <span className={index < (result ? 4 : 2) ? "complete" : ""} key={step}><b>{index + 1}</b>{step}</span>)}</div>
    <div className="register-upload-grid">
      <label><span>Entity</span><input readOnly value={`${entity.name} (${title(entity.entity_type)})`} /></label>
      {dataset !== "EMPLOYEE" && <label><span>Reporting period</span><input readOnly type="month" value={period} /></label>}
      <label className="wide"><span>Excel workbook <b className="field-required">*</b></span><input accept=".xlsx" type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); }} /></label>
    </div>
    <div className="register-action-row"><button disabled={!file || working} type="button" onClick={() => void validate()}><FileUp size={16} />{working ? "Validating..." : "Validate upload"}</button></div>
    {result && <div className="register-validation">
      <div className="register-validation-summary"><b>{String(result.batch.total_rows)} rows</b><span className={Number(result.batch.error_rows) ? "error" : "success"}>{String(result.batch.error_rows)} errors</span><span>{Object.keys(result.mapping).length} mapped columns</span></div>
      <div className="register-mapping"><b>Suggested column mapping</b><div>{Object.entries(result.mapping).map(([source, target]) => <span key={source}>{source} <strong>→</strong> {target.replaceAll("_", " ")}</span>)}</div><div className="register-action-row"><input value={mappingName} placeholder="Save mapping as…" onChange={(event) => setMappingName(event.target.value)} /><button className="button-secondary" disabled={!mappingName.trim()} type="button" onClick={() => void saveMapping()}>Save mapping</button></div></div>
      {result.issues.length ? <div className="register-issues">{result.issues.slice(0, 20).map((issue, index) => <p className={issue.severity.toLowerCase()} key={`${issue.row_number}-${issue.field}-${index}`}><b>Row {issue.row_number}</b> · {issue.field.replaceAll("_", " ")}: {issue.message}</p>)}</div> : <p className="register-success-note"><CheckCircle2 size={16} />Validation passed. Importing will preserve this source batch and audit record.</p>}
      <div className="register-preview-wrap"><table className="modern-table"><thead><tr>{result.fields.map((field) => <th key={field}>{field.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{result.preview.slice(0, 8).map((row, index) => <tr key={index}>{result.fields.map((field) => <td key={field}>{String(row[field] ?? "")}</td>)}</tr>)}</tbody></table></div>
      <div className="register-action-row">{result.issues.length > 0 && <button className="button-secondary" type="button" onClick={() => void morax.downloadRegisterValidationReport(String(result.batch.id), `${datasetLabel.toLowerCase().replaceAll(" ", "-")}-validation.xlsx`)}><Download size={16} />Validation report</button>}<button disabled={working || Number(result.batch.error_rows) > 0} type="button" onClick={() => void importRows()}><Upload size={16} />Import validated rows</button></div>
    </div>}
  </DashboardSection>;
}

function RegisterDialog({ record, user, close, reload }: { record: RegisterRecord; user: User; close: () => void; reload: () => void }) {
  const [detail, setDetail] = useState<RegisterRecord | null>(null);
  const [remarks, setRemarks] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => { morax.register(record.id).then(setDetail).catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load the register.")); }, [record.id]);
  const item = detail ?? record;
  const apply = async (action: "submit" | "approve" | "reject") => {
    if (action === "reject" && !remarks.trim()) return toast.warning("Rejection remarks are required.");
    setWorking(true);
    try {
      if (action === "submit") await morax.submitRegister(item.id, item.row_version, remarks);
      if (action === "approve") await morax.approveRegister(item.id, item.row_version, remarks);
      if (action === "reject") await morax.rejectRegister(item.id, item.row_version, remarks);
      toast.success(action === "approve" ? "Register approved successfully." : action === "reject" ? "Register rejected with remarks." : "Register submitted for review."); reload(); close();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update this register."); }
    finally { setWorking(false); }
  };
  return <div className="dialog-backdrop" role="presentation"><section className="register-preview-dialog" aria-label="Register preview" aria-modal="true" role="dialog">
    <header><div><p className="eyebrow">{item.register_code} · Version {item.version}</p><h2>{item.register_name}</h2><p>{item.entity_name} · {item.period_key} · {item.employee_count} employees</p></div><button className="icon-button" type="button" onClick={close}><X size={18} /></button></header>
    <div className="register-preview-actions"><button className="button-secondary" type="button" onClick={() => void morax.downloadRegisterXlsx(item.id, `${item.register_code}-${item.period_key}.xlsx`)}><Download size={15} />Excel</button><button className="button-secondary" type="button" onClick={() => void morax.downloadRegisterPdf(item.id, `${item.register_code}-${item.period_key}.pdf`)}><Download size={15} />PDF</button><span className={`status-badge ${item.status === "APPROVED" ? "success" : item.status === "REJECTED" ? "critical" : "warning"}`}>{title(item.status)}</span></div>
    <div className="register-preview-table"><table className="modern-table"><thead><tr>{(item.content?.columns ?? []).map((column) => <th key={column.field}>{column.label}</th>)}</tr></thead><tbody>{(item.content?.rows ?? []).map((row, index) => <tr key={index}>{(item.content?.columns ?? []).map((column) => <td key={column.field}>{String(row[column.field] ?? "")}</td>)}</tr>)}</tbody></table></div>
    <div className="register-history"><b>Approval history</b>{(item.history ?? []).map((entry) => <p key={entry.id}><strong>{title(entry.action)}</strong> by {entry.actor_name ?? "User"} · {new Date(entry.created_at).toLocaleString()}{entry.remarks ? ` — ${entry.remarks}` : ""}</p>)}</div>
    {item.status === "SUBMITTED" && canCheck(user) && <div className="register-review-box"><textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Review remarks (required for rejection)" /><button className="danger" disabled={working} type="button" onClick={() => void apply("reject")}>Reject</button><button disabled={working} type="button" onClick={() => void apply("approve")}>Approve</button></div>}
    {["GENERATED", "REJECTED"].includes(item.status) && canMake(user) && <footer><button disabled={working} type="button" onClick={() => void apply("submit")}><Send size={16} />{item.status === "REJECTED" ? "Resubmit" : "Submit for approval"}</button></footer>}
  </section></div>;
}

export function RegistersManager({ user }: { user: User }) {
  const { view = "dashboard" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const base = window.location.pathname.includes("/organizations/") ? window.location.pathname.split("/registers")[0] : "/app";
  const [units, setUnits] = useState<Record<string, unknown>[]>([]);
  const [contractors, setContractors] = useState<Record<string, unknown>[]>([]);
  const [entityId, setEntityId] = useState("");
  const [period, setPeriod] = useState(nowPeriod());
  const [dashboard, setDashboard] = useState<RegisterDashboard | null>(null);
  const [records, setRecords] = useState<RegisterRecord[]>([]);
  const [templates, setTemplates] = useState<RegisterTemplate[]>([]);
  const [readiness, setReadiness] = useState<{ template: RegisterTemplate; status: string; missing_datasets: string[] }[]>([]);
  const [metric, setMetric] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RegisterRecord | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", description: "" });
  const entities = useMemo(() => entityList(user, units, contractors), [user, units, contractors]);
  const entity = entities.find((item) => item.id === entityId) ?? entities[0];
  const activeView = navigation.some(([id]) => id === view) ? view : "dashboard";

  useEffect(() => {
    Promise.all([morax.units().catch(() => ({ items: [] })), morax.contractors().catch(() => [])]).then(([unitData, contractorData]) => {
      setUnits(Array.isArray(unitData) ? unitData : unitData.items ?? []);
      setContractors(contractorData);
    });
  }, []);
  useEffect(() => { if (!entityId && entities[0]) setEntityId(entities[0].id); }, [entityId, entities]);
  const load = async () => {
    if (!entity) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const filters = { entity_type: entity.entity_type, entity_id: entity.id, period_key: period };
      const [nextDashboard, nextRecords, nextTemplates, nextReadiness] = await Promise.all([morax.registersDashboard(filters), morax.registers({ ...filters, status: metric }), morax.registerTemplates(), morax.registerReadiness(filters)]);
      setDashboard(nextDashboard); setRecords(nextRecords.items); setTemplates(nextTemplates); setReadiness(nextReadiness as typeof readiness);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load Registers."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [entity?.id, entity?.entity_type, period, metric]);
  useEffect(() => {
    const registerId = searchParams.get("register");
    if (!registerId) return;
    morax.register(registerId).then((item) => {
      setPreview(item);
      setSearchParams({}, { replace: true });
    }).catch((reason) => toast.error(reason instanceof Error ? reason.message : "This register is unavailable in your authorized scope."));
  }, [searchParams, setSearchParams]);
  const toggleMetric = (value: string) => setMetric((current) => current === value ? "" : value);
  const generate = async () => {
    if (!entity || !selectedTemplates.length) return toast.warning("Select at least one ready register template.");
    try { await morax.generateRegisters({ entity_type: entity.entity_type, entity_id: entity.id, period_key: period, template_version_ids: selectedTemplates }); setSelectedTemplates([]); toast.success("Eligible registers generated successfully."); void load(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to generate registers."); }
  };
  const createDraft = async () => {
    if (!draft.code.trim() || !draft.name.trim()) return toast.warning("Template code and name are required.");
    try { await morax.createRegisterTemplate({ ...draft, config: { source_datasets: ["EMPLOYEE"], columns: [{ label: "Employee ID", field: "employee_id", required: true }, { label: "Employee Name", field: "employee_name", required: true }] } }); setDraft({ code: "", name: "", description: "" }); toast.success("Register template draft created."); void load(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to create template draft."); }
  };
  const publishTemplate = async (templateId: string) => {
    try { await morax.publishRegisterTemplate(templateId); toast.success("Template version published."); void load(); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to publish this template."); }
  };
  const cards = dashboard ? [
    ["Total applicable", dashboard.summary.total_applicable, "", "total"], ["Generated", dashboard.summary.generated, "GENERATED_ANY", "success"], ["Pending generation", dashboard.summary.pending_generation, "PENDING_GENERATION", "attention"], ["Validation failed", dashboard.summary.validation_failed, "VALIDATION_FAILED", "critical"], ["Pending approval", dashboard.summary.pending_approval, "SUBMITTED", "warning"], ["Approved", dashboard.summary.approved, "APPROVED", "success"], ["Rejected", dashboard.summary.rejected, "REJECTED", "critical"], ["Overdue", dashboard.summary.overdue, "OVERDUE", "critical"],
  ] as const : [];

  return <div className="modern-page registers-page">
    <WorkspacePageHeader eyebrow="STATUTORY REGISTERS" title="Registers management" description="Upload once, validate once, generate eligible registers, then review and link approved outputs to compliance evidence." actions={<button className="button-secondary" type="button" onClick={() => void load()}><RefreshCw size={16} />Refresh</button>} />
    {error && <InlineError message={error} />}
    <div className="register-module-tabs" role="tablist">{navigation.filter(([id]) => {
      if (id === "templates") return canManageTemplates(user);
      if (["employees", "attendance", "payroll", "generate"].includes(id)) return canMake(user);
      if (id === "reviews") return canCheck(user);
      return true;
    }).map(([id, label, Icon]) => <button aria-selected={activeView === id} className={activeView === id ? "active" : ""} key={id} onClick={() => navigate(`${base}/registers/${id}`)} role="tab" type="button"><Icon size={15} />{label}</button>)}</div>
    {!entities.length ? <EmptyState title="No register entity assigned" description="Ask an administrator to assign a Unit or Contractor before using Registers." /> : <>
      <section className="register-context-bar"><label>Entity<select value={entity?.id ?? ""} onChange={(event) => setEntityId(event.target.value)}>{entities.map((item) => <option key={item.id} value={item.id}>{item.name} · {title(item.entity_type)}</option>)}</select></label><label>Period<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label></section>
      {loading ? <LoadingSkeleton rows={5} /> : <>
        {activeView === "dashboard" && <>
          <section className="dashboard-metric-grid">{cards.map(([label, value, filter, tone]) => <DashboardMetricCard active={Boolean(filter) && metric === filter} key={label} label={label} onClick={() => toggleMetric(filter)} tone={tone as "total" | "success" | "warning" | "attention" | "critical"} value={value} />)}</section>
          <section className="register-analytics-grid">
            <DashboardSection title="Register status distribution" description="Select a status to filter the existing register table."><div className="register-status-legend">{dashboard?.status_distribution.length ? dashboard.status_distribution.map((item) => <button className={metric === item.name ? "active" : ""} key={item.name} onClick={() => toggleMetric(item.name)} type="button"><span />{title(item.name)}<b>{item.value}</b></button>) : <EmptyState title="No generated registers" description="Generate a ready register for this period." />}</div></DashboardSection>
            <DashboardSection title="Monthly generation trend" description="Generated and approved outputs for the authorized scope."><ResponsiveContainer height={190} width="100%"><AreaChart data={dashboard?.generation_trend ?? []}><defs><linearGradient id="register-trend" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5e8b5b" stopOpacity={.45}/><stop offset="100%" stopColor="#5e8b5b" stopOpacity={.03}/></linearGradient></defs><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Area dataKey="generated" fill="url(#register-trend)" stroke="#234332" strokeWidth={2.5} type="monotone" /><Area dataKey="approved" fill="none" stroke="#5a8f7b" strokeWidth={2} type="monotone" /></AreaChart></ResponsiveContainer></DashboardSection>
            <DashboardSection title="Entity performance" description="Authorized generation and approval performance."><div className="register-performance">{dashboard?.entity_performance.length ? dashboard.entity_performance.map((item) => <button className={entity?.id === item.id ? "active" : ""} key={item.id} onClick={() => setEntityId(item.id)} type="button"><span><b>{item.name}</b><small>{item.approved}/{item.applicable} approved · {item.overdue} overdue</small></span><strong>{item.rate}%</strong></button>) : <EmptyState title="No entity performance yet" description="Generated records will appear here." />}</div></DashboardSection>
          </section>
        </>}
        {activeView === "employees" && entity && <UploadDataset dataset="EMPLOYEE" entity={entity} period={period} reload={load} />}
        {activeView === "attendance" && entity && <UploadDataset dataset="ATTENDANCE" entity={entity} period={period} reload={load} />}
        {activeView === "payroll" && entity && <UploadDataset dataset="PAYROLL" entity={entity} period={period} reload={load} />}
        {activeView === "generate" && <DashboardSection title="Generate eligible registers" description="Registers requiring unavailable leave, advance, fine, or damage data remain blocked—MORAX never invents operational data."><div className="register-readiness-list">{readiness.map((entry) => { const id = entry.template.version.id; const selected = selectedTemplates.includes(id); return <label className={entry.status === "READY_TO_GENERATE" ? "ready" : "blocked"} key={id}><input checked={selected} disabled={entry.status !== "READY_TO_GENERATE"} onChange={() => setSelectedTemplates((current) => selected ? current.filter((value) => value !== id) : [...current, id])} type="checkbox" /><span><b>{entry.template.code} · {entry.template.name}</b><small>{entry.status === "READY_TO_GENERATE" ? "Validated source datasets are available." : `Additional Data Required: ${entry.missing_datasets.join(", ")}`}</small></span></label>; })}</div><div className="register-action-row"><button disabled={!selectedTemplates.length} onClick={() => void generate()} type="button"><Plus size={16} />Generate selected registers</button></div></DashboardSection>}
        {activeView === "library" && <DashboardSection title="Register library" description="Each output keeps its source data, template version, workflow history, and approval state."><RegisterTable records={records} open={setPreview} /></DashboardSection>}
        {activeView === "reviews" && <DashboardSection title="Pending register reviews" description="Only authorized Checkers can approve or reject submitted registers."><RegisterTable records={records.filter((item) => item.status === "SUBMITTED")} open={setPreview} /></DashboardSection>}
        {activeView === "templates" && canManageTemplates(user) && <DashboardSection title="Templates & configuration" description="Templates are declarative and versioned. Published versions do not alter historic registers."><div className="register-template-create"><input onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="Template code" value={draft.code} /><input onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Template name" value={draft.name} /><input onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Description" value={draft.description} /><button onClick={() => void createDraft()} type="button">Create draft</button></div><div className="modern-table-wrap"><table className="modern-table"><thead><tr><th>Code</th><th>Template</th><th>Version</th><th>Source datasets</th><th>Status</th><th>Action</th></tr></thead><tbody>{templates.map((item) => <tr key={item.id}><td>{item.code}</td><td><b>{item.name}</b><small>{item.description}</small></td><td>v{item.version.version}</td><td>{(item.config.source_datasets ?? []).join(", ")}</td><td>{title(item.version.status)}</td><td>{item.version.status === "DRAFT" ? <button className="button-secondary" onClick={() => void publishTemplate(item.id)} type="button">Publish</button> : "Published"}</td></tr>)}</tbody></table></div></DashboardSection>}
      </>}
    </>}
    {preview && <RegisterDialog close={() => setPreview(null)} record={preview} reload={load} user={user} />}
  </div>;
}

function RegisterTable({ records, open }: { records: RegisterRecord[]; open: (record: RegisterRecord) => void }) {
  return <div className="modern-table-wrap"><table className="modern-table"><thead><tr><th>Register</th><th>Entity</th><th>Period</th><th>Employees</th><th>Generated</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.length ? records.map((item) => <tr key={item.id}><td><b>{item.register_name}</b><small>{item.register_code} · v{item.version ?? item.template_version ?? "—"}</small></td><td>{item.entity_name}</td><td>{item.period_key}</td><td>{item.employee_count}</td><td>{item.generated_at ? new Date(item.generated_at).toLocaleDateString() : "—"}</td><td>{formatDate(item.due_date ?? undefined)}</td><td><span className={`status-badge ${item.status === "APPROVED" ? "success" : item.status === "REJECTED" || item.is_overdue || item.status === "VALIDATION_FAILED" ? "critical" : "warning"}`}>{title(item.status)}</span></td><td>{item.id.startsWith("readiness:") || item.id.startsWith("upload:") ? "—" : <button aria-label={`Preview ${item.register_name}`} className="icon-action" onClick={() => open(item)} type="button"><Eye size={16} /></button>}</td></tr>) : <tr><td className="empty-table-message" colSpan={8}>No registers match this authorized scope and filter.</td></tr>}</tbody></table></div>;
}

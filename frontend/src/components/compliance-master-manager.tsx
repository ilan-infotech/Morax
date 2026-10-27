import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BookOpen, Download, Eye, FileSpreadsheet, Plus, Power, PowerOff, Search, Trash2, X } from "lucide-react";
import { morax } from "../api/morax";
import { EmptyState, InlineError, LoadingSkeleton } from "./workspace-ui";
import GradientText from "./GradientText/GradientText";

type Row = Record<string, unknown>;
type ImportMode = "MERGE" | "REPLACE";
type DeleteTarget =
  | { kind: "RULE"; id: string; label: string }
  | { kind: "ACT"; label: string };
const text = (row: Row, key: string) =>
  row[key] == null ? "" : String(row[key]);
const today = () => new Date().toISOString().slice(0, 10);
const frequencies = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "ONE_TIME",
  "EVENT_BASED",
];
const dueRules = [
  "FIXED_DAY_OF_MONTH",
  "DAYS_AFTER_PERIOD_END",
  "FIXED_ANNUAL_DATE",
  "ONE_TIME_CONFIGURED_DATE",
  "MANUAL",
];
const documentTypes = [
  ["PROCEDURAL", "Procedural"],
  ["REGISTER", "Register"],
  ["REMITTANCE", "Remittance"],
  ["RETURN", "Return"],
  ["RECORDS", "Records"],
  ["INTIMATION_FILING", "Intimation/Filing"],
  ["DISPLAY", "Display"],
  ["NOTICE", "Notice"],
] as const;
const unitComplianceTypes = ["Shops & Establishments", "Mines", "BOCW", "ESI", "PF"] as const;

const ruleSchema = z.object({
  compliance_id: z.string().trim().min(1, "Compliance ID is required"),
  name: z.string().trim().min(1, "Rule name is required"),
  version: z.coerce.number().int().min(1),
  entity_type: z.enum(["UNIT", "CONTRACTOR", "CONTRACTOR_SITE"]),
  state_id: z.string(),
  industry_type_id: z.string(),
  employee_threshold: z.coerce.number().int().min(0).nullable(),
  unit_compliance_types: z.array(z.string()),
  frequency: z.string().min(1),
  applicable_months: z.string(),
  due_date_rule: z.string().min(1),
  due_date_offset: z.coerce.number().int().nullable(),
  due_date_anchor: z.string(),
  grace_days: z.coerce.number().int().min(0),
  required_document: z.string(),
  risk_level: z.string(),
  effective_from: z.string().min(1, "Effective date is required"),
  effective_to: z.string(),
  active: z.boolean(),
  description: z.string(),
  act: z.string().trim().min(1, "Act is required"),
  rule_reference: z.string(),
  section: z.string(),
  compliance_type: z.string(),
  document_type: z.string(),
  form_number: z.string(),
  legal_description: z.string(),
  consequence_or_penalty: z.string(),
});
type RuleForm = z.input<typeof ruleSchema>;
const blankRule = (): RuleForm => ({
  compliance_id: "",
  name: "",
  version: 1,
  entity_type: "UNIT",
  state_id: "",
  industry_type_id: "",
  employee_threshold: null,
  unit_compliance_types: [],
  frequency: "MONTHLY",
  applicable_months: "",
  due_date_rule: "FIXED_DAY_OF_MONTH",
  due_date_offset: 15,
  due_date_anchor: "",
  grace_days: 0,
  required_document: "",
  risk_level: "MEDIUM",
  effective_from: today(),
  effective_to: "",
  active: true,
  description: "",
  act: "",
  rule_reference: "",
  section: "",
  compliance_type: "",
  document_type: "",
  form_number: "",
  legal_description: "",
  consequence_or_penalty: "",
});

export function ComplianceMasterManager() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [frequency, setFrequency] = useState("");
  const [actFilter, setActFilter] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ by: "act", dir: "asc" });
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("REPLACE");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [previewRows, setPreviewRows] = useState<{ row_number: number; errors: { field: string; message: string }[] }[]>([]);
  const [preview, setPreview] = useState<{
    id: string;
    total_rows: number;
    valid_rows: number;
    error_rows: number;
  } | null>(null);
  const filters = useMemo(
    () => ({
      page: String(page),
      page_size: "10",
      q: deferredSearch.trim() || undefined,
      act: actFilter || undefined,
      frequency: frequency || undefined,
      active: active || undefined,
      sort_by: sort.by,
      sort_dir: sort.dir,
    }),
    [actFilter, active, deferredSearch, frequency, page, sort],
  );
  const rules = useQuery({
    queryKey: ["rules-page", filters],
    queryFn: () => morax.rulesPage(filters),
    staleTime: 30_000,
  });
  const acts = useQuery({
    queryKey: ["compliance-rule-acts"],
    queryFn: morax.ruleActs,
    staleTime: 5 * 60_000,
  });
  const options = useQuery({
    queryKey: ["rule-options"],
    queryFn: async () => {
      const [states, industries] = await Promise.all([morax.states(), morax.industries()]);
      return { states, industries };
    },
    staleTime: 5 * 60_000,
  });
  const customerOrganizations = useQuery({
    queryKey: ["generation-customer-organizations"],
    queryFn: () => morax.platformOrganizations({ status: "ACTIVE" }),
    staleTime: 60_000,
  });
  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: blankRule(),
  });
  const generation = useForm<{
    organization_id: string;
    subject_type: string;
    subject_id: string;
    as_of_date: string;
  }>({
    defaultValues: { organization_id: "", subject_type: "", subject_id: "", as_of_date: today() },
  });
  const generationOrganizationId = generation.watch("organization_id");
  const generationSubjectType = generation.watch("subject_type") as
    | "UNIT"
    | "CONTRACTOR"
    | "CONTRACTOR_SITE"
    | "";
  const generationSubjects = useQuery({
    queryKey: ["generation-subjects", generationOrganizationId, generationSubjectType],
    queryFn: () =>
      morax.generationSubjects(
        generationOrganizationId,
        generationSubjectType as "UNIT" | "CONTRACTOR" | "CONTRACTOR_SITE",
      ),
    enabled: Boolean(generationOrganizationId && generationSubjectType),
    staleTime: 30_000,
  });
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["rules-page"] }),
      client.invalidateQueries({ queryKey: ["compliance-rule-acts"] }),
      client.invalidateQueries({ queryKey: ["dashboard-overview"] }),
    ]);
  const save = useMutation({
    mutationFn: (values: RuleForm) =>
      morax.createRule({
        ...values,
        applicable_months: values.applicable_months
          ? values.applicable_months.split(",").map((month) => Number(month.trim())).filter(Boolean)
          : [],
        state_id: values.state_id || null,
        industry_type_id: values.industry_type_id || null,
        unit_compliance_types: values.entity_type === "UNIT" ? values.unit_compliance_types : [],
        due_date_offset: values.due_date_offset || null,
        due_date_anchor: values.due_date_anchor || null,
        effective_to: values.effective_to || null,
        required_document: values.required_document || null,
        description: values.description || null,
        act: values.act || null,
        rule_reference: values.rule_reference || null,
        section: values.section || null,
        compliance_type: values.compliance_type || null,
        document_type: values.document_type || null,
        form_number: values.form_number || null,
        legal_description: values.legal_description || null,
        consequence_or_penalty: values.consequence_or_penalty || null,
      }),
    onSuccess: async () => {
      setNotice("Rule version saved successfully.");
      setFormOpen(false);
      form.reset(blankRule());
      await invalidate();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not save rule version.",
      ),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      morax.setRuleStatus(id, active),
    onSuccess: async () => {
      setNotice("Rule version status updated.");
      await invalidate();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not update rule status.",
      ),
  });
  const runGeneration = useMutation({
    mutationFn: (values: {
      organization_id: string;
      subject_type: string;
      subject_id: string;
      as_of_date: string;
    }) =>
      morax.generate({
        organization_id: values.organization_id || undefined,
        subject_type: values.subject_type || undefined,
        subject_id: values.subject_id || undefined,
        as_of_date: values.as_of_date || undefined,
      }),
    onSuccess: (result) =>
      setNotice(
        `Generation completed: ${result.created} obligation(s) created.`,
      ),
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "Generation failed."),
  });
  const choices = generationSubjects.data ?? [];
  const openNew = () => {
    form.reset(blankRule());
    setNotice("");
    setFormOpen(true);
  };
  const revise = (row: Row) => {
    form.reset({
      ...blankRule(),
      ...Object.fromEntries(
        Object.entries(blankRule()).map(([key, value]) => [
          key,
          row[key] == null ? value : row[key],
        ]),
      ),
      applicable_months: Array.isArray(row.applicable_months) ? row.applicable_months.join(",") : String(row.applicable_months ?? ""),
      unit_compliance_types: Array.isArray(row.unit_compliance_types) ? row.unit_compliance_types : [],
      version: Number(row.version || 0) + 1,
      active: true,
    } as RuleForm);
    setNotice("");
    setFormOpen(true);
  };
  const resetFilters = () => {
    setSearch("");
    setActFilter("");
    setFrequency("");
    setActive("");
    setPage(1);
  };
  const updateActStatus = async (actName: string, nextActive: boolean) => {
    const actionKey = `${nextActive ? "activate" : "deactivate"}:${actName}`;
    setBusyAction(actionKey);
    try {
      const result = await morax.setActStatus(actName, nextActive) as { updated?: number };
      setNotice(`${actName}: ${result.updated ?? 0} rule version(s) ${nextActive ? "activated" : "deactivated"}.`);
      await invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update the Act status.");
    } finally {
      setBusyAction("");
    }
  };
  const confirmPermanentDelete = async () => {
    if (!deleteTarget || deleteConfirmation.trim() !== deleteTarget.label) return;
    setBusyAction(`delete:${deleteTarget.kind}:${deleteTarget.label}`);
    try {
      const result = deleteTarget.kind === "ACT"
        ? await morax.deleteAct(deleteTarget.label, deleteConfirmation.trim())
        : await morax.deleteRule(deleteTarget.id, deleteConfirmation.trim());
      const deleted = (result as { deleted?: { rules?: number; instances?: number } }).deleted;
      setNotice(`Deleted ${deleted?.rules ?? 0} rule(s) and ${deleted?.instances ?? 0} generated compliance record(s).`);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setDetail(null);
      setPage(1);
      await invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Permanent deletion failed.");
    } finally {
      setBusyAction("");
    }
  };
  const setSorting = (by: string) =>
    setSort((current) =>
      current.by === by
        ? { by, dir: current.dir === "asc" ? "desc" : "asc" }
        : { by, dir: "asc" },
    );
  const total = rules.data?.total ?? 0;
  const size = rules.data?.page_size ?? 10;
  const last = Math.max(1, Math.ceil(total / size));
  return (
    <section className="crud-page compliance-master-page">
      <header className="page-header">
        <div>
          <p className="eyebrow" style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>RULE CONFIGURATION</GradientText>
          </p>
          <h1 style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>Compliance Master</GradientText>
          </h1>
          <p className="muted">
            Rule versions are immutable once created. Use a revision for a
            change; deactivate a version instead of deleting its history.
          </p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="secondary"
            onClick={() => morax.exportRules().catch((error) => setNotice(error instanceof Error ? error.message : "Export failed."))}
          >
            <Download size={16} /> Export current master
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              morax
                .downloadRuleTemplate()
                .catch((error) =>
                  setNotice(
                    error instanceof Error ? error.message : "Download failed.",
                  ),
                )
            }
          >
            <FileSpreadsheet size={16} /> Template
          </button>
          <button type="button" className="primary-action" onClick={openNew}>
            <Plus size={17} /> Add rule version
          </button>
        </div>
      </header>
      {notice && (
        <p
          className={`alert ${/success|completed|updated|validated|replaced|merged|deleted|activated|deactivated|saved/i.test(notice) ? "success" : "error"}`}
        >
          {notice}
        </p>
      )}
      <section className="panel master-utility-grid">
        <form
          onSubmit={generation.handleSubmit((values) =>
            runGeneration.mutate(values),
          )}
        >
          <h2>Generate obligations</h2>
          <div className="generation-form-grid">
            <label className="generation-organization-field">
              Customer organization <span className="required">*</span>
              <select
                {...generation.register("organization_id", { required: true })}
                onChange={(event) => {
                  generation.setValue("organization_id", event.target.value);
                  generation.setValue("subject_type", "");
                  generation.setValue("subject_id", "");
                }}
              >
                <option value="">Select customer organization</option>
                {(customerOrganizations.data ?? []).map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.organization_name ?? item.name ?? "Unnamed organization")}
                    {item.organization_code ? ` (${String(item.organization_code)})` : ""}
                  </option>
                ))}
              </select>
              <small className="muted">Only active customer organizations are shown.</small>
            </label>
            <label>
              Subject type
              <select
                {...generation.register("subject_type")}
                disabled={!generationOrganizationId}
                onChange={(event) => {
                  generation.setValue("subject_type", event.target.value);
                  generation.setValue("subject_id", "");
                }}
              >
                <option value="">All accessible subjects</option>
                <option value="UNIT">Unit</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="CONTRACTOR_SITE">Contractor site</option>
              </select>
            </label>
            <label>
              Subject
              <select
                {...generation.register("subject_id")}
                disabled={!generationOrganizationId || !generationSubjectType || generationSubjects.isLoading}
              >
                <option value="">
                  {generationSubjects.isLoading ? "Loading subjects…" : "All selected subjects"}
                </option>
                {choices?.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {String(item.name)}{item.code ? ` (${String(item.code)})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              As of date
              <input type="date" {...generation.register("as_of_date")} />
            </label>
            <button
              className="primary-action"
              disabled={runGeneration.isPending || !generationOrganizationId}
            >
              {runGeneration.isPending ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
        <div className="master-import">
          <div className="master-import-heading">
            <div>
              <h2>Import workbook</h2>
              <p className="muted">Validate first, review the result, and then confirm how the workbook should be applied.</p>
            </div>
            <span className="master-step-badge">Excel source</span>
          </div>
          <div className="import-mode-grid" role="radiogroup" aria-label="Compliance Master import mode">
            <label className={importMode === "MERGE" ? "selected" : ""}>
              <input type="radio" name="import-mode" checked={importMode === "MERGE"} onChange={() => { setImportMode("MERGE"); setReplaceConfirmation(""); }} />
              <span><b>Merge</b><small>Add new IDs and versions. Existing identical versions are skipped.</small></span>
            </label>
            <label className={importMode === "REPLACE" ? "selected danger" : ""}>
              <input type="radio" name="import-mode" checked={importMode === "REPLACE"} onChange={() => setImportMode("REPLACE")} />
              <span><b>Replace master</b><small>Make this workbook the complete master and remove rules not present.</small></span>
            </label>
          </div>
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => {
              setImportFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setPreviewRows([]);
              setReplaceConfirmation("");
            }}
          />
          <div className="action-row">
            <button
              type="button"
              className="secondary"
              disabled={!importFile || Boolean(busyAction)}
              onClick={async () => {
                setBusyAction("validate-import");
                try {
                  const result = await morax.validateImport(importFile!);
                  setPreview(result);
                   const details = await morax.previewImport(result.id);
                   setPreviewRows(details.rows.filter((row) => !row.valid).slice(0, 5));
                   setNotice(result.error_rows ? "Workbook validation found errors that must be corrected." : "Workbook validated successfully.");
                } catch (error) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : "Workbook validation failed.",
                  );
                 } finally {
                   setBusyAction("");
                }
              }}
            >
              {busyAction === "validate-import" ? "Validating…" : "Validate workbook"}
            </button>
            {preview && (
              <button
                type="button"
                className="primary-action"
                disabled={Boolean(busyAction) || preview.error_rows > 0 || (importMode === "REPLACE" && replaceConfirmation !== "REPLACE")}
                onClick={async () => {
                  setBusyAction("confirm-import");
                  try {
                    const result = await morax.confirmImport(preview.id, importMode, importMode === "REPLACE" ? replaceConfirmation : undefined) as { imported?: number; skipped?: number };
                    setPreview(null);
                    setPreviewRows([]);
                    setImportFile(null);
                    setReplaceConfirmation("");
                    setPage(1);
                    setNotice(`${importMode === "REPLACE" ? "Compliance Master replaced" : "Workbook merged"} successfully: ${result.imported ?? 0} imported, ${result.skipped ?? 0} skipped.`);
                    await invalidate();
                  } catch (error) {
                    setNotice(
                      error instanceof Error ? error.message : "Import failed.",
                    );
                  } finally {
                    setBusyAction("");
                  }
                }}
              >
                {busyAction === "confirm-import" ? "Applying…" : `${importMode === "REPLACE" ? "Replace master" : "Merge"} (${preview.valid_rows}/${preview.total_rows})`}
              </button>
            )}
          </div>
          {preview && (
            <div className={`import-validation-summary ${preview.error_rows ? "has-errors" : "valid"}`}>
              <b>{preview.error_rows ? `${preview.error_rows} row(s) require correction` : `${preview.valid_rows} rows are ready`}</b>
              <span>{preview.total_rows} total · {preview.valid_rows} valid · {preview.error_rows} invalid</span>
            </div>
          )}
          {previewRows.map((row) => (
            <div className="import-row-error" key={row.row_number}>
              <b>Row {row.row_number}</b>
              <span>{row.errors.map((error) => `${error.field}: ${error.message}`).join(" · ")}</span>
            </div>
          ))}
          {preview && importMode === "REPLACE" && preview.error_rows === 0 && (
            <label className="replace-confirmation">
              <span>Type <b>REPLACE</b> to confirm permanent replacement</span>
              <input value={replaceConfirmation} onChange={(event) => setReplaceConfirmation(event.target.value.toUpperCase())} placeholder="REPLACE" autoComplete="off" />
            </label>
          )}
        </div>
      </section>
      <div className="master-summary-strip" aria-label="Compliance Master summary">
        <div><span>Acts</span><b>{acts.data?.length ?? "—"}</b></div>
        <div><span>Rule versions</span><b>{total}</b></div>
        <div><span>Current view</span><b>{actFilter || "All Acts"}</b></div>
      </div>
      <section className="panel entity-list-panel">
        <div className="crud-toolbar">
          <label className="table-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search rule, compliance ID, or Act…"
            />
          </label>
          <label className="compact-filter compliance-act-filter">
            <span>Act</span>
            <select
              value={actFilter}
              onChange={(event) => {
                setActFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All Acts</option>
              {acts.data?.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="compact-filter">
            <span>Frequency</span>
            <select
              value={frequency}
              onChange={(event) => {
                setFrequency(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All frequencies</option>
              {frequencies.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="compact-filter">
            <span>Status</span>
            <select
              value={active}
              onChange={(event) => {
                setActive(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          {(search || actFilter || frequency || active) && (
            <button
              type="button"
              className="text-action"
              onClick={resetFilters}
            >
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
        {rules.isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : rules.isError ? (
          <InlineError message="Unable to load Compliance Master." />
        ) : rules.data?.items.length ? (
          <div className="table-wrap modern-data-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <button
                      className="table-sort"
                      onClick={() => setSorting("compliance_id")}
                    >
                      Compliance ID
                    </button>
                  </th>
                  <th>
                    <button
                      className="table-sort"
                      onClick={() => setSorting("name")}
                    >
                      Rule
                    </button>
                  </th>
                  <th>Entity</th>
                  <th>
                    <button
                      className="table-sort"
                      onClick={() => setSorting("frequency")}
                    >
                      Frequency
                    </button>
                  </th>
                  <th>Risk</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.data.items.map((row, index) => {
                  const actName = text(row, "act") || "Act not specified";
                  const previousAct = index > 0 ? text(rules.data.items[index - 1], "act") || "Act not specified" : "";
                  return (
                  <Fragment key={text(row, "id")}>
                    {actName !== previousAct && (
                      <tr className="compliance-act-group">
                        <td colSpan={8}>
                          <div className="compliance-act-heading">
                            <span><BookOpen size={16} aria-hidden="true" />{actName}</span>
                            {actName !== "Act not specified" && (
                              <span className="compliance-act-actions">
                                <button type="button" className="text-action" disabled={Boolean(busyAction)} onClick={() => updateActStatus(actName, true)} title={`Activate all rules under ${actName}`}><Power size={14} /> Activate</button>
                                <button type="button" className="text-action" disabled={Boolean(busyAction)} onClick={() => updateActStatus(actName, false)} title={`Deactivate all rules under ${actName}`}><PowerOff size={14} /> Deactivate</button>
                                <button type="button" className="text-action danger-text" disabled={Boolean(busyAction)} onClick={() => { setDeleteTarget({ kind: "ACT", label: actName }); setDeleteConfirmation(""); }} title={`Permanently delete ${actName}`}><Trash2 size={14} /> Delete Act</button>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr>
                    <td>{text(row, "compliance_id")}</td>
                    <td>
                      <b>{text(row, "name")}</b>
                      {text(row, "rule_reference") && <><br /><small>{text(row, "rule_reference")}</small></>}
                    </td>
                    <td>{text(row, "entity_type")}</td>
                    <td>{text(row, "frequency")}</td>
                    <td>
                      <span
                        className={`risk-label ${text(row, "risk_level").toLowerCase()}`}
                      >
                        {text(row, "risk_level")}
                      </span>
                    </td>
                    <td>v{text(row, "version")}</td>
                    <td>
                      <span
                        className={`badge ${row.active ? "active" : "inactive"}`}
                      >
                        {row.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="entity-table-actions">
                        <button
                          type="button"
                          className="icon-action"
                          title="View rule version"
                          onClick={() => setDetail(row)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          className="secondary compact-action"
                          onClick={() => revise(row)}
                        >
                          Create revision
                        </button>
                        <button
                          type="button"
                          className="secondary compact-action"
                          disabled={changeStatus.isPending}
                          onClick={() =>
                            changeStatus.mutate({
                              id: text(row, "id"),
                              active: !row.active,
                            })
                          }
                        >
                          {row.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="icon-action danger-icon"
                          title={`Permanently delete ${text(row, "compliance_id")}`}
                          onClick={() => {
                            setDeleteTarget({ kind: "RULE", id: text(row, "rule_id"), label: text(row, "compliance_id") });
                            setDeleteConfirmation("");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No rule versions found"
            description="Change the filters or add the first configured rule version."
          />
        )}
        <footer className="table-pagination">
          <span>
            {total
              ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
              : "No records"}
          </span>
          <div>
            <button
              className="icon-action"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>
              Page {page} of {last}
            </span>
            <button
              className="icon-action"
              disabled={page >= last}
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </button>
          </div>
        </footer>
      </section>
      {formOpen && (
        <MasterSheet
          title={
            form.getValues("version") === 1
              ? "Add rule version"
              : "Create revised rule version"
          }
          onClose={() => setFormOpen(false)}
        >
          <form
            className="entity-form"
            onSubmit={form.handleSubmit((values) => save.mutate(values))}
          >
            <div className="form-section">
              <h3>Rule identity and applicability</h3>
              <div className="form-grid">
                <RuleField
                  label="Compliance ID"
                  error={form.formState.errors.compliance_id?.message}
                >
                  <input {...form.register("compliance_id")} />
                </RuleField>
                <RuleField
                  label="Rule name"
                  error={form.formState.errors.name?.message}
                >
                  <input {...form.register("name")} />
                </RuleField>
                <RuleField label="Version">
                  <input type="number" min="1" {...form.register("version")} />
                </RuleField>
                <RuleField label="Entity type">
                  <select {...form.register("entity_type")}>
                    <option value="UNIT">Unit</option>
                    <option value="CONTRACTOR">Contractor</option>
                    <option value="CONTRACTOR_SITE">Contractor site</option>
                  </select>
                </RuleField>
                <RuleField label="State">
                  <select {...form.register("state_id")}>
                    <option value="">All states</option>
                    {options.data?.states.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </RuleField>
                <RuleField label="Industry">
                  <select {...form.register("industry_type_id")}>
                    <option value="">All industries</option>
                    {options.data?.industries.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </RuleField>
                <RuleField label="Employee threshold">
                  <input type="number" min="0" {...form.register("employee_threshold")} />
                </RuleField>
                {form.watch("entity_type") === "UNIT" && (
                  <RuleField label="Unit Compliance Types" wide>
                    <div className="checkbox-grid">
                      {unitComplianceTypes.map((type) => (
                        <label className="checkbox-option" key={type}>
                          <input
                            type="checkbox"
                            checked={form.watch("unit_compliance_types").includes(type)}
                            onChange={(event) => {
                              const selected = form.getValues("unit_compliance_types");
                              form.setValue("unit_compliance_types", event.target.checked ? [...selected, type] : selected.filter((value) => value !== type), { shouldDirty: true, shouldValidate: true });
                            }}
                          />
                          <span>{type}</span>
                        </label>
                      ))}
                    </div>
                    <small>Leave empty only for a universal Unit rule. Otherwise, at least one selected type must match the Unit.</small>
                  </RuleField>
                )}
              </div>
            </div>
            <div className="form-section">
              <h3>Schedule and evidence</h3>
              <div className="form-grid">
                <RuleField label="Frequency">
                  <select {...form.register("frequency")}>
                    {frequencies.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </RuleField>
                <RuleField label="Applicable months">
                  <input {...form.register("applicable_months")} placeholder="e.g. 6,12 for half-yearly PT" />
                </RuleField>
                <RuleField label="Due date method">
                  <select {...form.register("due_date_rule")}>
                    {dueRules.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </RuleField>
                <RuleField label="Due day / offset">
                  <input type="number" {...form.register("due_date_offset")} />
                </RuleField>
                <RuleField label="Due date anchor">
                  <input {...form.register("due_date_anchor")} />
                </RuleField>
                <RuleField label="Grace days">
                  <input
                    type="number"
                    min="0"
                    {...form.register("grace_days")}
                  />
                </RuleField>
                <RuleField label="Risk">
                  <select {...form.register("risk_level")}>
                    <option>LOW</option>
                    <option>MEDIUM</option>
                    <option>HIGH</option>
                    <option>CRITICAL</option>
                  </select>
                </RuleField>
                <RuleField label="Effective from">
                  <input type="date" {...form.register("effective_from")} />
                </RuleField>
                <RuleField label="Effective to">
                  <input type="date" {...form.register("effective_to")} />
                </RuleField>
                <RuleField label="Required evidence">
                  <input {...form.register("required_document")} />
                </RuleField>
                <label className="inline">
                  <input type="checkbox" {...form.register("active")} /> Active
                  version
                </label>
              </div>
            </div>
            <div className="form-section">
              <h3>Legal references</h3>
              <div className="form-grid">
                <RuleField label="Act *" error={form.formState.errors.act?.message}>
                  <input {...form.register("act")} />
                </RuleField>
                <RuleField label="Rule reference">
                  <input {...form.register("rule_reference")} />
                </RuleField>
                <RuleField label="Section">
                  <input {...form.register("section")} />
                </RuleField>
                <RuleField label="Compliance type">
                  <input {...form.register("compliance_type")} />
                </RuleField>
                <RuleField label="Document type">
                  <select {...form.register("document_type")}>
                    <option value="">Select document type</option>
                    {documentTypes.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </RuleField>
                <RuleField label="Form number">
                  <input {...form.register("form_number")} />
                </RuleField>
                <RuleField label="Description" wide>
                  <textarea {...form.register("description")} />
                </RuleField>
                <RuleField label="Legal description" wide>
                  <textarea {...form.register("legal_description")} />
                </RuleField>
                <RuleField label="Consequence / penalty" wide>
                  <textarea {...form.register("consequence_or_penalty")} />
                </RuleField>
              </div>
            </div>
            <footer className="drawer-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </button>
              <button className="primary-action" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save rule version"}
              </button>
            </footer>
          </form>
        </MasterSheet>
      )}
      {detail && (
        <MasterSheet
          title={`${text(detail, "compliance_id")} — v${text(detail, "version")}`}
          onClose={() => setDetail(null)}
        >
          <div className="entity-form">
            <dl className="dialog-detail-grid">
              <div>
                <dt>Name</dt>
                <dd>{text(detail, "name")}</dd>
              </div>
              <div>
                <dt>Act</dt>
                <dd>{text(detail, "act") || "Not specified"}</dd>
              </div>
              <div>
                <dt>Rule / reference</dt>
                <dd>{text(detail, "rule_reference") || "Not specified"}</dd>
              </div>
              <div>
                <dt>Frequency</dt>
                <dd>{text(detail, "frequency")}</dd>
              </div>
              <div>
                <dt>Effective from</dt>
                <dd>{text(detail, "effective_from")}</dd>
              </div>
              <div>
                <dt>Due date rule</dt>
                <dd>{text(detail, "due_date_rule")}</dd>
              </div>
              <div>
                <dt>Employee threshold</dt>
                <dd>{text(detail, "employee_threshold") || "No threshold"}</dd>
              </div>
              <div className="wide">
                <dt>Description</dt>
                <dd>{text(detail, "description") || "Not provided"}</dd>
              </div>
            </dl>
          </div>
        </MasterSheet>
      )}
      {deleteTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => { if (!busyAction) setDeleteTarget(null); }}>
          <section className="compliance-dialog master-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="master-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div>
                <span className="destructive-kicker">Permanent development deletion</span>
                <h2 id="master-delete-title">Delete {deleteTarget.kind === "ACT" ? "Act and all its rules" : "compliance rule"}?</h2>
                <p>This also removes generated compliance records, assignments, submissions, workflow history, and evidence linked to the selected rules.</p>
              </div>
              <button type="button" className="icon-action" disabled={Boolean(busyAction)} onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <div className="master-delete-target"><span>{deleteTarget.kind === "ACT" ? "Act" : "Compliance ID"}</span><b>{deleteTarget.label}</b></div>
            <label className="replace-confirmation">
              <span>Enter the exact {deleteTarget.kind === "ACT" ? "Act name" : "Compliance ID"} to confirm</span>
              <input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoFocus autoComplete="off" />
            </label>
            <div className="dialog-footer">
              <span className="muted">This operation is audited and cannot be undone from the application.</span>
              <div className="action-row">
                <button type="button" className="secondary" disabled={Boolean(busyAction)} onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button type="button" className="danger-action" disabled={deleteConfirmation.trim() !== deleteTarget.label || Boolean(busyAction)} onClick={confirmPermanentDelete}>{busyAction ? "Deleting…" : "Permanently delete"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function MasterSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="crud-drawer-backdrop" onMouseDown={onClose}>
      <section
        className="crud-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <div>
              <h2>{title}</h2>
              <p>
                Historical versions remain auditable and cannot be overwritten.
              </p>
            </div>
          </div>
          <button type="button" className="icon-action" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function RuleField({
  label,
  error,
  wide = false,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

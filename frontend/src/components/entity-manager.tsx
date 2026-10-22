import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import GradientText from "./GradientText/GradientText";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  MapPin,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { morax } from "../api/morax";
import type { EntityUserAssignment, Master, User } from "../api/morax";
import { EmptyState, InlineError, LoadingSkeleton } from "./workspace-ui";

type Row = Record<string, unknown>;
type EntityKind = "units" | "contractors" | "sites";
type ContractorMakerLogin = { id: string; name: string; email: string; active: boolean };

type EntityForm = {
  name: string;
  code: string;
  unit_type: string;
  contractor_type: string;
  unit_id: string;
  contractor_id: string;
  maker_user_id: string;
  checker_user_id: string;
  state_id: string;
  city_id: string;
  industry_type_id: string;
  other_industry_name: string;
  city: string;
  pincode: string;
  address: string;
  registration_identifiers: string;
  gstin: string;
  pan: string;
  lin: string;
  employer_name: string;
  applicable_regulations: string;
  compliance_types: string[];
  contractor_maker_email: string;
  contractor_maker_password: string;
  contractor_maker_password_confirmation: string;
  male_employees: string;
  female_employees: string;
  male_workers: string;
  female_workers: string;
  contact_email: string;
  contact_phone: string;
  worker_limit: string;
  effective_date: string;
  compliance_start_date: string;
  contract_start_date: string;
  contract_end_date: string;
  work_order_expiry_date: string;
  status: "ACTIVE" | "INACTIVE";
};

type AssignmentRole = "ADMIN" | "MAKER" | "CHECKER";
type PendingEntityUser = { name: string; email: string; mobile: string; password: string };
type FormAssignment = {
  key: string;
  user_id?: string;
  role: AssignmentRole;
  pending_user?: PendingEntityUser;
};

const assignmentKey = () =>
  `assignment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const scopeRoleFor = (kind: "units" | "contractors", role: AssignmentRole) =>
  kind === "units"
    ? ({ ADMIN: "UNIT_ADMIN", MAKER: "UNIT_MAKER", CHECKER: "UNIT_CHECKER" } as const)[role]
    : ({ ADMIN: "CONTRACTOR_ADMIN", MAKER: "CONTRACTOR_MAKER", CHECKER: "CONTRACTOR_CHECKER" } as const)[role];

const entityTableFeatures = tableFeatures({ rowSortingFeature });
const EMPTY_ROWS: Row[] = [];

const blankEntity = (): EntityForm => ({
  name: "",
  code: "",
  unit_type: "",
  contractor_type: "",
  unit_id: "",
  contractor_id: "",
  maker_user_id: "",
  checker_user_id: "",
  state_id: "",
  city_id: "",
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
  compliance_types: [],
  contractor_maker_email: "",
  contractor_maker_password: "",
  contractor_maker_password_confirmation: "",
  male_employees: "0",
  female_employees: "0",
  male_workers: "0",
  female_workers: "0",
  contact_email: "",
  contact_phone: "",
  worker_limit: "",
  effective_date: "",
  compliance_start_date: new Date().toISOString().slice(0, 10),
  contract_start_date: "",
  contract_end_date: "",
  work_order_expiry_date: "",
  status: "ACTIVE",
});

const entitySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: z.string().trim().max(100),
  unit_type: z.string(),
  contractor_type: z.string(),
  unit_id: z.string(),
  contractor_id: z.string(),
  maker_user_id: z.string(),
  checker_user_id: z.string(),
  state_id: z.string(),
  city_id: z.string(),
  industry_type_id: z.string(),
  other_industry_name: z.string(),
  city: z.string(),
  pincode: z.string(),
  address: z.string(),
  registration_identifiers: z.string(),
  gstin: z.string(),
  pan: z.string(),
  lin: z.string(),
  employer_name: z.string(),
  applicable_regulations: z.string(),
  compliance_types: z.array(z.string()),
  contractor_maker_email: z.string(),
  contractor_maker_password: z.string(),
  contractor_maker_password_confirmation: z.string(),
  male_employees: z.string().regex(/^\d+$/, "Use a whole number"),
  female_employees: z.string().regex(/^\d+$/, "Use a whole number"),
  male_workers: z.string().regex(/^\d+$/, "Use a whole number"),
  female_workers: z.string().regex(/^\d+$/, "Use a whole number"),
  contact_email: z.string(),
  contact_phone: z.string(),
  worker_limit: z.string().regex(/^\d*$/, "Use a whole number"),
  effective_date: z.string(),
  compliance_start_date: z.string(),
  contract_start_date: z.string(),
  contract_end_date: z.string(),
  work_order_expiry_date: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const entityMeta: Record<
  EntityKind,
  { title: string; singular: string; icon: typeof Building2 }
> = {
  units: { title: "Units / branches", singular: "unit", icon: Building2 },
  contractors: {
    title: "Contractors",
    singular: "contractor",
    icon: UsersRound,
  },
  sites: {
    title: "Contractor sites",
    singular: "contractor site",
    icon: MapPin,
  },
};

function text(row: Row, key: string) {
  const value = row[key];
  return value == null || value === "" ? "—" : String(value);
}

function contractorMakers(row: Row): ContractorMakerLogin[] {
  const makers = row.contractor_makers;
  if (!Array.isArray(makers)) return [];
  return makers.flatMap((maker) => {
    if (!maker || typeof maker !== "object") return [];
    const record = maker as Record<string, unknown>;
    if (!record.id || !record.email) return [];
    return [{
      id: String(record.id),
      name: String(record.name ?? "Contractor Maker"),
      email: String(record.email),
      active: record.active !== false,
    }];
  });
}

function asForm(row: Row): EntityForm {
  const defaults = blankEntity();
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      key === "compliance_types"
        ? (Array.isArray(row[key]) ? row[key].map(String) : fallback)
        : row[key] == null ? fallback : String(row[key]),
    ]),
  ) as EntityForm;
}

function requestBody(values: EntityForm, kind: EntityKind) {
  const numericFields =
    kind === "units"
      ? ["male_employees", "female_employees", "worker_limit"]
      : ["male_workers", "female_workers"];
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      key === "worker_limit" ? (value === "" ? null : Number(value)) : numericFields.includes(key) ? Number(value || 0) : Array.isArray(value) ? value : value || null,
    ]),
  );
}

function isOrganizationEntityAdmin(user: User) {
  return (
    user.platform_role === "MORAX_ADMIN" ||
    user.roles.includes("ORGANIZATION_ADMIN")
  );
}

export function ModernEntities({ user }: { user: User }) {
  const { kind = "units" } = useParams();
  const validKind: EntityKind =
    kind === "contractors" || kind === "sites" ? kind : "units";
  return <EntityManager key={validKind} user={user} kind={validKind} />;
}

function EntityManager({ user, kind }: { user: User; kind: EntityKind }) {
  const queryClient = useQueryClient();
  const canManage = isOrganizationEntityAdmin(user);
  const meta = entityMeta[kind];
  const Icon = meta.icon;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [entityAssignments, setEntityAssignments] = useState<FormAssignment[]>([]);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newEntityUser, setNewEntityUser] = useState<{
    name: string;
    email: string;
    mobile: string;
    password: string;
    password_confirmation: string;
    role: AssignmentRole;
  }>({ name: "", email: "", mobile: "", password: "", password_confirmation: "", role: "MAKER" });
  const [newEntityUserError, setNewEntityUserError] = useState("");
  const [contractorMakerPasswordTarget, setContractorMakerPasswordTarget] = useState<ContractorMakerLogin | null>(null);
  const [contractorMakerPassword, setContractorMakerPassword] = useState("");
  const [contractorMakerPasswordConfirmation, setContractorMakerPasswordConfirmation] = useState("");
  const [contractorMakerPasswordError, setContractorMakerPasswordError] = useState("");
  const [contractorFiles, setContractorFiles] = useState<Record<string, File | null>>({
    WORK_ORDER: null, REGISTRATION_CERTIFICATE: null, PF: null, ESI: null, LABOUR_LICENCE: null,
  });
  const [otherDocuments, setOtherDocuments] = useState<File[]>([]);

  const sort = sorting[0];
  const listFilters = useMemo(
    () => ({
      page: String(page),
      page_size: "10",
      q: deferredSearch.trim() || undefined,
      status: status || undefined,
      sort_by: sort?.id || "name",
      sort_dir: sort?.desc ? "desc" : "asc",
    }),
    [deferredSearch, page, sort?.desc, sort?.id, status],
  );

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, status, sort?.desc, sort?.id]);

  const listQuery = useQuery({
    queryKey: ["entity-list", kind, listFilters],
    queryFn: () =>
      kind === "units"
        ? morax.unitsPage(listFilters)
        : kind === "contractors"
          ? morax.contractorsPage(listFilters)
          : morax.sitesPage(listFilters),
    staleTime: 30_000,
  });

  const optionsQuery = useQuery({
    queryKey: ["entity-form-options"],
    queryFn: async () => {
      const [states, industries, units, contractors, users] = await Promise.all([
        morax.states(),
        morax.industries(),
        morax.unitsPage({ page: "1", page_size: "100" }),
        morax.contractors(),
        morax.users(),
      ]);
      return { states, industries, units: units.items, contractors, users };
    },
    staleTime: 5 * 60_000,
  });
  const entityAssignmentsQuery = useQuery({
    queryKey: ["entity-user-assignments", kind, editing?.id],
    queryFn: () =>
      kind === "units"
        ? morax.unitUserAssignments(String(editing?.id))
        : morax.contractorUserAssignments(String(editing?.id)),
    enabled: canManage && formOpen && Boolean(editing?.id) && kind !== "sites",
  });
  const contractorDocumentsQuery = useQuery({
    queryKey: ["contractor-documents", editing?.id],
    queryFn: () => morax.contractorDocuments(String(editing?.id)),
    enabled: kind === "contractors" && formOpen && Boolean(editing?.id),
  });

  const form = useForm<EntityForm>({
    resolver: zodResolver(entitySchema),
    defaultValues: blankEntity(),
  });
  const selectedStateId = form.watch("state_id");
  const selectedPrincipalEmployerId = form.watch("unit_id");
  const selectedIndustryId = form.watch("industry_type_id");
  const citiesQuery = useQuery({
    queryKey: ["cities", selectedStateId],
    queryFn: () => morax.cities(selectedStateId),
    enabled: Boolean(selectedStateId),
    staleTime: 5 * 60_000,
  });
  const otherIndustryId = optionsQuery.data?.industries.find(
    (industry) => industry.code.toUpperCase() === "OTHER",
  )?.id;
  const isOtherIndustry = selectedIndustryId === otherIndustryId;
  const selectedPrincipalEmployer = optionsQuery.data?.units.find((unit) => String(unit.id) === selectedPrincipalEmployerId);
  const requestedWorkers = Number(form.watch("male_workers") || 0) + Number(form.watch("female_workers") || 0);
  const allocatedWorkers = (optionsQuery.data?.contractors ?? [])
    .filter((contractor) => String(contractor.unit_id ?? "") === selectedPrincipalEmployerId && String(contractor.id) !== String(editing?.id ?? ""))
    .reduce((total, contractor) => total + Number(contractor.total_workers ?? 0), 0);
  const workerLimit = selectedPrincipalEmployer?.worker_limit == null ? null : Number(selectedPrincipalEmployer.worker_limit);
  const remainingWorkers = workerLimit == null ? null : workerLimit - allocatedWorkers;
  const availableUsers = (optionsQuery.data?.users ?? []).filter(
    (person) => person.active !== false,
  );

  useEffect(() => {
    if (!entityAssignmentsQuery.data) return;
    setEntityAssignments(entityAssignmentsQuery.data.map((assignment) => ({
      key: assignmentKey(),
      user_id: assignment.user_id,
      role: assignment.role,
    })));
  }, [entityAssignmentsQuery.data]);

  useEffect(() => {
    if (kind !== "contractors" || !selectedPrincipalEmployerId) return;
    const employer = optionsQuery.data?.units.find((unit) => String(unit.id) === selectedPrincipalEmployerId);
    if (!employer) return;
    form.setValue("state_id", String(employer.state_id ?? ""));
  }, [form, kind, optionsQuery.data?.units, selectedPrincipalEmployerId]);

  const invalidateEntities = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["entity-list", kind] }),
      queryClient.invalidateQueries({ queryKey: ["entity-form-options"] }),
      queryClient.invalidateQueries({ queryKey: ["entity-user-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["users-page"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: EntityForm) => {
      if ((kind === "units" || kind === "sites") && !values.state_id) {
        throw new Error("Select a State before saving");
      }
      if ((kind === "units" || kind === "sites") && !values.industry_type_id) {
        throw new Error("Select an industry type before saving");
      }
      if ((kind === "units" || kind === "contractors" || kind === "sites") && !values.city_id) {
        throw new Error("Select a City / District before saving");
      }
      if (kind === "contractors" && !values.unit_id) {
        throw new Error("Select the Principal Employer before saving");
      }
      if (kind === "contractors" && !editing && (!values.contractor_maker_email.trim() || !values.contractor_maker_password)) {
        throw new Error("Contractor Maker email and password are required.");
      }
      if (kind === "contractors" && values.contractor_maker_password !== values.contractor_maker_password_confirmation) {
        throw new Error("Contractor Maker password and Confirm password must match.");
      }
      if (kind === "sites" && !values.contractor_id) {
        throw new Error("Select a contractor before saving");
      }
      if (kind === "units" || kind === "contractors") {
        const roles = new Set(entityAssignments.map((assignment) => assignment.role));
        if (kind === "contractors" && values.contractor_maker_email.trim() && values.contractor_maker_password) {
          roles.add("MAKER");
        }
        const missing = (["MAKER", "CHECKER"] as AssignmentRole[]).filter((role) => !roles.has(role));
        if (missing.length) {
          throw new Error(`Assign at least one ${missing.map((role) => role[0] + role.slice(1).toLowerCase()).join(" and ")} before saving.`);
        }
      }
      const stagedAssignmentKeys = new Set<string>();
      for (const assignment of entityAssignments) {
        const assignmentUserKey = assignment.pending_user
          ? assignment.pending_user.email.trim().toLowerCase()
          : assignment.user_id;
        if (!assignmentUserKey) {
          throw new Error("Select a user for every assignment.");
        }
        const stagedAssignmentKey = `${assignmentUserKey}:${assignment.role}`;
        if (stagedAssignmentKeys.has(stagedAssignmentKey)) {
          throw new Error("A user can be assigned to the same role only once.");
        }
        stagedAssignmentKeys.add(stagedAssignmentKey);
        if (!assignment.pending_user) continue;
        const duplicate = optionsQuery.data?.users.some(
          (person) => person.email.toLowerCase() === assignment.pending_user?.email.trim().toLowerCase(),
        );
        if (duplicate) {
          throw new Error(`${assignment.pending_user.email} already has an account. Select the existing user instead.`);
        }
      }
      const body = requestBody(values, kind);
      const id = editing ? String(editing.id) : "";
      let saved: Record<string, unknown>;
      if (kind === "units") {
        saved = await (id ? morax.updateUnit(id, body) : morax.createUnit(body)) as Record<string, unknown>;
      } else if (kind === "contractors") {
        saved = await (id
          ? morax.updateContractor(id, body)
          : morax.createContractor(body)) as Record<string, unknown>;
        const contractorId = String(saved.id);
        const uploads: Promise<unknown>[] = [];
        for (const [documentType, file] of Object.entries(contractorFiles)) {
          if (file) uploads.push(morax.uploadContractorDocument(contractorId, documentType, file));
        }
        for (const file of otherDocuments) uploads.push(morax.uploadContractorDocument(contractorId, "OTHER", file));
        await Promise.all(uploads);
      } else {
        return id ? morax.updateSite(id, body) : morax.createSite(body);
      }

      const entityId = String(saved.id);
      const assignments: EntityUserAssignment[] = [];
      const createdPendingUsers = new Map<string, string>();
      const assignmentKeys = new Set<string>();
      const contractorMakerId = kind === "contractors" ? String(saved.contractor_maker_user_id ?? "") : "";
      if (contractorMakerId) {
        assignments.push({ user_id: contractorMakerId, role: "MAKER" });
        assignmentKeys.add(`${contractorMakerId}:MAKER`);
      }
      for (const assignment of entityAssignments) {
        let userId = assignment.user_id;
        if (assignment.pending_user) {
          const email = assignment.pending_user.email.trim().toLowerCase();
          userId = createdPendingUsers.get(email);
          if (!userId) {
            const created = await morax.createUser({
              ...assignment.pending_user,
              mobile: assignment.pending_user.mobile || null,
              active: true,
              role_scopes: [{
                role: scopeRoleFor(kind, assignment.role),
                scope_type: kind === "units" ? "UNIT" : "CONTRACTOR",
                scope_id: entityId,
              }],
              module_permissions: [],
            });
            userId = created.id;
            createdPendingUsers.set(email, userId);
          }
        }
        if (userId) {
          const assignmentKey = `${userId}:${assignment.role}`;
          if (assignmentKeys.has(assignmentKey)) {
            throw new Error("A user can be assigned to the same role only once.");
          }
          assignmentKeys.add(assignmentKey);
          assignments.push({ user_id: userId, role: assignment.role });
        }
      }
      if (kind === "units") {
        await morax.replaceUnitUserAssignments(entityId, assignments);
      } else {
        await morax.replaceContractorUserAssignments(entityId, assignments);
      }
      return saved;
    },
    onSuccess: async () => {
      setNotice(
        `${editing ? "Updated" : "Created"} ${meta.singular} successfully.`,
      );
      closeForm();
      await invalidateEntities();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not save the record.",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: Row) => {
      const id = String(row.id);
      if (kind === "units") return morax.deleteUnit(id);
      if (kind === "contractors") return morax.deleteContractor(id);
      return morax.deleteSite(id);
    },
    onSuccess: async () => {
      setNotice(
        `${meta.singular[0].toUpperCase()}${meta.singular.slice(1)} deleted.`,
      );
      await invalidateEntities();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not delete the record.",
      ),
  });

  const contractorMakerPasswordMutation = useMutation({
    mutationFn: ({ target, password }: { target: ContractorMakerLogin; password: string }) =>
      morax.resetUserPassword(target.id, password),
    onSuccess: async (result) => {
      setNotice(`Password reset for ${result.username}.`);
      setContractorMakerPasswordTarget(null);
      setContractorMakerPassword("");
      setContractorMakerPasswordConfirmation("");
      setContractorMakerPasswordError("");
      await invalidateEntities();
    },
    onError: (error) => setContractorMakerPasswordError(
      error instanceof Error ? error.message : "Could not reset the Contractor Maker password.",
    ),
  });

  const openCreate = () => {
    setNotice("");
    setEditing(null);
    form.reset(blankEntity());
    setEntityAssignments([]);
    setNewUserOpen(false);
    setNewEntityUserError("");
    setNewEntityUser({ name: "", email: "", mobile: "", password: "", password_confirmation: "", role: "MAKER" });
    setContractorFiles({ WORK_ORDER: null, REGISTRATION_CERTIFICATE: null, PF: null, ESI: null, LABOUR_LICENCE: null });
    setOtherDocuments([]);
    setFormOpen(true);
  };
  const openEdit = useCallback(
    (row: Row) => {
      setNotice("");
      setEditing(row);
      form.reset(asForm(row));
      setEntityAssignments([]);
      setNewUserOpen(false);
      setNewEntityUserError("");
      setContractorFiles({ WORK_ORDER: null, REGISTRATION_CERTIFICATE: null, PF: null, ESI: null, LABOUR_LICENCE: null });
      setOtherDocuments([]);
      setFormOpen(true);
    },
    [form],
  );
  const closeForm = () => {
    setEditing(null);
    form.reset(blankEntity());
    setEntityAssignments([]);
    setNewUserOpen(false);
    setNewEntityUserError("");
    setNewEntityUser({ name: "", email: "", mobile: "", password: "", password_confirmation: "", role: "MAKER" });
    setContractorFiles({ WORK_ORDER: null, REGISTRATION_CERTIFICATE: null, PF: null, ESI: null, LABOUR_LICENCE: null });
    setOtherDocuments([]);
    setFormOpen(false);
  };

  const columns = useMemo<
    ColumnDef<typeof entityTableFeatures, Row, unknown>[]
  >(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="entity-name-cell">
            <b>{text(row.original, "name")}</b>
            <span>{text(row.original, "code")}</span>
          </div>
        ),
      },
      {
        accessorKey: "state_name",
        header: "State",
        cell: ({ row }) => text(row.original, "state_name"),
      },
      {
        accessorKey: "industry_name",
        header: "Industry",
        cell: ({ row }) => text(row.original, "industry_name"),
      },
      ...(kind === "contractors" ? [{
        id: "contractor_maker_login",
        header: "Contractor Maker login",
        enableSorting: false,
        cell: ({ row }: { row: { original: Row } }) => {
          const makers = contractorMakers(row.original);
          const primaryMaker = makers[0];
          if (!primaryMaker) return <span className="muted">No Contractor Maker</span>;
          return (
            <div className="entity-login-cell">
              <b>{primaryMaker.name}</b>
              <small>{primaryMaker.email}</small>
              {makers.length > 1 && <small>+{makers.length - 1} additional Maker{makers.length > 2 ? "s" : ""}</small>}
              {canManage && <button
                type="button"
                className="text-action"
                onClick={() => {
                  setContractorMakerPasswordTarget(primaryMaker);
                  setContractorMakerPassword("");
                  setContractorMakerPasswordConfirmation("");
                  setContractorMakerPasswordError("");
                }}
              >
                Set new password
              </button>}
            </div>
          );
        },
      }] : []),
      {
        id: "workforce",
        header: kind === "units" ? "Employees" : "Workers",
        enableSorting: false,
        cell: ({ row }) =>
          text(
            row.original,
            kind === "units" ? "total_employees" : "total_workers",
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`badge ${text(row.original, "status").toLowerCase()}`}
          >
            {text(row.original, "status")}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="entity-table-actions">
              <button
                type="button"
                className="icon-action"
                title={`Edit ${meta.singular}`}
                aria-label={`Edit ${meta.singular}`}
                onClick={() => openEdit(row.original)}
              >
                <Edit3 size={16} />
              </button>
              <button
                type="button"
                className="icon-action danger"
                title={`Delete ${meta.singular}`}
                aria-label={`Delete ${meta.singular}`}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${text(row.original, "name")}? Records with compliance history cannot be deleted.`,
                    )
                  ) {
                    deleteMutation.mutate(row.original);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ) : null,
      },
    ],
    [canManage, deleteMutation, kind, meta.singular, openEdit],
  );

  const table = useTable({
    features: entityTableFeatures,
    data: listQuery.data?.items ?? EMPTY_ROWS,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
  });
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.page_size ?? 10;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="crud-page">
      <header className="page-header">
        <div>
          <p className="eyebrow" style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>ENTITY MANAGEMENT</GradientText>
          </p>
          <h1 style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>{meta.title}</GradientText>
          </h1>
          <p className="muted">
            Manage the organization records used throughout compliance
            operations.
          </p>
        </div>
        {canManage && (
          <button type="button" className="primary-action" onClick={openCreate}>
            <Plus size={17} /> Add {meta.singular}
          </button>
        )}
      </header>

      {notice && (
        /^(Created|Updated|Unit deleted|Contractor deleted|Contractor site deleted)/.test(notice) ? (
          <div className="alert success" role="status">{notice}</div>
        ) : (
          <InlineError message={notice} />
        )
      )}
      {!canManage && (
        <InlineError message="Organization administrator permission is required to manage these entities." />
      )}

      <section className="panel entity-list-panel">
        <div className="crud-toolbar">
          <label className="table-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label={`Search ${meta.title}`}
              value={search}
              placeholder={`Search ${meta.title.toLowerCase()}…`}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="compact-filter">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          {(search || status) && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setSearch("");
                setStatus("");
              }}
            >
              <X size={15} /> Clear filters
            </button>
          )}
        </div>

        {listQuery.isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : listQuery.isError ? (
          <InlineError message="Unable to load organization records." />
        ) : table.getRowModel().rows.length === 0 ? (
          <EmptyState
            title={`No ${meta.title.toLowerCase()} found`}
            description="Change the filters or add the first record for this organization."
          />
        ) : (
          <div className="table-wrap modern-data-table">
            <table>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id}>
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="table-sort"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            <span aria-hidden="true">
                              {header.column.getIsSorted() === "asc"
                                ? "↑"
                                : header.column.getIsSorted() === "desc"
                                  ? "↓"
                                  : "↕"}
                            </span>
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <motion.tbody
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
                }}
              >
                {table.getRowModel().rows.map((row) => (
                  <motion.tr 
                    key={row.id}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
                    }}
                    whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
        <footer className="table-pagination">
          <span>
            {total === 0
              ? "No records"
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          </span>
          <div>
            <button
              type="button"
              className="icon-action"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {page} of {lastPage}
            </span>
            <button
              type="button"
              className="icon-action"
              disabled={page >= lastPage}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      </section>

      {canManage && formOpen && (
        <div
          className="workspace-form-backdrop"
          role="presentation"
          onMouseDown={closeForm}
        >
          <section
            className="workspace-form"
            role="region"
            aria-labelledby="entity-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <span className="drawer-icon">
                  <Icon size={19} />
                </span>
                <div>
                  <h2 id="entity-form-title">
                    {editing ? `Edit ${meta.singular}` : `Add ${meta.singular}`}
                  </h2>
                  <p>Required fields are marked by the validation feedback.</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-action"
                onClick={closeForm}
                aria-label="Close form"
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="entity-form"
              onSubmit={form.handleSubmit((values) =>
                saveMutation.mutate(values),
              )}
            >
              <div className="form-section">
                <h3>Identity</h3>
                <div className="form-grid">
                  <Field
                    label="Name"
                    error={form.formState.errors.name?.message}
                  >
                    <input {...form.register("name")} autoFocus />
                  </Field>
                  {kind !== "units" && (
                    <Field
                      label="Code"
                      error={form.formState.errors.code?.message}
                    >
                      <input {...form.register("code")} required />
                    </Field>
                  )}
                  {kind === "units" ? (
                    <Field label="Unit type">
                      <input
                        {...form.register("unit_type")}
                        placeholder="Factory, branch, office…"
                        required
                      />
                    </Field>
                  ) : (
                    <Field label={kind === "contractors" ? "Principal Employer" : "Parent unit"}>
                      <select
                        {...form.register("unit_id", {
                          onChange: (event) => {
                            if (kind !== "contractors") return;
                            const principalEmployer = optionsQuery.data?.units.find(
                              (unit) => String(unit.id) === event.target.value,
                            );
                            form.setValue("state_id", String(principalEmployer?.state_id ?? ""));
                            form.setValue("city_id", "");
                            form.setValue("city", "");
                          },
                        })}
                        required={kind === "contractors"}
                      >
                        <option value="">{kind === "contractors" ? "Select Principal Employer" : "Not linked"}</option>
                        {optionsQuery.data?.units.map((unit) => (
                          <option key={String(unit.id)} value={String(unit.id)}>
                            {text(unit, "name")}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {kind === "contractors" && (
                    <Field label="Nature of Work">
                      <input {...form.register("contractor_type")} required />
                    </Field>
                  )}
                  {kind === "sites" && (
                    <Field
                      label="Contractor"
                      error={form.formState.errors.contractor_id?.message}
                    >
                      <select {...form.register("contractor_id")} required>
                        <option value="">Select contractor</option>
                        {optionsQuery.data?.contractors.map((contractor) => (
                          <option
                            key={String(contractor.id)}
                            value={String(contractor.id)}
                          >
                            {text(contractor, "name")}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                {kind === "units" && !editing && <p className="muted">A unique Unit Code will be generated automatically when saved.</p>}
              </div>

              <div className="form-section">
                <h3>Compliance profile</h3>
                <div className="form-grid">
                  <Field
                    label="State"
                    error={form.formState.errors.state_id?.message}
                  >
                    <select
                      {...form.register("state_id", {
                        onChange: () => {
                          if (kind !== "contractors") {
                            form.setValue("city_id", "");
                            form.setValue("city", "");
                          }
                        },
                      })}
                      disabled={kind === "contractors"}
                      required={kind !== "contractors"}
                    >
                      <option value="">
                        {kind === "contractors"
                          ? "Not configured"
                          : "Select state"}
                      </option>
                      {optionsQuery.data?.states.map((state: Master) => (
                        <option key={state.id} value={state.id}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {kind !== "contractors" && <Field
                    label="Industry type"
                    error={form.formState.errors.industry_type_id?.message}
                  >
                    <select {...form.register("industry_type_id")} required>
                      <option value="">Select industry</option>
                      {optionsQuery.data?.industries.map((industry: Master) => (
                        <option key={industry.id} value={industry.id}>
                          {industry.code.toUpperCase() === "OTHER"
                            ? "Other industry"
                            : industry.name}
                        </option>
                      ))}
                    </select>
                  </Field>}
                  {kind !== "contractors" && isOtherIndustry && (
                    <Field label="Other industry name">
                      <input
                        {...form.register("other_industry_name")}
                        placeholder="Enter industry name"
                        required
                      />
                    </Field>
                  )}
                  <Field label="Compliance start">
                    <input
                      type="date"
                      {...form.register("compliance_start_date")}
                      required
                    />
                  </Field>
                  {kind === "units" && (
                    <Field label="Unit Compliance Type" wide>
                      <div className="checkbox-group" role="group" aria-label="Unit Compliance Type">
                        {["Shops & Establishments", "Mines", "BOCW", "ESI", "PF"].map((type) => (
                          <label className="inline" key={type}>
                            <input
                              type="checkbox"
                              checked={form.watch("compliance_types").includes(type)}
                              onChange={(event) => {
                                const selected = form.getValues("compliance_types");
                                form.setValue("compliance_types", event.target.checked ? [...selected, type] : selected.filter((value) => value !== type), { shouldDirty: true });
                              }}
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </Field>
                  )}
                  {kind === "sites" && (
                    <Field label="Status">
                      <select {...form.register("status")}>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </Field>
                  )}
                  <Field
                    label={kind === "units" ? "Male employees" : "Male workers"}
                    error={
                      kind === "units"
                        ? form.formState.errors.male_employees?.message
                        : form.formState.errors.male_workers?.message
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      {...form.register(
                        kind === "units" ? "male_employees" : "male_workers",
                      )}
                    />
                  </Field>
                  <Field
                    label={
                      kind === "units" ? "Female employees" : "Female workers"
                    }
                    error={
                      kind === "units"
                        ? form.formState.errors.female_employees?.message
                        : form.formState.errors.female_workers?.message
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      {...form.register(
                        kind === "units"
                          ? "female_employees"
                          : "female_workers",
                      )}
                    />
                  </Field>
                  {kind === "units" && (
                    <>
                      <Field label="Total employees">
                        <input readOnly value={Number(form.watch("male_employees") || 0) + Number(form.watch("female_employees") || 0)} />
                      </Field>
                      <Field label="Worker limit for Principal Employer">
                        <input type="number" min="0" {...form.register("worker_limit")} placeholder="No limit when blank" />
                      </Field>
                    </>
                  )}
                  {kind !== "units" && (
                    <Field label="Total workers">
                      <input readOnly value={requestedWorkers} />
                      {kind === "contractors" && selectedPrincipalEmployerId && <small className="muted">Principal Employer limit: {workerLimit == null ? "Not configured" : workerLimit}; allocated: {allocatedWorkers}; remaining: {remainingWorkers == null ? "Unlimited" : remainingWorkers}</small>}
                    </Field>
                  )}
                </div>
              </div>

              <div className="form-section">
                <h3>Contact and registration</h3>
                <div className="form-grid">
                  <Field label="City / District">
                    <select {...form.register("city_id")} disabled={!selectedStateId} required>
                      <option value="">
                        {!selectedStateId
                          ? "Select State first"
                          : citiesQuery.isLoading
                            ? "Loading districts…"
                            : citiesQuery.isError
                              ? "Districts could not be loaded"
                              : citiesQuery.data?.length
                                ? "Select City / District"
                                : "No districts available"}
                      </option>
                      {citiesQuery.data?.map((city: Master) => <option key={city.id} value={city.id}>{city.name}</option>)}
                    </select>
                    {citiesQuery.isError && <small className="field-error">Could not load districts for this State. Please retry.</small>}
                  </Field>
                  <Field label="Pincode">
                    <input {...form.register("pincode")} required />
                  </Field>
                  <Field label="Contact email">
                    <input type="email" {...form.register("contact_email")} required />
                  </Field>
                  <Field label="Contact phone">
                    <input {...form.register("contact_phone")} inputMode="numeric" pattern="[6-9][0-9]{9}" minLength={10} maxLength={10} title="Enter a valid 10-digit Indian mobile number" required />
                  </Field>
                  <Field label="GSTIN">
                    <input {...form.register("gstin")} maxLength={15} pattern="[0-9A-Za-z]{15}" title="Enter a valid 15-character GSTIN" />
                  </Field>
                  <Field label="PAN">
                    <input {...form.register("pan")} maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="Enter PAN in ABCDE1234F format" />
                  </Field>
                  <Field label="LIN">
                    <input {...form.register("lin")} maxLength={30} />
                  </Field>
                  <Field label="Employer name">
                    <input {...form.register("employer_name")} maxLength={250} required={kind !== "contractors"} />
                  </Field>
                  <Field label="Effective date">
                    <input type="date" {...form.register("effective_date")} required />
                  </Field>
                  {kind === "contractors" && (
                    <>
                      <Field label="Contract start date"><input type="date" {...form.register("contract_start_date")} required /></Field>
                      <Field label="Contract end date"><input type="date" {...form.register("contract_end_date")} required /></Field>
                      <Field label="Work order expiry"><input type="date" {...form.register("work_order_expiry_date")} required /></Field>
                    </>
                  )}
                  <Field label="Address" wide>
                    <textarea rows={3} {...form.register("address")} required />
                  </Field>
                  {kind === "sites" && (
                    <>
                      <Field label="Registration identifiers" wide>
                        <textarea
                          rows={2}
                          {...form.register("registration_identifiers")}
                        />
                      </Field>
                      <Field label="Applicable regulations" wide>
                        <textarea
                          rows={2}
                          {...form.register("applicable_regulations")}
                        />
                      </Field>
                    </>
                  )}
                </div>
              </div>
              {kind !== "sites" && (
                <div className="form-section">
                  <div className="action-row">
                      <button
                        type="button"
                        className="secondary"
                        disabled={!availableUsers.length}
                        onClick={() => setEntityAssignments((current) => [
                          ...current,
                          {
                            key: assignmentKey(),
                            user_id: availableUsers[0]?.id,
                            role: "MAKER",
                          },
                        ])}
                      >
                        Assign existing user
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setNewEntityUser({ name: "", email: "", mobile: "", password: "", password_confirmation: "", role: "MAKER" });
                          setNewEntityUserError("");
                          setNewUserOpen(true);
                        }}
                      >
                        Create new user
                      </button>
                  </div>
                  <p className="muted">Maker and Checker assignments are required. Admin assignment is optional.</p>
                  {entityAssignments.length === 0 ? (
                    <p className="muted">No users are assigned yet.</p>
                  ) : (
                    <div className="scope-list">
                      {entityAssignments.map((assignment, index) => (
                        <div className="scope-row" key={assignment.key}>
                          {assignment.pending_user ? (
                            <div className="wide">
                              <b>{assignment.pending_user.name}</b>
                              <small className="muted">
                                {assignment.pending_user.email} — account and password will be created when this {meta.singular} is saved.
                              </small>
                            </div>
                          ) : (
                            <Field label="User">
                              <select
                                value={assignment.user_id ?? ""}
                                onChange={(event) => setEntityAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, user_id: event.target.value } : item))}
                              >
                                {availableUsers.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name} — {person.email}
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                          <Field label="Role">
                            <select
                              value={assignment.role}
                              onChange={(event) => setEntityAssignments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as AssignmentRole } : item))}
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="MAKER">Maker</option>
                              <option value="CHECKER">Checker</option>
                            </select>
                          </Field>
                          <button
                            type="button"
                            className="icon-action danger"
                            aria-label="Remove user assignment"
                            title="Remove assignment"
                            onClick={() => setEntityAssignments((current) => current.filter((item) => item.key !== assignment.key))}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {kind === "contractors" && !editing && (
                <div className="form-section">
                  <h3>Contractor Maker login</h3>
                  <p className="muted">A restricted Contractor Maker account is required for every new Contractor.</p>
                  <div className="form-grid">
                    <Field label="Contractor Maker Email">
                      <input type="email" required {...form.register("contractor_maker_email")} />
                    </Field>
                    <Field label="Contractor Maker Password">
                      <input type="password" minLength={8} autoComplete="new-password" required {...form.register("contractor_maker_password")} />
                    </Field>
                    <Field label="Confirm Contractor Maker Password">
                      <input type="password" minLength={8} autoComplete="new-password" required {...form.register("contractor_maker_password_confirmation")} />
                    </Field>
                  </div>
                </div>
              )}
              {kind === "contractors" && (
                <div className="form-section">
                  <h3>Contractor documents</h3>
                  <p className="muted">Files selected here are saved immediately after the contractor record succeeds.</p>
                  <div className="form-grid">
                    {[
                      ["WORK_ORDER", "Work order upload"],
                      ["REGISTRATION_CERTIFICATE", "Registration certificate"],
                      ["PF", "PF document"], ["ESI", "ESI document"],
                      ["LABOUR_LICENCE", "Labour licence"],
                    ].map(([type, label]) => (
                      <Field label={label} key={type}>
                        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" onChange={(event) => setContractorFiles((current) => ({ ...current, [type]: event.target.files?.[0] ?? null }))} />
                      </Field>
                    ))}
                    <Field label="Other Documents" wide>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                        onChange={(event) => setOtherDocuments(Array.from(event.target.files ?? []))}
                      />
                      {otherDocuments.length > 0 && (
                        <div className="selected-file-list">
                          {otherDocuments.map((file, index) => (
                            <span key={`${file.name}-${index}`}>
                              {file.name} ({file.type || "file"})
                              <button type="button" className="icon-action danger" aria-label={`Remove ${file.name}`} onClick={() => setOtherDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>
                  {editing && contractorDocumentsQuery.data && (
                    <div className="existing-document-list">
                      <b>Uploaded documents</b>
                      {contractorDocumentsQuery.data.length ? contractorDocumentsQuery.data.map((document) => (
                        <span className="selected-file-list" key={String(document.id)}>
                          <button type="button" className="secondary" onClick={() => morax.downloadContractorDocument(String(document.id), String(document.original_filename))}>
                            {String(document.original_filename)} · {String(document.content_type ?? "file")}
                          </button>
                          <button type="button" className="icon-action danger" aria-label={`Remove ${String(document.original_filename)}`} onClick={async () => {
                            if (!window.confirm(`Remove ${String(document.original_filename)}?`)) return;
                            try {
                              await morax.deleteContractorDocument(String(document.id));
                              await queryClient.invalidateQueries({ queryKey: ["contractor-documents", editing?.id] });
                              setNotice("Contractor document removed successfully.");
                            } catch (error) {
                              setNotice(error instanceof Error ? error.message : "Could not remove the document.");
                            }
                          }}><Trash2 size={14} /></button>
                        </span>
                      )) : <span className="muted">No documents uploaded yet.</span>}
                    </div>
                  )}
                </div>
              )}
              <footer className="drawer-footer">
                <button type="button" className="secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : `Create ${meta.singular}`}
                </button>
              </footer>
            </form>
            {newUserOpen && kind !== "sites" && createPortal(
              <div
                className="assignment-user-backdrop"
                role="presentation"
                onMouseDown={() => setNewUserOpen(false)}
              >
                <section
                  className="crud-drawer assignment-user-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="new-entity-user-title"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="drawer-heading">
                    <div>
                      <span className="drawer-icon"><UsersRound size={19} /></span>
                      <div>
                        <h2 id="new-entity-user-title">Create and assign user</h2>
                        <p>The account is created when you save this {meta.singular}. Set a password so the user can sign in immediately.</p>
                      </div>
                    </div>
                    <button type="button" className="icon-action" onClick={() => setNewUserOpen(false)} aria-label="Close user form"><X size={18} /></button>
                  </div>
                  <form
                    className="entity-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (newEntityUser.password !== newEntityUser.password_confirmation) {
                        setNewEntityUserError("Password and Confirm password must match.");
                        return;
                      }
                      setNewEntityUserError("");
                      setEntityAssignments((current) => [
                        ...current,
                        {
                          key: assignmentKey(),
                          role: newEntityUser.role,
                          pending_user: {
                            name: newEntityUser.name.trim(),
                            email: newEntityUser.email.trim(),
                            mobile: newEntityUser.mobile.trim(),
                            password: newEntityUser.password,
                          },
                        },
                      ]);
                      setNewUserOpen(false);
                    }}
                  >
                    <div className="form-grid">
                      {newEntityUserError && <div className="wide"><InlineError message={newEntityUserError} /></div>}
                      <Field label="Name">
                        <input value={newEntityUser.name} onChange={(event) => setNewEntityUser((current) => ({ ...current, name: event.target.value }))} required autoFocus />
                      </Field>
                      <Field label="Email">
                        <input type="email" value={newEntityUser.email} onChange={(event) => setNewEntityUser((current) => ({ ...current, email: event.target.value }))} required />
                      </Field>
                      <Field label="Mobile">
                        <input value={newEntityUser.mobile} onChange={(event) => setNewEntityUser((current) => ({ ...current, mobile: event.target.value }))} />
                      </Field>
                      <Field label="Password">
                        <input type="password" value={newEntityUser.password} onChange={(event) => setNewEntityUser((current) => ({ ...current, password: event.target.value }))} minLength={8} autoComplete="new-password" required />
                      </Field>
                      <Field label="Confirm password">
                        <input type="password" value={newEntityUser.password_confirmation} onChange={(event) => setNewEntityUser((current) => ({ ...current, password_confirmation: event.target.value }))} minLength={8} autoComplete="new-password" required />
                      </Field>
                      <Field label="Role">
                        <select value={newEntityUser.role} onChange={(event) => setNewEntityUser((current) => ({ ...current, role: event.target.value as AssignmentRole }))}>
                          <option value="ADMIN">Admin</option>
                          <option value="MAKER">Maker</option>
                          <option value="CHECKER">Checker</option>
                        </select>
                      </Field>
                    </div>
                    <footer className="drawer-footer">
                      <button type="button" className="secondary" onClick={() => setNewUserOpen(false)}>Cancel</button>
                      <button type="submit" className="primary-action">Add assignment</button>
                    </footer>
                  </form>
                </section>
              </div>
            , document.body)}
          </section>
        </div>
      )}
      {contractorMakerPasswordTarget && createPortal(
        <div
          className="assignment-user-backdrop"
          role="presentation"
          onMouseDown={() => !contractorMakerPasswordMutation.isPending && setContractorMakerPasswordTarget(null)}
        >
          <section
            className="crud-drawer assignment-user-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contractor-maker-password-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <span className="drawer-icon"><UsersRound size={19} /></span>
                <div>
                  <h2 id="contractor-maker-password-title">Set Contractor Maker password</h2>
                  <p>{contractorMakerPasswordTarget.name} · {contractorMakerPasswordTarget.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-action"
                disabled={contractorMakerPasswordMutation.isPending}
                onClick={() => setContractorMakerPasswordTarget(null)}
                aria-label="Close password form"
              ><X size={18} /></button>
            </div>
            <form
              className="entity-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (contractorMakerPassword !== contractorMakerPasswordConfirmation) {
                  setContractorMakerPasswordError("Password and Confirm password must match.");
                  return;
                }
                setContractorMakerPasswordError("");
                contractorMakerPasswordMutation.mutate({
                  target: contractorMakerPasswordTarget,
                  password: contractorMakerPassword,
                });
              }}
            >
              <div className="form-grid">
                {contractorMakerPasswordError && <div className="wide"><InlineError message={contractorMakerPasswordError} /></div>}
                <Field label="New password">
                  <input
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    value={contractorMakerPassword}
                    onChange={(event) => setContractorMakerPassword(event.target.value)}
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    value={contractorMakerPasswordConfirmation}
                    onChange={(event) => setContractorMakerPasswordConfirmation(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <footer className="drawer-footer">
                <button type="button" className="secondary" disabled={contractorMakerPasswordMutation.isPending} onClick={() => setContractorMakerPasswordTarget(null)}>Cancel</button>
                <button type="submit" className="primary-action" disabled={contractorMakerPasswordMutation.isPending}>
                  {contractorMakerPasswordMutation.isPending ? "Saving…" : "Set new password"}
                </button>
              </footer>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function Field({
  label,
  error,
  wide = false,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={wide ? "wide" : undefined}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

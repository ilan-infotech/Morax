import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import GradientText from "./GradientText/GradientText";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Factory,
  HardHat,
  KeyRound,
  LogIn,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRoundCog,
  Wrench,
  X,
} from "lucide-react";
import { morax } from "../api/morax";
import type { User } from "../api/morax";
import { EmptyState, InlineError, LoadingSkeleton } from "./workspace-ui";
import { PasswordInput } from "./password-input";

const userTableFeatures = tableFeatures({ rowSortingFeature });
const EMPTY_USERS: User[] = [];
const ROLES = [
  "ORGANIZATION_ADMIN",
  "UNIT_ADMIN",
  "UNIT_MAKER",
  "UNIT_CHECKER",
  "CONTRACTOR_ADMIN",
  "CONTRACTOR_MAKER",
  "CONTRACTOR_CHECKER",
  "VIEWER",
  "AUDITOR",
] as const;
const SCOPE_TYPES = [
  "ORGANIZATION",
  "UNIT",
  "CONTRACTOR",
  "CONTRACTOR_SITE",
] as const;
const CONTRACTOR_ROLES = ROLES.filter((role) => role.startsWith("CONTRACTOR_"));

const roleScopeSchema = z.object({
  role: z.enum(ROLES),
  scope_type: z.enum(SCOPE_TYPES),
  scope_id: z.string().min(1, "Select an assigned scope"),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(150),
  email: z.string().trim().email("Enter a valid email address"),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  password: z.string().min(8, "Use at least 8 characters"),
  password_confirmation: z.string(),
  active: z.boolean(),
  role_scopes: z.array(roleScopeSchema).min(1, "Assign at least one role and access scope"),
  module_permissions: z.array(z.string()),
}).refine((values) => values.password === values.password_confirmation, {
  message: "Passwords do not match",
  path: ["password_confirmation"],
});
type CreateUserForm = z.infer<typeof createUserSchema>;

const scopesSchema = z.object({
  scopes: z.array(roleScopeSchema),
});
type ScopesForm = z.infer<typeof scopesSchema>;

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roleIcon(role: string) {
  if (role.endsWith("_ADMIN") || role === "ORGANIZATION_ADMIN") return <ShieldCheck size={13} />;
  if (role.endsWith("_MAKER")) return <Wrench size={13} />;
  if (role.endsWith("_CHECKER")) return <CheckCircle2 size={13} />;
  if (role === "VIEWER") return <Eye size={13} />;
  return <Search size={13} />;
}

function entityIcon(scopeType: string) {
  if (scopeType === "ORGANIZATION") return <Building2 size={14} />;
  if (scopeType === "UNIT") return <Factory size={14} />;
  if (scopeType === "CONTRACTOR") return <HardHat size={14} />;
  return <MapPin size={14} />;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isOrgAdmin(user: User) {
  return (
    user.platform_role === "MORAX_ADMIN" ||
    user.roles.includes("ORGANIZATION_ADMIN")
  );
}

export function UserAccessManager({
  user,
  onImpersonate,
}: {
  user: User;
  onImpersonate: (userId: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const canManage = isOrgAdmin(user);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [active, setActive] = useState("");
  const [userType, setUserType] = useState<"COMPANY" | "CONTRACTOR">("COMPANY");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [scopeUser, setScopeUser] = useState<User | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [replacementPassword, setReplacementPassword] = useState("");
  const [replacementPasswordConfirmation, setReplacementPasswordConfirmation] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");
  const [notice, setNotice] = useState("");
  const sort = sorting[0];

  const filters = useMemo(
    () => ({
      page: String(page),
      page_size: String(pageSize),
      q: deferredSearch.trim() || undefined,
      active: active || undefined,
      user_type: userType,
      sort_by: sort?.id || "name",
      sort_dir: sort?.desc ? "desc" : "asc",
    }),
    [active, deferredSearch, page, pageSize, sort?.desc, sort?.id, userType],
  );
  useEffect(() => setPage(1), [active, deferredSearch, pageSize, sort?.desc, sort?.id, userType]);

  const usersQuery = useQuery({
    queryKey: ["users-page", filters],
    queryFn: () => morax.usersPage(filters),
    enabled: canManage,
    staleTime: 30_000,
  });
  const scopeOptions = useQuery({
    queryKey: ["scope-options"],
    queryFn: async () => {
      const [units, contractors, sites] = await Promise.all([
        morax.unitsPage({ page: "1", page_size: "100" }),
        morax.contractors(),
        morax.sites(),
      ]);
      return { units: units.items, contractors, sites };
    },
    enabled: canManage,
    staleTime: 5 * 60_000,
  });

  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      mobile: "",
      password: "",
      password_confirmation: "",
      active: true,
      role_scopes: [],
      module_permissions: [],
    },
  });
  const createScopeFields = useFieldArray({
    control: createForm.control,
    name: "role_scopes",
  });
  const watchedCreateScopes = createForm.watch("role_scopes");
  const scopeForm = useForm<ScopesForm>({
    resolver: zodResolver(scopesSchema),
    defaultValues: { scopes: [] },
  });
  const scopeFields = useFieldArray({
    control: scopeForm.control,
    name: "scopes",
  });
  const watchedScopes = scopeForm.watch("scopes");

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users-page"] });
  };
  const createMutation = useMutation({
    mutationFn: async ({ password_confirmation: _passwordConfirmation, ...values }: CreateUserForm) => {
      const availability = await morax.emailAvailable(values.email);
      if (!availability.available) throw new Error("Email ID already exists.");
      return morax.createUser({ ...values, mobile: values.mobile || null });
    },
    onSuccess: async () => {
      setNotice("User, password, roles, permissions, and access scope were created.");
      createForm.reset();
      setCreateOpen(false);
      await refreshUsers();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not create user.",
      ),
  });
  const scopesMutation = useMutation({
    mutationFn: (values: ScopesForm) => {
      if (!scopeUser) throw new Error("Select a user first");
      return morax.replaceScopes(scopeUser.id, values.scopes);
    },
    onSuccess: async () => {
      setNotice("Role scopes saved successfully.");
      setScopeUser(null);
      await refreshUsers();
    },
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not save role scopes.",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: (target: User) =>
      morax.updateUser(target.id, { active: target.active === false }),
    onSuccess: refreshUsers,
    onError: (error) =>
      setNotice(
        error instanceof Error ? error.message : "Could not update user status.",
      ),
  });
  const passwordResetMutation = useMutation({
    mutationFn: ({ target, password }: { target: User; password: string }) =>
      morax.resetUserPassword(target.id, password),
    onSuccess: async (result) => {
      setNotice(`Success: Password reset for ${result.username}. ${result.sessions_revoked ? "Existing sessions were signed out." : ""}`.trim());
      setPasswordResetUser(null);
      setReplacementPassword("");
      setReplacementPasswordConfirmation("");
      setPasswordResetError("");
      await refreshUsers();
    },
    onError: (error) =>
      setPasswordResetError(
        error instanceof Error ? error.message : "Could not reset the password.",
      ),
  });

  const candidates = (scopeType: string) => {
    if (scopeType === "ORGANIZATION")
      return [{ id: user.organization_id, name: "Entire organization" }];
    if (scopeType === "UNIT") return scopeOptions.data?.units ?? [];
    if (scopeType === "CONTRACTOR") return scopeOptions.data?.contractors ?? [];
    return scopeOptions.data?.sites ?? [];
  };
  const startScopes = useCallback(
    (target: User) => {
      setNotice("");
      setScopeUser(target);
      scopeForm.reset({
        scopes: target.scopes.map((scope) => ({
          role: scope.role as (typeof ROLES)[number],
          scope_type: scope.scope_type as (typeof SCOPE_TYPES)[number],
          scope_id: scope.scope_id,
        })),
      });
    },
    [scopeForm],
  );
  const startPasswordReset = useCallback((target: User) => {
    setNotice("");
    setPasswordResetUser(target);
    setReplacementPassword("");
    setReplacementPasswordConfirmation("");
    setPasswordResetError("");
  }, []);
  const addScope = () => {
    const unit = scopeOptions.data?.units[0];
    scopeFields.append({
      role: unit ? "UNIT_MAKER" : "VIEWER",
      scope_type: unit ? "UNIT" : "ORGANIZATION",
      scope_id: unit ? String(unit.id) : user.organization_id,
    });
  };
  const addCreateScope = () => {
    if (userType === "CONTRACTOR") {
      const contractor = scopeOptions.data?.contractors[0];
      createScopeFields.append({
        role: "CONTRACTOR_MAKER",
        scope_type: "CONTRACTOR",
        scope_id: contractor ? String(contractor.id) : "",
      });
      return;
    }
    const unit = scopeOptions.data?.units[0];
    createScopeFields.append({
      role: unit ? "UNIT_MAKER" : "VIEWER",
      scope_type: unit ? "UNIT" : "ORGANIZATION",
      scope_id: unit ? String(unit.id) : user.organization_id,
    });
  };
  const loginAs = useCallback(
    async (target: User) => {
      try {
        await onImpersonate(target.id);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Could not start the temporary session.",
        );
      }
    },
    [onImpersonate],
  );
  const scopeNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    map.set(`ORGANIZATION:${user.organization_id}`, "Entire organization");
    const add = (type: string, items: Record<string, unknown>[] = []) => {
      items.forEach((item) => map.set(`${type}:${String(item.id)}`, String(item.name ?? "Unnamed scope")));
    };
    add("UNIT", scopeOptions.data?.units);
    add("CONTRACTOR", scopeOptions.data?.contractors);
    add("CONTRACTOR_SITE", scopeOptions.data?.sites);
    return map;
  }, [scopeOptions.data, user.organization_id]);
  const scopeLabel = useCallback(
    (scope: User["scopes"][number]) =>
      scopeNameByKey.get(`${scope.scope_type}:${scope.scope_id}`) ?? roleLabel(scope.scope_type),
    [scopeNameByKey],
  );

  const columns = useMemo<ColumnDef<typeof userTableFeatures, User, unknown>[]>(
    () => [
      {
        id: "short_id",
        header: "ID",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="user-id-cell">
            {(page - 1) * pageSize + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="user-name-cell">
            <b>{row.original.name}</b>
          </div>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <span className="user-email-cell">{row.original.email}</span>,
      },
      {
        accessorKey: "mobile",
        header: "Mobile",
        enableSorting: false,
        cell: ({ row }) => row.original.mobile || "-",
      },
      {
        id: "roles",
        header: "Role",
        enableSorting: false,
        cell: ({ row }) => {
          const roles = row.original.roles.length ? row.original.roles : row.original.scopes.map((scope) => scope.role);
          return roles.length ? (
            <div className="user-chip-list">
              {roles.map((role) => (
                <span className={`access-token role-access-token ${role.toLowerCase()}`} key={role}>
                  <span className="access-token-icon">{roleIcon(role)}</span>
                  <span>{roleLabel(role)}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="muted">No role</span>
          );
        },
      },
      {
        id: "entities",
        header: "Entities",
        enableSorting: false,
        cell: ({ row }) => {
          const scopes = row.original.scopes;
          if (!scopes.length) return <span className="muted">No entities</span>;
          return (
            <div className="user-chip-list entity-scope-list">
              {scopes.slice(0, 2).map((scope, index) => (
                <span className={`access-token entity-access-token ${scope.scope_type.toLowerCase()}`} title={`${scopeLabel(scope)} - ${roleLabel(scope.role)}`} key={`${scope.scope_type}-${scope.scope_id}-${index}`}>
                  <span className="access-token-icon">{entityIcon(scope.scope_type)}</span>
                  <span className="entity-access-copy"><b>{scopeLabel(scope)}</b><small>{roleLabel(scope.role)}</small></span>
                </span>
              ))}
              {scopes.length > 2 && <span className="access-more-token" title={`${scopes.length - 2} more assignments`}>+{scopes.length - 2}</span>}
            </div>
          );
        },
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) => (
          <button
            type="button"
            className={`status-toggle ${row.original.active === false ? "" : "on"}`}
            aria-label={`${row.original.active === false ? "Activate" : "Deactivate"} ${row.original.name}`}
            title={row.original.active === false ? "Inactive" : "Active"}
            disabled={statusMutation.isPending || row.original.id === user.id}
            onClick={() => statusMutation.mutate(row.original)}
          >
            <span />
          </button>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="user-table-actions">
            <button
              type="button"
              className="icon-action"
              title="Edit roles and scopes"
              aria-label={`Edit roles and scopes for ${row.original.name}`}
              onClick={() => startScopes(row.original)}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="icon-action"
              title="Set a new password"
              aria-label={`Set a new password for ${row.original.name}`}
              onClick={() => startPasswordReset(row.original)}
            >
              <KeyRound size={16} />
            </button>
            <button
              type="button"
              className="icon-action"
              title="Login as user"
              aria-label={`Login as ${row.original.name}`}
              disabled={
                row.original.active === false ||
                row.original.id === user.id ||
                Boolean(row.original.platform_role)
              }
              onClick={() => loginAs(row.original)}
            >
              <LogIn size={16} />
            </button>
          </div>
        ),
      },
    ],
    [loginAs, page, pageSize, scopeLabel, startPasswordReset, startScopes, statusMutation, user.id],
  );
  const table = useTable({
    features: userTableFeatures,
    data: usersQuery.data?.items ?? EMPTY_USERS,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
  });
  const total = usersQuery.data?.total ?? 0;
  const currentPageSize = usersQuery.data?.page_size ?? pageSize;
  const lastPage = Math.max(1, Math.ceil(total / currentPageSize));

  if (!canManage) {
    return (
      <InlineError message="Organization administrator permission is required to manage users and access." />
    );
  }

  return (
    <section className="crud-page user-access-page">
      <header className="page-header">
        <div>
          <p className="eyebrow" style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>ACCESS CONTROL</GradientText>
          </p>
          <h1 style={{ fontWeight: 'bold' }}>
            <GradientText colors={['#2A3620', '#B6D7A8', '#2A3620']} showBorder={false}>Users & access</GradientText>
          </h1>
          <p className="muted">
            Create users, save their complete role-scope list, and validate
            their actual access with an audited temporary session. Set each
            new user's password during creation so they can sign in immediately.
          </p>
        </div>
        <button
          type="button"
          className="primary-action"
          onClick={() => {
            setNotice("");
            const contractor = scopeOptions.data?.contractors[0];
            const unit = scopeOptions.data?.units[0];
            createForm.reset({
              name: "", email: "", mobile: "", password: "", password_confirmation: "", active: true,
              role_scopes: userType === "CONTRACTOR"
                ? [{
                  role: "CONTRACTOR_MAKER",
                  scope_type: "CONTRACTOR",
                  scope_id: contractor ? String(contractor.id) : "",
                }]
                : [{
                  role: unit ? "UNIT_MAKER" : "VIEWER",
                  scope_type: unit ? "UNIT" : "ORGANIZATION",
                  scope_id: unit ? String(unit.id) : user.organization_id,
                }],
              module_permissions: [],
            });
            setCreateOpen(true);
          }}
        >
          <Plus size={17} /> Add {userType === "CONTRACTOR" ? "Contractor User" : "Company User"}
        </button>
      </header>
      <div className="user-access-tabs" role="tablist" aria-label="User categories">
        <button
          type="button"
          role="tab"
          aria-selected={userType === "COMPANY"}
          className={userType === "COMPANY" ? "active" : ""}
          onClick={() => setUserType("COMPANY")}
        >
          Company users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={userType === "CONTRACTOR"}
          className={userType === "CONTRACTOR" ? "active" : ""}
          onClick={() => setUserType("CONTRACTOR")}
        >
          Contractor users
        </button>
      </div>
      {notice && (
        <p
          className={`alert ${notice.includes("success") ? "success" : "error"}`}
        >
          {notice}
        </p>
      )}

      <section className="panel entity-list-panel user-access-table-panel">
        <div className="user-table-heading">
          <h2><UserRoundCog size={18} /> {userType === "CONTRACTOR" ? "Contractor Users" : "Company Users"}</h2>
          <span>{total} Users</span>
        </div>
        <div className="user-table-controls">
          <label className="show-entries-control">
            Show
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[10, 25, 50].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
            entries
          </label>
          <label className="user-search-control">
            <span>Search users</span>
            <span className="user-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search users"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email…"
              />
            </span>
          </label>
          <label className="compact-filter user-status-filter">
            <span>Status</span>
            <select
              value={active}
              onChange={(event) => setActive(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          {(search || active) && (
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setSearch("");
                setActive("");
              }}
            >
              <X size={15} /> Clear filters
            </button>
          )}
        </div>
        {usersQuery.isLoading ? (
          <LoadingSkeleton rows={6} />
        ) : usersQuery.isError ? (
          <InlineError message="Unable to load users." />
        ) : table.getRowModel().rows.length === 0 ? (
          <EmptyState
            title="No users found"
            description={userType === "CONTRACTOR" ? "Change the filters or create the first Contractor user." : "Change the filters or create the first organization user."}
          />
        ) : (
          <div className="table-wrap modern-data-table">
            <table>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
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
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
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

      {createOpen && (
        <Drawer
          title={userType === "CONTRACTOR" ? "Add Contractor User" : "Add Company User"}
          icon={<UserRoundCog size={19} />}
          onClose={() => setCreateOpen(false)}
          pageForm
        >
          <form
            className="entity-form"
            onSubmit={createForm.handleSubmit((values) =>
              createMutation.mutate(values),
            )}
          >
            <div className="form-grid">
              <FormField
                label="Name"
                required
                error={createForm.formState.errors.name?.message}
              >
                <input autoFocus required maxLength={150} {...createForm.register("name")} />
              </FormField>
              <FormField
                label="Email"
                required
                error={createForm.formState.errors.email?.message}
              >
                <input type="email" required {...createForm.register("email")} />
              </FormField>
              <FormField label="Mobile" required error={createForm.formState.errors.mobile?.message}>
                <input inputMode="numeric" minLength={10} maxLength={10} pattern="[6-9][0-9]{9}" required {...createForm.register("mobile")} />
              </FormField>
              <FormField
                label="Password"
                required
                error={createForm.formState.errors.password?.message}
              >
                <PasswordInput autoComplete="new-password" minLength={8} required {...createForm.register("password")} />
              </FormField>
              <FormField
                label="Confirm password"
                required
                error={createForm.formState.errors.password_confirmation?.message}
              >
                <PasswordInput autoComplete="new-password" minLength={8} required {...createForm.register("password_confirmation")} />
              </FormField>
            </div>
            <div className="form-section">
              <h3>Roles and project/site access</h3>
              {createScopeFields.fields.map((field, index) => {
                const scopeType = watchedCreateScopes[index]?.scope_type || "UNIT";
                const choices = candidates(scopeType);
                return (
                  <div className="scope-row" key={field.id}>
                    <FormField label="Role" required>
                      <select required {...createForm.register(`role_scopes.${index}.role`)}>
                        {(userType === "CONTRACTOR" ? CONTRACTOR_ROLES : ROLES).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Access type" required>
                      <select required {...createForm.register(`role_scopes.${index}.scope_type`, {
                        onChange: (event) => {
                          const choicesForType = candidates(event.target.value);
                          createForm.setValue(`role_scopes.${index}.scope_id`, choicesForType[0] ? String(choicesForType[0].id) : "");
                        },
                      })}>
                        {SCOPE_TYPES.map((type) => <option key={type} value={type}>{roleLabel(type)}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Authorized entity" required error={createForm.formState.errors.role_scopes?.[index]?.scope_id?.message}>
                      <select required {...createForm.register(`role_scopes.${index}.scope_id`)} disabled={!choices.length} aria-label="Searchable authorized entity list">
                        {choices.map((choice) => <option key={String(choice.id)} value={String(choice.id)}>{String(choice.name)}</option>)}
                      </select>
                    </FormField>
                    <button type="button" className="icon-action danger" aria-label="Remove role scope" onClick={() => createScopeFields.remove(index)}><X size={16} /></button>
                  </div>
                );
              })}
              <button type="button" className="secondary add-scope-button" onClick={addCreateScope}><Plus size={16} /> Add role scope</button>
            </div>
            <DrawerFooter
              onCancel={() => setCreateOpen(false)}
              busy={createMutation.isPending}
              label={userType === "CONTRACTOR" ? "Create Contractor User" : "Create Company User"}
            />
          </form>
        </Drawer>
      )}

      {scopeUser && (
        <Drawer
          title={`Roles & scopes — ${scopeUser.name}`}
          icon={<ShieldCheck size={19} />}
          onClose={() => setScopeUser(null)}
          pageForm
        >
          <form
            className="entity-form"
            onSubmit={scopeForm.handleSubmit((values) =>
              scopesMutation.mutate(values),
            )}
          >
            <p className="scope-intro">
              This saves the complete role-scope list for this user. Each
              assignment is enforced by the backend; users cannot expand its
              scope from the URL or a request payload.
            </p>
            {scopeFields.fields.length === 0 && (
              <EmptyState
                title="No role scopes"
                description="Add at least one role scope before this user can perform organization work."
              />
            )}
            <div className="scope-editor-list">
              {scopeFields.fields.map((field, index) => {
                const scopeType = watchedScopes[index]?.scope_type || "UNIT";
                const choices = candidates(scopeType);
                return (
                  <div className="scope-row" key={field.id}>
                    <FormField label="Role">
                      <select {...scopeForm.register(`scopes.${index}.role`)}>
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Scope type">
                      <select
                        {...scopeForm.register(`scopes.${index}.scope_type`, {
                          onChange: (event) => {
                            const type = event.target.value;
                            const first = candidates(type)[0];
                            scopeForm.setValue(
                              `scopes.${index}.scope_id`,
                              first ? String(first.id) : "",
                            );
                          },
                        })}
                      >
                        {SCOPE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {roleLabel(type)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField
                      label="Assigned scope"
                      error={
                        scopeForm.formState.errors.scopes?.[index]?.scope_id
                          ?.message
                      }
                    >
                      <select
                        {...scopeForm.register(`scopes.${index}.scope_id`)}
                        disabled={choices.length === 0}
                      >
                        <option value="">
                          {choices.length
                            ? "Select scope"
                            : "No accessible records"}
                        </option>
                        {choices.map((choice) => (
                          <option
                            key={String(choice.id)}
                            value={String(choice.id)}
                          >
                            {String(choice.name)}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <button
                      type="button"
                      className="icon-action danger"
                      aria-label="Remove role scope"
                      title="Remove role scope"
                      onClick={() => scopeFields.remove(index)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="secondary add-scope-button"
              onClick={addScope}
              disabled={scopeOptions.isLoading}
            >
              <Plus size={16} /> Add role scope
            </button>
            <DrawerFooter
              onCancel={() => setScopeUser(null)}
              busy={scopesMutation.isPending}
              label="Save all scopes"
            />
          </form>
        </Drawer>
      )}

      {passwordResetUser && (
        <Drawer
          title={`Set new password — ${passwordResetUser.name}`}
          icon={<KeyRound size={19} />}
          onClose={() => {
            if (!passwordResetMutation.isPending) {
              setPasswordResetUser(null);
              setReplacementPassword("");
              setReplacementPasswordConfirmation("");
              setPasswordResetError("");
            }
          }}
        >
          <form
            className="entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (replacementPassword !== replacementPasswordConfirmation) {
                setPasswordResetError("Passwords do not match.");
                return;
              }
              passwordResetMutation.mutate({
                target: passwordResetUser,
                password: replacementPassword,
              });
            }}
          >
            <p className="scope-intro">
              Login username: <b>{passwordResetUser.email}</b>. Existing passwords cannot be viewed because they are securely hashed. Set a replacement and share it directly with the user; no email, OTP, or activation link is sent.
            </p>
            {passwordResetError && <InlineError message={passwordResetError} />}
            <div className="form-grid">
              <FormField label="New password">
                <PasswordInput
                  value={replacementPassword}
                  onChange={(event) => setReplacementPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </FormField>
              <FormField label="Confirm new password">
                <PasswordInput
                  value={replacementPasswordConfirmation}
                  onChange={(event) => setReplacementPasswordConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </FormField>
            </div>
            <DrawerFooter
              onCancel={() => {
                setPasswordResetUser(null);
                setReplacementPassword("");
                setReplacementPasswordConfirmation("");
                setPasswordResetError("");
              }}
              busy={passwordResetMutation.isPending}
              label="Set new password"
            />
          </form>
        </Drawer>
      )}
    </section>
  );
}

function Drawer({
  title,
  icon,
  onClose,
  children,
  pageForm = false,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  pageForm?: boolean;
}) {
  return (
    <div
      className={pageForm ? "workspace-form-backdrop" : "crud-drawer-backdrop"}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={pageForm ? "workspace-form" : "crud-drawer"}
        role={pageForm ? "region" : "dialog"}
        aria-modal={pageForm ? undefined : true}
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <span className="drawer-icon">{icon}</span>
            <div>
              <h2>{title}</h2>
              <p>
                Changes are audited and take effect immediately after saving.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-action"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function DrawerFooter({
  onCancel,
  busy,
  label,
}: {
  onCancel: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <footer className="drawer-footer">
      <button type="button" className="secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="primary-action" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
    </footer>
  );
}

function FormField({
  label,
  error,
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={error ? "has-error" : undefined}>
      <span>{label}{required && <b className="required-indicator" aria-label="required"> *</b>}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

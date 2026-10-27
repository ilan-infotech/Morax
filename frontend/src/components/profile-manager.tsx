import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Camera, CheckCircle2, KeyRound, LoaderCircle, MapPin, Save } from "lucide-react";
import { toast } from "sonner";

import { fetchBlob } from "../api/client";
import { morax, type User } from "../api/morax";
import { PasswordInput } from "./password-input";
import { DashboardMetricCard, DashboardSection, EmptyState, InlineError, LoadingSkeleton, WorkspacePageHeader } from "./workspace-ui";

type Profile = Record<string, any>;
const text = (value: unknown) => value == null || value === "" ? "—" : String(value);
const dateTime = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "Never";
const roleName = (role: string) => role.replaceAll("_", " ");

function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [values, setValues] = useState({ current_password: "", new_password: "", confirmation: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const strength = useMemo(() => {
    const value = values.new_password;
    if (!value) return "Enter a new password";
    const kinds = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
    return value.length >= 12 && kinds >= 3 ? "Strong" : value.length >= 8 && kinds >= 3 ? "Good" : "Use 8+ characters and 3 character types";
  }, [values.new_password]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (values.new_password !== values.confirmation) return setError("New password and confirmation must match.");
    if (values.new_password.length < 8) return setError("New password must contain at least 8 characters.");
    setSaving(true);
    try {
      const result = await morax.changePassword({ current_password: values.current_password, new_password: values.new_password }) as { sessions_revoked?: number };
      setValues({ current_password: "", new_password: "", confirmation: "" });
      toast.success(result.sessions_revoked ? "Password updated. Other active sessions were signed out." : "Password updated successfully.");
      onDone?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to change password."); }
    finally { setSaving(false); }
  };
  return <form className="profile-password-form" onSubmit={submit} noValidate>
    <label>Current password <span className="required-mark">*</span><PasswordInput value={values.current_password} onChange={(event) => setValues({ ...values, current_password: event.target.value })} autoComplete="current-password" required minLength={8} /></label>
    <label>New password <span className="required-mark">*</span><PasswordInput value={values.new_password} onChange={(event) => setValues({ ...values, new_password: event.target.value })} autoComplete="new-password" required minLength={8} /></label>
    <small className={`password-strength ${strength === "Strong" ? "strong" : ""}`}>{strength}. Avoid common passwords and do not reuse your current password.</small>
    <label>Confirm new password <span className="required-mark">*</span><PasswordInput value={values.confirmation} onChange={(event) => setValues({ ...values, confirmation: event.target.value })} autoComplete="new-password" required minLength={8} /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}{saving ? "Updating…" : "Update password"}</button>
  </form>;
}

export function ChangePasswordPage() {
  return <section className="modern-page profile-page"><WorkspacePageHeader title="Change password" description="Use a strong, unique password to protect your MORAX account." /><DashboardSection title="Account security" description="Changing your password signs out other active sessions."><PasswordForm /></DashboardSection></section>;
}

export function ProfileManager({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile>();
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [draft, setDraft] = useState({ name: user.name, mobile: user.mobile ?? "" });
  const [organizationContact, setOrganizationContact] = useState({ primary_contact_name: "", contact_email: "", contact_phone: "" });
  const load = async () => {
    try { const next = await morax.profile(); setProfile(next); const account = next.account ?? {}; const organization = next.organization ?? {}; setDraft({ name: account.name ?? user.name, mobile: account.mobile ?? "" }); setOrganizationContact({ primary_contact_name: organization.primary_contact_name ?? "", contact_email: organization.contact_email ?? "", contact_phone: organization.contact_phone ?? "" }); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load profile."); }
  };
  useEffect(() => { void load(); }, [user.id, user.organization_id]);
  useEffect(() => {
    const filename = profile?.organization?.logo_filename;
    if (!filename) { setLogoUrl(""); return; }
    let active = true; let objectUrl = "";
    void fetchBlob("/profile/organization-logo").then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setLogoUrl(objectUrl); }).catch(() => setLogoUrl(""));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [profile?.organization?.logo_filename]);
  const roles: string[] = profile?.account?.roles ?? user.roles;
  const organizationAdmin = roles.includes("ORGANIZATION_ADMIN");
  const maker = roles.some((role) => role.endsWith("_MAKER"));
  const checker = roles.some((role) => role.endsWith("_CHECKER"));
  const entities: Profile[] = profile?.entities ?? [];
  const selectedEntity = entities.find((item) => item.id === selectedEntityId) ?? entities[0];
  const activity = profile?.activity ?? {};
  const savePersonal = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await morax.updateProfile({ name: draft.name.trim(), mobile: draft.mobile || null }); toast.success("Profile updated successfully."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update profile."); }
    finally { setSaving(false); }
  };
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    try { await morax.uploadOrganizationLogo(file); toast.success("Organization logo updated successfully."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to upload organization logo."); }
  };
  const saveOrganizationContact = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    if (!profile) { setSaving(false); return; }
    try { await morax.updateOrganization({ ...profile.organization, ...organizationContact }); toast.success("Organization contact details updated successfully."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update organization contact details."); }
    finally { setSaving(false); }
  };
  return <section className="modern-page profile-page">
    <WorkspacePageHeader title={organizationAdmin ? "Organization profile" : "My profile"} description="Your account, authorized work scope, and current compliance activity." />
    <InlineError message={error} />
    {!profile ? <DashboardSection title="Loading profile"><LoadingSkeleton rows={5} /></DashboardSection> : <>
      <section className="profile-grid">
        <DashboardSection title="Personal information">
          <form className="profile-personal-form" onSubmit={savePersonal} noValidate>
            <label>Full name <span className="required-mark">*</span><input value={draft.name} maxLength={150} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label>Mobile number<input value={draft.mobile} inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" onChange={(event) => setDraft({ ...draft, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
            <button className="button-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "Saving…" : "Save changes"}</button>
          </form>
        </DashboardSection>
        <DashboardSection title="Account details">
          <dl className="profile-details"><dt>Email</dt><dd>{text(profile.account.email)}</dd><dt>Role</dt><dd>{roles.map(roleName).join(", ") || "Workspace user"}</dd><dt>Member since</dt><dd>{dateTime(profile.account.member_since)}</dd><dt>Last login</dt><dd>{dateTime(profile.account.last_login_at)}</dd></dl>
          <a className="button-secondary profile-security-link" href="change-password"><KeyRound size={16} />Change password</a>
        </DashboardSection>
      </section>
      {organizationAdmin && <section className="profile-grid organization-profile-grid">
        <DashboardSection title="Company information">
          <div className="organization-logo-row"><div className="organization-logo-preview">{logoUrl ? <img src={logoUrl} alt={`${profile.organization.name} logo`} /> : <Building2 size={32} />}</div><div><b>{text(profile.organization.name)}</b><small>Organization logo is visible only to authorized MORAX users.</small><label className="button-secondary upload-logo-button"><Camera size={16} />Upload / change logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadLogo(event.target.files?.[0])} /></label></div></div>
          <dl className="profile-details compact"><dt>Industry / legal name</dt><dd>{text(profile.organization.legal_name)}</dd><dt>GSTIN / PAN</dt><dd>{text(profile.organization.gstin)} / {text(profile.organization.pan)}</dd><dt>Status</dt><dd><span className="profile-status"><CheckCircle2 size={14} />{text(profile.organization.status)}</span></dd></dl>
        </DashboardSection>
        <DashboardSection title="Organization contact"><form className="profile-personal-form" onSubmit={saveOrganizationContact}><label>Contact name<input value={organizationContact.primary_contact_name} maxLength={150} onChange={(event) => setOrganizationContact({ ...organizationContact, primary_contact_name: event.target.value })} /></label><label>Contact email<input type="email" value={organizationContact.contact_email} onChange={(event) => setOrganizationContact({ ...organizationContact, contact_email: event.target.value })} /></label><label>Mobile<input value={organizationContact.contact_phone} maxLength={20} onChange={(event) => setOrganizationContact({ ...organizationContact, contact_phone: event.target.value })} /></label><p className="profile-location"><MapPin size={15} />{[profile.organization.city, profile.organization.pincode, profile.organization.address].filter(Boolean).join(", ") || "Location not configured"}</p><button className="button-primary" disabled={saving}><Save size={16} />Save contact details</button></form></DashboardSection>
      </section>}
      <DashboardSection title={entities.length > 1 ? "Authorized assignments" : "Assigned work scope"} action={entities.length > 1 ? <select aria-label="Select assigned entity" value={selectedEntity?.id ?? ""} onChange={(event) => setSelectedEntityId(event.target.value)}>{entities.map((item) => <option value={item.id} key={item.id}>{item.name} · {roleName(item.entity_type)}</option>)}</select> : undefined}>
        {!selectedEntity ? <EmptyState title="No assigned entity" description="Ask an Organization Admin to assign a Unit or Contractor role to this account." /> : <dl className="profile-entity-details"><dt>{roleName(selectedEntity.entity_type)} name</dt><dd>{text(selectedEntity.name)}</dd><dt>Organization</dt><dd>{text(profile.organization.name)}</dd><dt>Industry / work</dt><dd>{text(selectedEntity.industry_name ?? selectedEntity.contractor_type)}</dd><dt>Location</dt><dd>{[selectedEntity.state_name, selectedEntity.city, selectedEntity.pincode, selectedEntity.address].filter(Boolean).join(", ") || "—"}</dd><dt>Status</dt><dd>{text(selectedEntity.status)}</dd></dl>}
      </DashboardSection>
      {(maker || checker) && <DashboardSection title={maker ? "My submission activity" : "My review activity"}><section className="dashboard-metric-grid profile-activity-grid">{maker ? <><DashboardMetricCard label="Total submitted" value={activity.maker?.total_submitted ?? 0} /><DashboardMetricCard label="Pending approval" value={activity.maker?.pending_approval ?? 0} tone="warning" /><DashboardMetricCard label="Approved" value={activity.maker?.approved ?? 0} tone="success" /><DashboardMetricCard label="Rejected" value={activity.maker?.rejected ?? 0} tone="critical" /></> : <><DashboardMetricCard label="Total reviewed" value={activity.checker?.total_reviewed ?? 0} /><DashboardMetricCard label="Pending review" value={activity.checker?.pending_review ?? 0} tone="warning" /><DashboardMetricCard label="Approved by me" value={activity.checker?.approved_by_me ?? 0} tone="success" /><DashboardMetricCard label="Rejected by me" value={activity.checker?.rejected_by_me ?? 0} tone="critical" /></>}</section></DashboardSection>}
    </>}
  </section>;
}

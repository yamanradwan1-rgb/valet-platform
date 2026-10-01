"use client";

import {
  staffOnboardingCreateSchema,
  type StaffOnboardingResult,
  type StaffOnboardingCreate,
} from "@valet/contracts";
import { useRef, useState, type FormEvent } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationScope } from "../administration-scope";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { StaffCreateLocations } from "./staff-create-locations";
import { createStaff, resendStaffInvite } from "./staff-onboarding-api";
import { StaffOnboardingResultPanel } from "./staff-onboarding-result";
import { staffOnboardingCopy } from "./staff-onboarding-copy";
import { staffRoleLabel } from "./staff-labels";

export function StaffCreateDialog(props: {
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const { locale } = useDashboardLocale();
  const t = staffOnboardingCopy(locale);
  const a = administrationCopy(locale);
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "VALET_EMPLOYEE" as StaffOnboardingCreate["role"],
    locationIds: [] as string[],
  });
  const [result, setResult] = useState<StaffOnboardingResult | null>(null);
  const [invalid, setInvalid] = useState(false);
  const operation = useRef<{ material: string; id: string } | null>(null);
  const resendOperation = useRef<string | null>(null);
  const material = JSON.stringify({
    ...draft,
    locationIds: [...draft.locationIds].sort(),
  });
  const mutation = useSensitiveMutation(`staff-create:${material}`);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.busy) return;
    if (operation.current?.material !== material)
      operation.current = { material, id: crypto.randomUUID() };
    const parsed = staffOnboardingCreateSchema.safeParse({
      ...draft,
      operationId: operation.current.id,
    });
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    void mutation.run(
      () => createStaff(dashboard.api, scope.organizationId, parsed.data),
      (next) => {
        setResult(next);
        props.onCreated();
      },
    );
  }
  function resend() {
    if (!result || mutation.busy) return;
    resendOperation.current ??= crypto.randomUUID();
    void mutation.run(
      () =>
        resendStaffInvite(
          dashboard.api,
          scope.organizationId,
          result.membershipId,
          resendOperation.current!,
        ),
      setResult,
    );
  }
  return (
    <FocusDialog label={t.create} onClose={props.onClose}>
      <form className={styles.stack} onSubmit={submit}>
        <h2 className={styles.dialogTitle}>{t.create}</h2>
        {result ? (
          <>
            <StaffOnboardingResultPanel
              key={result.invitationId}
              result={result}
            />
            {result.outcome === "INVITE_PENDING_LINK_UNAVAILABLE" ? (
              <button
                className={styles.primary}
                disabled={mutation.busy}
                onClick={resend}
                type="button"
              >
                {t.resend}
              </button>
            ) : null}
          </>
        ) : (
          <>
            {(["firstName", "lastName", "email"] as const).map((field) => (
              <div className={styles.field} key={field}>
                <label htmlFor={`create-${field}`}>
                  {field === "firstName"
                    ? t.first
                    : field === "lastName"
                      ? t.last
                      : t.email}
                </label>
                <input
                  className={styles.input}
                  id={`create-${field}`}
                  type={field === "email" ? "email" : "text"}
                  required
                  disabled={mutation.busy}
                  value={draft[field]}
                  onChange={(event) =>
                    setDraft({ ...draft, [field]: event.target.value })
                  }
                />
              </div>
            ))}
            <div className={styles.field}>
              <label htmlFor="create-role">{t.role}</label>
              <select
                id="create-role"
                className={styles.select}
                value={draft.role}
                disabled={mutation.busy}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    role: event.target.value as StaffOnboardingCreate["role"],
                  })
                }
              >
                {(scope.authority === "LOCATION_MANAGER"
                  ? (["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)
                  : ([
                      "LOCATION_MANAGER",
                      "VALET_SUPERVISOR",
                      "VALET_EMPLOYEE",
                    ] as const)
                ).map((role) => (
                  <option key={role} value={role}>
                    {staffRoleLabel(role, a)}
                  </option>
                ))}
              </select>
            </div>
            <StaffCreateLocations
              disabled={mutation.busy}
              selected={draft.locationIds}
              onChange={(locationIds) => setDraft({ ...draft, locationIds })}
            />
            {invalid ? (
              <p className={styles.error} role="alert">
                {t.invalid}
              </p>
            ) : null}
            <button
              className={styles.primary}
              disabled={mutation.busy}
              type="submit"
            >
              {mutation.busy ? t.loading : t.create}
            </button>
          </>
        )}
        {mutation.error ? (
          <p className={styles.error} role="alert">
            {mutation.error === a.mfaRetry ? a.mfaRetry : t.actionFailed}
          </p>
        ) : null}
        <button
          className={styles.secondary}
          onClick={props.onClose}
          type="button"
        >
          {t.close}
        </button>
      </form>
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </FocusDialog>
  );
}

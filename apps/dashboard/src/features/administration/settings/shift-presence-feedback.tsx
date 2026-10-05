import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";
import { presenceCopy } from "./shift-presence-copy";
import type { PresenceMutation } from "./use-shift-presence-mutation";

export function PresenceMutationFeedback({
  mutation,
  locale,
}: {
  readonly mutation: PresenceMutation;
  readonly locale: DashboardLocale;
}) {
  const t = presenceCopy(locale);
  if (!mutation.message) return null;
  const status = ["saved", "saving", "reconciling", "mfaRetry"].includes(
    mutation.message,
  );
  return (
    <div
      className={status ? styles.muted : styles.error}
      role={status ? "status" : "alert"}
    >
      {t(mutation.message)}
      {mutation.pending ? (
        <button
          className={styles.secondary}
          disabled={mutation.busy}
          onClick={() => void mutation.reconcile()}
        >
          {t("reconcile")}
        </button>
      ) : null}
    </div>
  );
}

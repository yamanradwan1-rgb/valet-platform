import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/presentation/button";
import { FocusDialog } from "../../../../components/presentation/focus-dialog";
import { ContextHelp } from "../../../../features/help/context-help";
import { settingOptionLabel } from "../../../../features/administration/settings/settings-copy";
import type { Field, Scalar } from "./catalog";
import { useStudio } from "./studio-context";
import { displayValue } from "./value-text";
import { ui } from "./copy";
import { EditorContext } from "./EditorContext";

export { parseField } from "./setting-validation";
import { parseField } from "./setting-validation";

export function FieldEditor({
  field,
  effective,
  inherited,
  onClose,
}: {
  field: Field;
  effective: Scalar;
  inherited: boolean;
  onClose: (saved?: boolean) => void;
}) {
  const { locale, route, save, setDirty, identity, adapter } = useStudio();
  const defaults =
    field.section === "presence"
      ? adapter.presence.values.defaults
      : adapter.settings.defaults;
  const moneyCurrency =
    route.scope === "location" ? adapter.location?.currency : null;
  const ar = locale === "ar";
  const copy = ui[locale];
  const [draft, setDraft] = useState(String(effective ?? ""));
  const [source, setSource] = useState(inherited ? "inherit" : "custom");
  const [error, setError] = useState("");
  const [strict, setStrict] = useState(false);
  const [strictClear, setStrictClear] = useState(false);
  const [saving, setSaving] = useState(false);
  const values =
    field.section === "presence" ? adapter.presence.values : adapter.settings;
  const currentFieldState = JSON.stringify([
    values.defaults[field.key],
    values.overrides[field.key],
    values.effective[field.key],
    values.overridePresent[field.key],
  ]);
  const initialFieldState = useRef(currentFieldState);
  const busy =
    saving ||
    (field.section === "presence"
      ? adapter.presence.busy
      : adapter.settings.busy);
  const input = useRef<HTMLSelectElement & HTMLInputElement>(null);
  const isLocation = route.scope === "location";
  const locationOnly = field.key === "slaTargetSeconds";
  const changed =
    draft !== String(effective ?? "") ||
    source !== (inherited ? "inherit" : "custom");
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setDirty(changed);
  }, [changed, setDirty]);
  async function finish(clear = false, strictConfirmed = false) {
    if (busy) return;
    if (initialFieldState.current !== currentFieldState) {
      setError(
        ar
          ? "تغيّرت القيمة على الخادم أثناء التحرير. أغلق المحرّر وحدّث الصفحة ثم أعد المحاولة."
          : "This setting changed while you were editing. Close the editor, refresh, and retry.",
      );
      return;
    }
    const value = parseField(field, draft);
    if (!clear && source !== "inherit" && value === undefined) {
      setError(copy.invalid);
      return;
    }
    setSaving(true);
    try {
      const result = await save(
        field.key,
        value ?? null,
        clear || (isLocation && source === "inherit"),
        strictConfirmed,
      );
      if (!result.ok) {
        setError(
          result.message ??
            (ar
              ? "تعذّر حفظ الإعداد. راجع الصلاحية والبيانات ثم حاول مجددًا."
              : "Setting not saved. Check the values and permissions, then retry."),
        );
        return;
      }
      onClose(true);
    } catch {
      setError(
        ar
          ? "تعذّر حفظ الإعداد. حاول مجددًا."
          : "Setting not saved. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  function submit(clear = false) {
    const target =
      clear || (isLocation && source === "inherit")
        ? defaults[field.key]
        : draft;
    if (
      field.section === "presence" &&
      ["REQUIRE", "REQUIRE_OR_OVERRIDE"].includes(String(target))
    ) {
      setStrictClear(clear);
      setStrict(true);
      return;
    }
    finish(clear);
  }
  const options = field.kind === "boolean" ? ["false", "true"] : field.options;
  return (
    <div className="ps-editor">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="ps-editor-intro">
          {isLocation && !locationOnly
            ? ar
              ? "غيّر القيمة لتخصيصها لهذا الموقع، ثم احفظ."
              : "Change the value to customize this location, then Save."
            : ar
              ? "اختر القيمة الجديدة، ثم احفظ التغيير."
              : "Choose the new value, then Save."}
        </p>
        <label>
          {copy.draft} · {field.labels[locale]}
          {options ? (
            <select
              ref={input}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (isLocation) setSource("custom");
              }}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {field.kind === "boolean"
                    ? option === "true"
                      ? ar
                        ? "نعم"
                        : "Yes"
                      : ar
                        ? "لا"
                        : "No"
                    : displayValue(option, field, locale) === option
                      ? settingOptionLabel(option, locale)
                      : displayValue(option, field, locale)}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={input}
              inputMode={field.kind === "money" ? "decimal" : "numeric"}
              dir="ltr"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (isLocation) setSource("custom");
              }}
            />
          )}
          {field.kind === "integer" && (
            <small>
              {field.min}–{field.max}
            </small>
          )}
          {field.kind === "money" && (
            <small>
              {ar
                ? `${moneyCurrency ?? "عملة الموقع"} · حتى ٣ خانات عشرية، دون تقريب.`
                : `${moneyCurrency ?? "Location currency"} · Up to 3 decimal places; no rounding.`}
            </small>
          )}
        </label>
        <EditorContext
          field={field}
          effective={effective}
          inherited={inherited}
          source={source}
          onSourceChange={(value) => {
            setSource(value);
            if (value === "inherit")
              setDraft(String(defaults[field.key] ?? ""));
          }}
        />
        {error && (
          <p role="alert" className="ps-error">
            {error}
          </p>
        )}
        <div className="ps-actions">
          {changed && (
            <span className="ps-draft-status">
              {ar ? "تغيير غير محفوظ" : "Unsaved change"}
            </span>
          )}
          <Button type="submit" disabled={!changed || busy}>
            {copy.save}
          </Button>
          {field.help && (
            <ContextHelp
              helpKey={field.help}
              locale={locale}
              scopeIdentity={identity}
            />
          )}
          {isLocation && !inherited && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => submit(true)}
            >
              {copy.clear}
            </Button>
          )}
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              if (!changed || window.confirm(copy.leave)) onClose();
            }}
          >
            {copy.cancel}
          </Button>
        </div>
        <small className="ps-inline-note">
          {ar
            ? "تبقى القيمة المحفوظة سارية حتى نجاح الحفظ."
            : "The saved value remains effective until Save succeeds."}
        </small>
      </form>
      {strict && (
        <FocusDialog
          label={ar ? "تأكيد وضع الحضور" : "Confirm presence mode"}
          onClose={() => setStrict(false)}
        >
          <div className="ps-dialog">
            <h2>
              {ar
                ? "تأكيد وضع الحضور الإلزامي"
                : "Confirm strict presence mode"}
            </h2>
            <p>
              {ar
                ? "يتطلب الوضع الإلزامي مناطق حضور صالحة. يتحقق الخادم من الجاهزية قبل الحفظ."
                : "Strict modes require valid attendance zones. The server checks readiness before saving."}
            </p>
            <div className="ps-actions">
              <Button variant="secondary" onClick={() => setStrict(false)}>
                {copy.cancel}
              </Button>
              <Button
                onClick={() => {
                  setStrict(false);
                  void finish(strictClear, true);
                }}
              >
                {copy.save}
              </Button>
            </div>
          </div>
        </FocusDialog>
      )}
    </div>
  );
}

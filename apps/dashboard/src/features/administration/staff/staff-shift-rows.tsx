import {
  staffManagementDisplayName,
  type StaffShiftHistoryEntry,
} from "@valet/contracts";
import { MoreHorizontal } from "lucide-react";
import { administrationCopy } from "../administration-copy";
import { StatusBadge } from "../administration-ui";
import { formatStaffTime } from "./staff-presentation";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import { shiftDuration } from "./staff-shift-time";
import css from "./staff-reference.module.css";
export function StaffShiftRows(props: {
  readonly items: readonly StaffShiftHistoryEntry[];
  readonly locale: "en" | "ar";
  readonly now: number;
  readonly onSelect: (id: string) => void;
}) {
  const t = administrationCopy(props.locale),
    h = staffShiftHistoryCopy(props.locale);
  if (!props.items.length)
    return (
      <tr>
        <td className={css.emptyCell} colSpan={7}>
          {h.empty}
        </td>
      </tr>
    );
  return (
    <>
      {props.items.map((item, index) => {
        const name = staffManagementDisplayName(item.identity);
        const started = formatStaffTime(
          item.startedAt,
          item.location.timezone,
          props.locale,
        );
        return (
          <tr key={item.shiftId}>
            <td>
              <div className={css.primary}>
                <bdi dir="auto">{name}</bdi>
              </div>
              <div className={css.secondary}>
                <bdi dir="ltr">{item.identity.email}</bdi>
              </div>
            </td>
            <td>
              <div className={css.primary}>
                <bdi dir="auto">{item.location.name}</bdi>
              </div>
              <div className={css.secondary}>
                <bdi dir="ltr">{item.location.code}</bdi>
              </div>
            </td>
            <td>
              <StatusBadge
                {...(item.status === "ACTIVE" ? { good: true } : {})}
              >
                {item.status === "ACTIVE" ? t.active : h.ended}
              </StatusBadge>
            </td>
            <td>
              <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>{started}</bdi>
            </td>
            <td>
              <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
                {item.endedAt === null
                  ? "—"
                  : formatStaffTime(
                      item.endedAt,
                      item.location.timezone,
                      props.locale,
                    )}
              </bdi>
            </td>
            <td data-testid="shift-duration">
              <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
                {shiftDuration(item, props.now, props.locale)}
              </bdi>
            </td>
            <td className={css.actionCell}>
              <button
                aria-label={`${h.details}: \u2068${name}\u2069 · \u2068${item.location.name}\u2069 · \u2068${started}\u2069 · ${new Intl.NumberFormat(props.locale).format(index + 1)}`}
                className={css.detailAction}
                data-shift-detail={item.shiftId}
                onClick={() => props.onSelect(item.shiftId)}
                type="button"
              >
                <MoreHorizontal aria-hidden="true" size={18} />
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

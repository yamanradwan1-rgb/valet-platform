import { useCallback, useId, useState } from "react";
import type { TaskRouteRecording } from "@valet/contracts";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { styles } from "../../operations-ui";
import { routeCopy } from "./route-copy";
import { RouteStatePanel } from "./route-state";
import { RecordingSamples } from "./recording-samples";
import s from "./route-history.module.css";

export function RecordingPage(props: {
  readonly api: DashboardApiClient;
  readonly recordings: TaskRouteRecording[];
  readonly scopeKey: string;
  readonly timezone: string;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const id = useId();
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  const [selected, setSelected] = useState(0);
  const recording = props.recordings[selected]!;
  if (denied) return <RouteStatePanel state="denied" />;
  return (
    <>
      {props.recordings.length > 1 ? (
        <div className={s.recordingSelector}>
          <label htmlFor={id}>{t.recording}</label>
          <select
            className={styles.select}
            id={id}
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {props.recordings.map((entry, index) => (
              <option key={entry.trackingSessionId} value={index}>
                {t.recording} {(index + 1).toLocaleString(locale)} ·{" "}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "short",
                  timeStyle: "medium",
                  timeZone: props.timezone,
                }).format(new Date(entry.startedAt))}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <RecordingSamples
        key={recording.trackingSessionId}
        onDenied={onDenied}
        api={props.api}
        trackingSessionId={recording.trackingSessionId}
        scopeKey={props.scopeKey}
        timezone={props.timezone}
      />
      {recording.assigneeMembershipId === null ? (
        <p className={s.recordingOwner}>{t.unknownOwner}</p>
      ) : null}
    </>
  );
}

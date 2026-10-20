import type {
  InspectorFamily,
  InspectorFilter,
  InspectorResource,
} from "./resource-inspector-contract";
import type { inspectorCopy } from "./resource-inspector-copy";
import {
  resourceState,
  resourceUsage,
  resourceVehicle,
} from "./resource-inspector-presentation";

type Copy = ReturnType<typeof inspectorCopy>;

export function ResourceInspectorMaster(props: {
  readonly t: Copy;
  readonly family: InspectorFamily;
  readonly filter: InspectorFilter;
  readonly rows: readonly InspectorResource[];
  readonly totalOnPage: number;
  readonly selectedId: string | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly canNext: boolean;
  readonly partialPage: boolean;
  readonly onFilter: (next: InspectorFilter) => void;
  readonly onSelect: (id: string, button: HTMLButtonElement) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}) {
  const { t } = props;
  const filters: readonly InspectorFilter[] = ["all", "busy", "available", "inactive"];
  return (
    <section className="c-master" aria-labelledby="c-list-title">
      <div className="c-master-head">
        <div>
          <div className="c-overline">{t.collection}</div>
          <h2 id="c-list-title">{t.resourceList}</h2>
        </div>
        <span className="c-list-total">{props.totalOnPage} {t.resources}</span>
      </div>
      <div className="c-filter-row" role="group" aria-label={t.configured}>
        {filters.map((filter) => (
          <button
            aria-pressed={props.filter === filter}
            className={`c-filter ${props.filter === filter ? "is-active" : ""}`}
            data-c-filter={filter}
            key={filter}
            onClick={() => props.onFilter(filter)}
            type="button"
          >
            {filter === "busy" ? (props.family === "keys" ? t.busyFilter : t.occupied) : t[filter]}
          </button>
        ))}
      </div>
      <div className="c-list-caption">
        <span>{t.configured}</span>
        <span>{props.rows.length} / {props.totalOnPage}</span>
      </div>
      <div className="c-master-scroll" onScroll={(event) => {
        const el = event.currentTarget;
        if (props.canNext && !props.loading &&
            el.scrollHeight - el.scrollTop - el.clientHeight < 180) props.onLoadMore();
      }}>
        {props.loading ? <p className="c-empty" role="status">{t.loading}</p> : null}
        {props.error ? (
          <div className="c-empty" role="alert">
            <p>{t.error}</p>
            <button className="c-quiet-action" onClick={props.onRetry} type="button">{t.retry}</button>
          </div>
        ) : null}
        {!props.loading && !props.error ? (
          <ul className="c-resource-list" aria-label={t.resourceList} data-issue304-resource-list>
            {props.rows.map((item) => {
              const state = resourceState(item);
              const vehicle = resourceVehicle(item, t);
              return (
                <li key={item.id}>
                  <button
                    aria-current={props.selectedId === item.id}
                    aria-label={`${item.code}, ${vehicle.label}, ${item.label || t.noLabel}, ${resourceUsage(item, t)}`}
                    className="c-resource"
                    data-c-id={item.id}
                    data-resource-code={item.code}
                    onClick={(event) => props.onSelect(item.id, event.currentTarget)}
                    type="button"
                  >
                    <span className="c-row-icon" data-kind={props.family} aria-hidden="true">
                      {props.family === "keys" ? "K" : "P"}
                    </span>
                    <span className="c-row-main">
                      <span className="c-row-top">
                        <bdi className="c-row-code" dir="ltr">{item.code}</bdi>
                        <span className="c-mini-state" data-state={state}>
                          {state === "inactive" ? t.inactive : state === "unknown" ? t.unknown : resourceUsage(item, t)}
                        </span>
                      </span>
                      <span className="c-row-vehicle" data-c-vehicle-state={state}>
                        <bdi className="c-row-identity" dir={vehicle.dir}>{vehicle.label}</bdi>
                        <span className="c-row-vehicle-caption">{t.associatedVehicle}</span>
                      </span>
                      <span className="c-row-label">{item.label || t.noLabel}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!props.loading && !props.error && !props.rows.length ? (
          <p className="c-empty">{t.none}</p>
        ) : null}
      </div>
      <div className="c-master-foot">
        <div className="c-foot-scope">
          <span className="c-foot-dot" aria-hidden="true" />
          <span>{props.partialPage ? t.partialPage : t.scopeNote}</span>
        </div>
      </div>
    </section>
  );
}

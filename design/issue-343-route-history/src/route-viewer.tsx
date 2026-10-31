import { useCallback, useEffect, useState } from 'react';
import { Route, X, Info, ArrowRight } from 'lucide-react';
import type { TaskOverviewEntry } from '@valet/contracts';
import { useDashboardLocale } from '@dashboard/lib/i18n/locale-provider';
import { FocusDialog } from '@dashboard/components/presentation/focus-dialog';
import { StatusBadge, styles } from '@dashboard/features/operations/operations-ui';
import { operationsTaskTypeLabel, operationsTaskStatusLabel } from '@dashboard/features/operations/operations-presentation';
import { routeCopy, type Scenario } from './route-copy';
import type { Sample } from './route-fixtures';
import { RouteStatePanel } from './route-state';
import { SampleInspector } from './sample-inspector';
import { DemoControls } from './demo-controls';
import RouteMap from './route-map';
import { location } from './task-fixtures';
import s from './route-history.module.css';

export default function RouteViewer({ item, scenario, onScenario, onClose }: {
  item: TaskOverviewEntry; scenario: Scenario; onScenario: (value: Scenario) => void; onClose: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const [read, setRead] = useState<{ key: string; samples: Sample[] } | null>(null);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  const key = `${item.taskId}:${scenario}:${retry}`;
  const blocked = scenario === 'denied' || scenario === 'unavailable';
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);
  useEffect(() => {
    if (blocked || scenario === 'loading') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import('./route-fixtures').then(({ createRouteFixture }) => {
        if (!cancelled) {
          setSelected(0);
          setRead({ key, samples: createRouteFixture(scenario, item.taskType === 'RETRIEVAL') });
        }
      });
    }, 550);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [blocked, scenario, key, item.taskType]);
  const select = useCallback((index: number) => setSelected(index), []);
  const loaded = read?.key === key;
  const samples = !blocked && loaded ? read.samples : [];
  const providerFailed = scenario === 'provider' && retry === 0;
  const state = blocked ? scenario : !loaded ? 'loading' : providerFailed ? 'provider' : samples.length === 0 ? 'empty' : null;
  return (
    <div className={s.viewerScope} onKeyDownCapture={(event) => {
      // The shared dialog handles Escape/return focus. Its generic selector also
      // includes collapsed demo controls; bound Tab here to visible controls only.
      if (event.key !== 'Tab') return;
      const dialog = event.currentTarget.querySelector('[role="dialog"]');
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),select:not([disabled]),input:not([disabled]),summary,[tabindex="0"]',
      ) ?? []).filter((node) => node.getClientRects().length > 0 &&
        (node.tagName === 'SUMMARY' || !node.closest('details:not([open])')));
      const first = focusable[0], last = focusable.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        event.stopPropagation();
        (event.shiftKey ? last : first)?.focus();
      }
    }}>
      <FocusDialog label={t.viewer} onClose={onClose}>
        <header className={s.viewerHeader}>
          <div className={s.viewerHeading}>
            <span className={s.viewerIcon}><Route size={20} aria-hidden="true" /></span>
            <div><h2>{t.viewer}</h2><p>{t.notLive}</p></div>
          </div>
          <button type="button" className={`${styles.quiet} ${s.close}`} onClick={onClose} aria-label={t.close}><X size={19} /></button>
        </header>
        <div className={s.context}>
          <strong>{operationsTaskTypeLabel(item.taskType, locale)}</strong>
          <StatusBadge tone="good">{operationsTaskStatusLabel(item.status, locale)}</StatusBadge>
          <span>{location.name}</span><span className={s.readOnly}>{t.readOnly}</span>
        </div>
        <div className={s.viewerBody}>
          {state ? <RouteStatePanel state={state} onRetry={() => setRetry((v) => v + 1)} /> : (
            <div className={s.routeLayout}>
              <div className={s.mapColumn}>
                <div className={s.mapBar}><span><Route size={14} aria-hidden="true" />{t.historical}</span><span>{t.demoShort}</span></div>
                <RouteMap key={key} samples={samples} selected={selected} onSelect={select} />
                <div className={s.legend}>
                  {samples.length > 1 ? <><span><i className={s.legendStart}>A</i>{t.startPin}</span><ArrowRight size={14} aria-hidden="true" /><span><i className={s.legendEnd}>B</i>{t.endPin}</span></> : <span>{t.onePoint}</span>}
                </div>
                <p className={s.observationNote}><Info size={14} aria-hidden="true" />{scenario === 'partial' ? t.partial : samples.length === 1 ? t.onePoint : t.straight}</p>
              </div>
              <SampleInspector samples={samples} selected={selected} onSelect={select} />
            </div>
          )}
        </div>
        <footer className={s.viewerFooter}>
          <p>{t.demoNote}</p>
          <DemoControls value={scenario} onChange={(value) => { setRetry(0); onScenario(value); }} />
        </footer>
      </FocusDialog>
    </div>
  );
}

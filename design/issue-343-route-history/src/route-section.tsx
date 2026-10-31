import { lazy, Suspense, useState } from 'react';
import { Route, ArrowUpRight } from 'lucide-react';
import type { TaskOverviewEntry } from '@valet/contracts';
import { useDashboardLocale } from '@dashboard/lib/i18n/locale-provider';
import { styles } from '@dashboard/features/operations/operations-ui';
import { routeCopy, type Scenario } from './route-copy';
import { DemoControls } from './demo-controls';
import s from './route-history.module.css';

const RouteViewer = lazy(() => import('./route-viewer'));

export function RouteHistorySection({ item }: { item: TaskOverviewEntry }) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('recorded');
  const active = item.status !== 'COMPLETED';
  const denied = scenario === 'denied';
  return (
    <section className={s.section} aria-labelledby="route-history-heading">
      <div className={s.sectionHeading}>
        <Route size={17} aria-hidden="true" />
        <h3 id="route-history-heading">{t.title}</h3>
      </div>
      <p>{active ? t.active : denied ? t.deniedBody : t.description}</p>
      <button className={styles.secondary} disabled={active || denied} onClick={() => setOpen(true)} type="button">
        <Route size={15} aria-hidden="true" />{t.view}<ArrowUpRight size={14} aria-hidden="true" />
      </button>
      {active || denied ? <p role="status">{active ? t.activeBody : t.denied}</p> : null}
      <DemoControls value={scenario} onChange={setScenario} />
      {open ? (
        <Suspense fallback={<p role="status">{t.loading}</p>}>
          <RouteViewer item={item} scenario={scenario} onScenario={setScenario} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </section>
  );
}

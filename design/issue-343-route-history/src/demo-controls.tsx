import { useDashboardLocale } from '@dashboard/lib/i18n/locale-provider';
import { HeaderLocaleControl, HeaderThemeControl } from '@dashboard/components/foundation/header-preferences';
import { routeCopy, scenarios, type Scenario } from './route-copy';
import s from './route-history.module.css';
import { styles } from '@dashboard/features/operations/operations-ui';

export function DemoControls({ value, onChange }: { value: Scenario; onChange: (value: Scenario) => void }) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  return (
    <details className={s.demoControls}>
      <summary>{t.demoControls} · {t.demo}</summary>
      <div className={s.demoFields}>
        <label className={s.demoField}>{t.scenario}
          <select aria-label={t.scenario} className={styles.select} value={value} onChange={(e) => onChange(e.target.value as Scenario)}>
            {scenarios.map((entry) => <option key={entry.value} value={entry.value}>{entry[locale]}</option>)}
          </select>
        </label>
        <div className={s.inline}><HeaderLocaleControl /><HeaderThemeControl /></div>
      </div>
    </details>
  );
}

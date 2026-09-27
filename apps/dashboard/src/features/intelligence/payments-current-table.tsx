import { BidiText } from "../../components/presentation/panel";
import { paymentsCopy } from "./payments-copy";
import type { PaymentsBreakdownProps } from "./payments-breakdown-types";
import { Money, State, FinancialTable } from "./payments-table-primitives";
import styles from "./payments-breakdown.module.css";

import { paymentMethodLabel, paymentStatusLabel } from "./payments-labels";

export function CurrentTable(props: PaymentsBreakdownProps) {
  const t = paymentsCopy(props.locale);
  return (
    <section
      className={styles.breakdownSection}
      aria-labelledby="current-financial-heading"
    >
      <h3 id="current-financial-heading">{t.currentFinancial}</h3>
      <p className={styles.sectionContext}>{t.currentFinancialContext}</p>
      {props.currentLoading ? (
        <State message={t.loading} compact />
      ) : props.currentError ? (
        <State
          message={props.currentError}
          onRetry={props.onRetryCurrent}
          retry={t.retry}
          compact
        />
      ) : !props.current || props.current.currencies.length === 0 ? (
        <State message={t.noCurrent} compact />
      ) : (
        <FinancialTable label={t.currentFinancial}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.currency}</th>
                <th>{t.paymentCount}</th>
                <th>{t.amountDue}</th>
                <th>{t.amountPaid}</th>
                <th>{t.tips}</th>
                <th>{t.refunds}</th>
                <th>{t.currentValidation}</th>
                <th>{t.collectionMethods}</th>
                <th>{t.statuses}</th>
              </tr>
            </thead>
            <tbody>
              {props.current.currencies.map((group) => (
                <tr key={group.currency}>
                  <td>
                    <BidiText>{group.currency}</BidiText>
                  </td>
                  <td>
                    <BidiText kind="number">{group.paymentCount}</BidiText>
                  </td>
                  <Money
                    value={group.amountDueTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={group.amountPaidTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={group.tipAmountTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={group.succeededRefundAmountTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <Money
                    value={group.currentValidationAmountTotal}
                    currency={group.currency}
                    locale={props.locale}
                  />
                  <td>
                    {group.collectionMethodCounts.map((item) => (
                      <Count
                        key={item.method}
                        code={paymentMethodLabel(item.method, props.locale)}
                        count={item.count}
                      />
                    ))}
                  </td>
                  <td>
                    {group.statusCounts.map((item) => (
                      <Count
                        key={item.status}
                        code={paymentStatusLabel(item.status, props.locale)}
                        count={item.count}
                      />
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FinancialTable>
      )}
    </section>
  );
}

function Count({
  code,
  count,
}: {
  readonly code: string;
  readonly count: number;
}) {
  return (
    <span className={styles.countItem}>
      {code}: <BidiText kind="number">{count}</BidiText>
    </span>
  );
}

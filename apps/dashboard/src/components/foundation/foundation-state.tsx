import { Panel } from "../presentation/panel";

export function FoundationState({
  title,
  message,
}: {
  readonly title: string;
  readonly message: string;
}) {
  return (
    <div className="auth-card-wrap">
      <Panel className="auth-card">
        <div className="stack" role="status">
          <p className="eyebrow">VAYLET</p>
          <h1>{title}</h1>
          <p className="muted">{message}</p>
        </div>
      </Panel>
    </div>
  );
}

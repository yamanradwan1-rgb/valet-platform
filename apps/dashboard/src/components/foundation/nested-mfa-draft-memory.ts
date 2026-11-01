// Transient editor state is owned by one authenticated session, scope and route.
// Rehydration follows renewed session/scope and protected-resource checks.
export type GuestDraftKey =
  "privacy:drafts" | "contact:fields" | "contact:hours" | "company:values";
export type GuestDraftResource = "privacy" | "contact" | "company";

export interface GuestDraftSnapshot<T> {
  readonly revision: number;
  readonly value: T;
  readonly savedValue: T;
}

export type GuestDraftVersions = Partial<
  Record<GuestDraftResource, number | undefined>
>;
export type GuestDraftValues = Partial<Record<GuestDraftKey, unknown>>;

const resourceForKey = (key: GuestDraftKey): GuestDraftResource =>
  key.split(":")[0] as GuestDraftResource;

export class NestedMfaDraftMemory {
  private readonly drafts = new Map<
    GuestDraftKey,
    GuestDraftSnapshot<unknown>
  >();
  private readonly editor = new Map<string, string | boolean>();
  private phase: "editing" | "challenged" | "restoring" = "editing";

  get restoring(): boolean {
    return this.phase === "restoring";
  }

  remember<T>(key: GuestDraftKey, snapshot: GuestDraftSnapshot<T>): void {
    if (
      JSON.stringify(snapshot.value) === JSON.stringify(snapshot.savedValue)
    ) {
      this.drafts.delete(key);
    } else {
      this.drafts.set(key, snapshot);
    }
  }

  rememberEditor(key: string, value: string | boolean): void {
    this.editor.set(key, value);
  }

  restoreEditor<T extends string | boolean>(key: string, fallback: T): T {
    const saved = this.editor.get(key);
    return this.restoring && typeof saved === typeof fallback
      ? (saved as T)
      : fallback;
  }

  challenge(): void {
    if (this.phase !== "restoring") this.phase = "challenged";
  }

  // Token renewal may temporarily unmount the editor without replacing the
  // persisted Staff session. The scope and protected resource are fetched
  // again before any retained draft is rendered.
  resumeAfterSameSessionRefresh(): void {
    if (this.phase === "editing" && this.drafts.size > 0)
      this.phase = "restoring";
  }

  assured(): void {
    if (this.phase === "challenged") this.phase = "restoring";
  }

  restore<T>(
    key: GuestDraftKey,
    revision: number,
  ): GuestDraftSnapshot<T> | null {
    const snapshot = this.drafts.get(key);
    return this.restoring && snapshot?.revision === revision
      ? (snapshot as GuestDraftSnapshot<T>)
      : null;
  }

  conflicts(versions: GuestDraftVersions): GuestDraftResource[] {
    if (!this.restoring) return [];
    const result = new Set<GuestDraftResource>();
    for (const [key, snapshot] of this.drafts) {
      const resource = resourceForKey(key);
      const version = versions[resource];
      if (version !== undefined && version !== snapshot.revision) {
        result.add(resource);
      }
    }
    return [...result];
  }

  reconcile(
    resource: GuestDraftResource,
    revision: number,
    persisted: GuestDraftValues,
    keepAfterExplicitReview: boolean,
  ): void {
    for (const [key, snapshot] of this.drafts) {
      if (resourceForKey(key) !== resource) continue;
      if (!keepAfterExplicitReview || persisted[key] === undefined) {
        this.drafts.delete(key);
        continue;
      }
      this.remember(key, {
        revision,
        value: snapshot.value,
        savedValue: persisted[key],
      });
    }
  }

  finishRestoration(): void {
    if (this.restoring) this.phase = "editing";
  }

  clear(): void {
    this.drafts.clear();
    this.editor.clear();
    this.phase = "editing";
  }
}

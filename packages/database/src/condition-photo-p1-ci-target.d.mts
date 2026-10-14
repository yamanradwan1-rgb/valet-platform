import type { DockerTarget, LiveIdentity, TargetEnvironment } from "./condition-photo-p1-test-target.mjs";

export function requireIssue215CiUrl(env: TargetEnvironment): string;
export function assertIssue215CiDockerTarget(targets: DockerTarget[], env: TargetEnvironment): void;
export function assertIssue215CiLiveIdentity(identity?: LiveIdentity): void;

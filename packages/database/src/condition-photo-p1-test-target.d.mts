import type { Client } from "pg";

export interface TargetEnvironment {
  TEST_DATABASE_URL?: string | undefined;
  NODE_ENV?: string | undefined;
  VAYLET_TEST_PROJECT?: string | undefined;
  VAYLET_TEST_RUN_ID?: string | undefined;
  [key: string]: string | undefined;
}

export interface DockerTarget {
  Id?: string;
  Name?: string;
  Config?: { Image?: string; Env?: string[]; Labels?: Record<string, string> };
  State?: { Status?: string };
  NetworkSettings?: { Ports?: Record<string, { HostIp: string; HostPort: string }[] | null> };
  Mounts?: { Type: string; Destination: string; Name?: string }[];
}

export interface LiveIdentity {
  database: string;
  actor: string;
  session_role: string;
  database_owner: string;
  port: number;
  recovery: boolean;
  can_create_db: boolean;
  can_create_role: boolean;
  version: number;
  accepts_connections: boolean;
}

export function requireIssue215TestUrl(env?: TargetEnvironment): string;
export function assertIssue215DockerTarget(targets: DockerTarget[]): void;
export function inspectIssue215DockerTarget(): void;
export function assertIssue215LiveIdentity(identity?: LiveIdentity): void;
export function verifyIssue215Bootstrap(client: Pick<Client, "query">): Promise<void>;
export function preflightIssue215TestTarget(ClientCtor: typeof Client, projectName: string): Promise<void>;

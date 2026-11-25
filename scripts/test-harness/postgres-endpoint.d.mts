export interface PostgresEndpointIdentity {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly key: string;
}
export function postgresEndpointIdentity(
  connectionString: unknown,
): PostgresEndpointIdentity;

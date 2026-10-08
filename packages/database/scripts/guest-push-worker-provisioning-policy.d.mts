export interface GuestPushWorkerProvisioningIdentity {
  readonly database: string;
  readonly host: string;
  readonly password: string;
  readonly port: string;
  readonly role: string;
}

export interface GuestPushWorkerProvisioningConfiguration {
  readonly apiIdentity: GuestPushWorkerProvisioningIdentity;
  readonly migration: {
    readonly parsed: URL;
    readonly value: string;
  };
  readonly migrationIdentity: GuestPushWorkerProvisioningIdentity;
  readonly workerIdentity: GuestPushWorkerProvisioningIdentity;
  readonly workerRole: string;
}

export function readGuestPushWorkerProvisioningConfiguration(
  env: NodeJS.ProcessEnv,
  nodeEnv?: string,
): GuestPushWorkerProvisioningConfiguration;

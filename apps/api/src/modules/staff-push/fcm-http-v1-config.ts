export interface FcmHttpV1Config {
  readonly projectId: string;
  readonly timeoutMilliseconds: number;
}

const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

export function readFcmHttpV1Config(
  env: NodeJS.ProcessEnv,
  sendingEnabled: boolean,
  timeoutSeconds: number,
): FcmHttpV1Config | undefined {
  const projectId = env.STAFF_PUSH_FCM_PROJECT_ID;
  if (!sendingEnabled) {
    if (
      projectId !== undefined &&
      projectId !== "" &&
      !projectIdPattern.test(projectId)
    ) {
      throw new Error("Staff Push FCM project configuration is invalid.");
    }
    return undefined;
  }
  if (projectId === undefined || !projectIdPattern.test(projectId)) {
    throw new Error(
      "Staff Push FCM project configuration is required and invalid.",
    );
  }
  return { projectId, timeoutMilliseconds: timeoutSeconds * 1_000 };
}

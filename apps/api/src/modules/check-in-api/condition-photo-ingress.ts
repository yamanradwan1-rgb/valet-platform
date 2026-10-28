import { conditionPhotoProcessingMetrics as metrics } from "../vehicle-photos/condition-photo-processing-metrics";
import { ConditionPhotoUploadUnavailable } from "../vehicle-photos/condition-photo-upload-executor";

// Independent process-local memory admission in addition to durable
// per-User/per-Session quotas. Each request can buffer at most 8MiB.
// Bounding simultaneous parsers avoids N authenticated identities allocating
// unbounded RAM before they reach the two-worker decoder limit.
const maximumConcurrentMultipart = 4;
let admitted = 0;

export function acquireConditionPhotoIngress(): () => void {
  if (admitted >= maximumConcurrentMultipart) {
    metrics.ingressRejected++;
    throw new ConditionPhotoUploadUnavailable();
  }
  admitted++;
  metrics.ingressActive = admitted;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    admitted--;
    metrics.ingressActive = admitted;
  };
}

let ready = false

export function markReady() {
  ready = true
}

//* Called at the start of shutdown so a load balancer or k8s readiness
//* probe stops routing new traffic here immediately — before the
//* server has even started draining connections.
export function markNotReady() {
  ready = false
}

export function isReady() {
  return ready
}
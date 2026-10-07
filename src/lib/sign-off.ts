export interface SignOffState {
  status: string
  requiresSignOff: boolean
  signedOffAt: Date | null
  completedById: string | null
}

/** A finished list that needs approval and hasn't had it yet. */
export function isPendingSignOff(c: Pick<SignOffState, 'status' | 'requiresSignOff' | 'signedOffAt'>) {
  return c.status === 'completed' && c.requiresSignOff && !c.signedOffAt
}

/**
 * Four-eyes rule: only a manager or admin may sign off, and never the person
 * who finished the list.
 */
export function checkSignOff(
  c: SignOffState,
  user: { id: string; role: string }
): { ok: true } | { ok: false; status: number; error: string } {
  if (!isPendingSignOff(c)) return { ok: false, status: 409, error: 'Nothing to sign off' }
  if (user.role !== 'admin' && user.role !== 'manager') {
    return { ok: false, status: 403, error: 'Only a manager or admin can sign off' }
  }
  if (c.completedById === user.id) {
    return { ok: false, status: 403, error: 'You completed this list, so someone else must sign it off' }
  }
  return { ok: true }
}

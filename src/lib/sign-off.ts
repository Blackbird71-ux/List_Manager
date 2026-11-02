export interface SignOffState {
  status: string
  requiresSignOff: boolean
  signedOffAt: Date | null
  completedById: string | null
  // Failed items whose corrective action is still open.
  openActions: number
}

/** A finished list that needs approval and hasn't had it yet. */
export function isPendingSignOff(c: Pick<SignOffState, 'status' | 'requiresSignOff' | 'signedOffAt'>) {
  return c.status === 'completed' && c.requiresSignOff && !c.signedOffAt
}

/**
 * Four-eyes rule: only a manager or admin may sign off, and never the person
 * who finished the list. Approval also waits for every corrective action to be
 * closed; sending a list back is always allowed.
 */
export function checkSignOff(
  c: SignOffState,
  user: { id: string; role: string },
  decision: 'approve' | 'reject' = 'approve'
): { ok: true } | { ok: false; status: number; error: string } {
  if (!isPendingSignOff(c)) return { ok: false, status: 409, error: 'Nothing to sign off' }
  if (user.role !== 'admin' && user.role !== 'manager') {
    return { ok: false, status: 403, error: 'Only a manager or admin can sign off' }
  }
  if (c.completedById === user.id) {
    return { ok: false, status: 403, error: 'You completed this list, so someone else must sign it off' }
  }
  if (decision === 'approve' && c.openActions > 0) {
    const n = c.openActions
    return { ok: false, status: 409, error: `Close the ${n} open corrective action${n === 1 ? '' : 's'} before signing off` }
  }
  return { ok: true }
}

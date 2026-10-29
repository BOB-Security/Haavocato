'use strict';

const transitions = Object.freeze({
  new: new Set(['triage', 'declined', 'cancelled']),
  triage: new Set(['awaiting_client', 'assigned', 'declined', 'cancelled']),
  awaiting_client: new Set(['triage', 'assigned', 'cancelled']),
  assigned: new Set(['in_progress', 'awaiting_client', 'awaiting_payment', 'scheduled', 'cancelled']),
  in_progress: new Set(['awaiting_client', 'awaiting_payment', 'scheduled', 'completed', 'cancelled']),
  awaiting_payment: new Set(['in_progress', 'scheduled', 'cancelled']),
  scheduled: new Set(['in_progress', 'completed', 'cancelled']),
  completed: new Set(['archived']),
  declined: new Set(['archived']),
  cancelled: new Set(['archived']),
  archived: new Set(),
});

function canTransition(from, to) {
  return Boolean(transitions[from] && transitions[from].has(to));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Invalid request status transition: ${from} -> ${to}`);
    error.code = 'INVALID_STATUS_TRANSITION';
    throw error;
  }
}

function listStatuses() {
  return Object.keys(transitions);
}

module.exports = { canTransition, assertTransition, listStatuses };

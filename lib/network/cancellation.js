/**
 * Vertical Ingestion Network Cancellation & Schedule Reconciliation Engine
 *
 * Tracks schedule modifications, rainouts, and cancellations:
 * 1. Explicit cancellation: source feed contains STATUS:CANCELLED or EventCancelled
 * 2. Feed disappearance: event present in prior cycle is missing from the official feed
 * 3. Schedule adjustment: start time shifted (e.g. rain delay or postponed date)
 */

function reconcileScheduleCycle(previousEvents = [], incomingCycle = {}) {
  const { events: newActiveEvents = [], cancelledUids = [], cancelledIds = [] } = incomingCycle;
  const explicitCancelledSet = new Set([...(cancelledUids || []), ...(cancelledIds || [])]);

  const activeEventMap = new Map();
  const reconciledActive = [];
  const reconciledCancelled = [];
  const scheduleChanges = [];

  for (const ev of newActiveEvents) {
    activeEventMap.set(ev.id, ev);
  }

  // Check previous events against new cycle
  for (const prev of previousEvents) {
    if (explicitCancelledSet.has(prev.id)) {
      reconciledCancelled.push({
        ...prev,
        isCancelled: true,
        cancellationReason: 'explicit_source_cancellation',
        cancelledAt: new Date().toISOString()
      });
      continue;
    }

    if (activeEventMap.has(prev.id)) {
      const incoming = activeEventMap.get(prev.id);
      // Check for time changes / schedule shifts
      if (prev.start && incoming.start && prev.start !== incoming.start) {
        scheduleChanges.push({
          id: prev.id,
          title: prev.title,
          priorStart: prev.start,
          newStart: incoming.start,
          changedAt: new Date().toISOString()
        });
      }
      reconciledActive.push(incoming);
      activeEventMap.delete(prev.id);
    } else {
      // Event disappeared from source calendar
      // If start time is in the future, mark as withdrawn/cancelled by venue
      const isFuture = new Date(prev.start).getTime() > Date.now();
      if (isFuture) {
        reconciledCancelled.push({
          ...prev,
          isCancelled: true,
          cancellationReason: 'disappeared_from_official_calendar',
          cancelledAt: new Date().toISOString()
        });
      }
    }
  }

  // Add brand new events
  for (const brandNew of activeEventMap.values()) {
    reconciledActive.push(brandNew);
  }

  return {
    activeEvents: reconciledActive,
    cancelledEvents: reconciledCancelled,
    scheduleChanges,
    totalActive: reconciledActive.length,
    totalCancelled: reconciledCancelled.length,
    totalChanged: scheduleChanges.length
  };
}

module.exports = {
  reconcileScheduleCycle
};

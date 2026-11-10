use std::time::{Duration, Instant};

/// Per-repository debounce state machine.
///
/// The quiet period starts after the most recent event; the hard deadline is
/// measured from the first event of the current burst. The state machine is
/// clock-injected so tests can drive it deterministically.
#[derive(Debug, Clone)]
pub struct DebounceState {
    quiet: Duration,
    hard: Duration,
    first_event: Option<Instant>,
    last_event: Option<Instant>,
    pending: bool,
}

impl DebounceState {
    pub fn new(quiet: Duration, hard: Duration) -> Self {
        Self {
            quiet,
            hard,
            first_event: None,
            last_event: None,
            pending: false,
        }
    }

    pub fn default_timing() -> Self {
        Self::new(Duration::from_millis(300), Duration::from_secs(2))
    }

    pub fn on_event(&mut self, now: Instant) {
        if self.first_event.is_none() {
            self.first_event = Some(now);
        }
        self.last_event = Some(now);
        self.pending = true;
    }

    /// Returns true when the accumulated burst should be flushed. Resets the
    /// state so the next burst starts fresh.
    pub fn poll(&mut self, now: Instant) -> bool {
        if !self.pending {
            return false;
        }
        let quiet_elapsed = self
            .last_event
            .map(|last| now.saturating_duration_since(last) >= self.quiet)
            .unwrap_or(false);
        let hard_elapsed = self
            .first_event
            .map(|first| now.saturating_duration_since(first) >= self.hard)
            .unwrap_or(false);

        if quiet_elapsed || hard_elapsed {
            self.reset();
            return true;
        }
        false
    }

    pub fn is_pending(&self) -> bool {
        self.pending
    }

    pub fn reset(&mut self) {
        self.first_event = None;
        self.last_event = None;
        self.pending = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Instant {
        Instant::now()
    }

    #[test]
    fn quiet_period_flushes() {
        let start = base();
        let mut state = DebounceState::default_timing();
        state.on_event(start);
        assert!(!state.poll(start + Duration::from_millis(100)));
        assert!(state.poll(start + Duration::from_millis(350)));
        assert!(!state.is_pending());
    }

    #[test]
    fn hard_deadline_flushes_during_stream() {
        let start = base();
        let mut state = DebounceState::default_timing();
        state.on_event(start);
        state.on_event(start + Duration::from_millis(900));
        state.on_event(start + Duration::from_millis(1800));
        assert!(!state.poll(start + Duration::from_millis(1900)));
        assert!(state.poll(start + Duration::from_millis(2100)));
    }

    #[test]
    fn events_after_flush_start_new_burst() {
        let start = base();
        let mut state = DebounceState::default_timing();
        state.on_event(start);
        assert!(state.poll(start + Duration::from_millis(400)));
        state.on_event(start + Duration::from_millis(500));
        assert!(!state.poll(start + Duration::from_millis(700)));
        assert!(state.poll(start + Duration::from_millis(900)));
    }
}

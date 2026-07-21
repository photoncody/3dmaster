export type TimerState = {
  startedAt: Date | null;
  durationSeconds: number;
  status: string;
  pausedRemaining: number | null;
};

export function remainingSeconds(timer: TimerState, now = Date.now()): number {
  if (timer.status === "paused") {
    return timer.pausedRemaining ?? 0;
  }
  if (timer.status === "running" && timer.startedAt) {
    const elapsed = Math.floor((now - timer.startedAt.getTime()) / 1000);
    return Math.max(0, timer.durationSeconds - elapsed);
  }
  if (timer.status === "completed") return 0;
  return timer.durationSeconds;
}

export function isTimerFinished(timer: TimerState, now = Date.now()): boolean {
  return timer.status === "running" && remainingSeconds(timer, now) <= 0;
}

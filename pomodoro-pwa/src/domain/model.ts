export type TimerMode = 'pomodoro' | 'short' | 'long';
export type TimerStatus = 'idle' | 'running' | 'paused';
export type StudySettings = Readonly<{
  pomodoro: number;
  short: number;
  long: number;
  goal: number;
  sound: boolean;
  autoAdvance: boolean;
}>;
export type StudySession = Readonly<{
  id: string;
  completedAt: number;
  durationMs: number;
  taskId: string | null;
  taskTitle: string;
  subject: string;
}>;
export type StudyTask = Readonly<{
  id: string;
  title: string;
  subject: string;
  estimate: number;
  done: boolean;
}>;
export type TimerState = Readonly<{
  mode: TimerMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  deadline: number | null;
  sessionId: string | null;
  taskId: string | null;
  taskTitle: string;
  subject: string;
}>;
export type StudyState = Readonly<{
  version: 1;
  settings: StudySettings;
  timer: TimerState;
  completedFocus: number;
  sessions: readonly StudySession[];
  legacyHistory: Readonly<Record<string, number>>;
  tasks: readonly StudyTask[];
  selectedTaskId: string;
  environment: 'library' | 'forest' | 'cafe';
}>;

export function remainingTime(timer: TimerState, now: number): number {
  return timer.status === 'running' && timer.deadline !== null
    ? Math.max(0, timer.deadline - now)
    : timer.remainingMs;
}

export function nextModeAfterCompletion(mode: TimerMode, completedFocus: number): TimerMode {
  if (mode !== 'pomodoro') return 'pomodoro';
  return completedFocus % 4 === 0 ? 'long' : 'short';
}

export function sessionAlreadyRecorded(sessions: readonly StudySession[], id: string | null): boolean {
  return id !== null && sessions.some((session) => session.id === id);
}

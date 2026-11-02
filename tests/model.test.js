import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  startTimer,
  pauseTimer,
  resetTimer,
  completeIfDue,
  remainingTime,
  dayStats,
  localDateKey,
  normalizeState,
  normalizeSettings,
  migrateLegacy,
  readState,
  writeState,
  exportMarkdown,
  streak,
} from "../pomodoro-pwa/src/model.js";
const start = 1_800_000_000_000;
function finish(state, now, id) {
  const running = startTimer(state, now, id);
  return completeIfDue(running, running.timer.deadline, `${id}-next`).state;
}
test("long pause follows exactly four completed focus sessions, not three", () => {
  let state = createState();
  const pauses = [];
  for (let i = 0; i < 4; i++) {
    state = finish(state, start, `focus-${i}`);
    pauses.push(state.timer.mode);
    state = finish(state, start, `break-${i}`);
  }
  assert.deepEqual(pauses, ["short", "short", "short", "long"]);
  assert.equal(state.sessions.length, 4);
});
test("pause captures exact remaining time and resume uses a new deadline", () => {
  let state = startTimer(createState(), start, "one");
  state = pauseTimer(state, start + 12_345);
  assert.equal(state.timer.remainingMs, 1_487_655);
  state = startTimer(state, start + 100_000, "ignored");
  assert.equal(state.timer.deadline, start + 1_587_655);
  assert.equal(state.timer.sessionId, "one");
});
test("reload reconciles one overdue session exactly once at its original deadline", () => {
  const initial = startTimer(createState(), start, "once");
  const restored = normalizeState(JSON.parse(JSON.stringify(initial)));
  const result = completeIfDue(restored, start + 86_400_000, "next");
  assert.equal(result.state.sessions.length, 1);
  assert.equal(result.state.sessions[0].completedAt, initial.timer.deadline);
  assert.equal(
    completeIfDue(result.state, start + 86_400_000, "next").completed,
    false,
  );
});
test("changing settings cannot rewrite historical duration", () => {
  let state = finish(createState(), start, "25min");
  state.settings.pomodoro = 50;
  state = resetTimer(state, "pomodoro");
  state = finish(state, start + 2_000_000, "50min");
  assert.equal(dayStats(state, localDateKey(new Date(start))).minutes, 75);
  assert.deepEqual(
    state.sessions.map((s) => s.durationMs),
    [1_500_000, 3_000_000],
  );
});
test("reset cancels an auto-started interval and cannot create a phantom completion", () => {
  let state = createState();
  state.settings.autoAdvance = true;
  state = finish(state, start, "focus");
  assert.equal(state.timer.status, "running");
  state = resetTimer(state);
  assert.equal(
    completeIfDue(state, start + 99_000_000, "ignored").completed,
    false,
  );
  assert.equal(state.timer.status, "idle");
  assert.equal(state.sessions.length, 1);
});
test("an auto-advance after suspension starts now, without retroactive cycles", () => {
  let state = createState();
  state.settings.autoAdvance = true;
  state = startTimer(state, start, "one");
  state = completeIfDue(state, start + 86_400_000, "two").state;
  assert.equal(state.sessions.length, 1);
  assert.equal(state.timer.deadline, start + 86_400_000 + 300_000);
});
test("session snapshots keep task names after edits and deletions", () => {
  let state = createState();
  state.tasks = [
    { id: "task", title: "Arrays", subject: "JS", done: false, estimate: 2 },
  ];
  state.selectedTaskId = "task";
  state = startTimer(state, start, "session");
  state.tasks = [];
  state = completeIfDue(state, state.timer.deadline, "next").state;
  assert.equal(state.sessions[0].taskTitle, "Arrays");
  assert.equal(state.sessions[0].subject, "JS");
});
test("legacy counts are retained without fabricating minutes", () => {
  const state = migrateLegacy(
    { settings: { pomodoro: 45 }, soundOn: false },
    { "2026-10-30": 6 },
  );
  assert.deepEqual(dayStats(state, "2026-10-30"), {
    count: 6,
    minutes: 0,
    legacyCount: 6,
  });
  assert.equal(state.settings.sound, false);
  assert.match(exportMarkdown(state, start), /Duração desconhecida/);
});
test("legacy running interval is preserved during migration", () => {
  const state = migrateLegacy(
    {
      mode: "pomodoro",
      running: true,
      totalSecs: 1500,
      remaining: 1200,
      expectedEndTs: start + 2000,
    },
    {},
  );
  assert.equal(remainingTime(state.timer, start), 2000);
  assert.equal(finish(state, start, "new").sessions.length, 1);
});
test("malformed state cannot inject modes, durations or duplicate sessions", () => {
  const state = normalizeState({
    version: 1,
    settings: { pomodoro: -2, short: null },
    tasks: [null, {}],
    timer: { mode: "__proto__", status: "running" },
    sessions: [null, { id: "a", durationMs: -1, completedAt: start }],
  });
  assert.equal(state.settings.pomodoro, 25);
  assert.equal(state.timer.mode, "pomodoro");
  assert.equal(state.sessions.length, 0);
  assert.equal(state.tasks.length, 0);
  assert.equal(normalizeSettings({ goal: 100 }).goal, 4);
});
test("storage refusal and invalid JSON are visible errors, not application crashes", () => {
  const denied = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("quota");
    },
  };
  assert.ok(readState(denied).error);
  assert.ok(writeState(denied, createState()));
  assert.ok(readState({ getItem: () => "{broken" }).error);
});
test("streak allows an unfinished today and stops at a missed day", () => {
  const state = createState();
  const now = new Date(2026, 9, 30, 12).getTime();
  state.legacyHistory = { "2026-10-29": 2, "2026-10-28": 1, "2026-10-26": 5 };
  assert.equal(streak(state, now), 2);
});

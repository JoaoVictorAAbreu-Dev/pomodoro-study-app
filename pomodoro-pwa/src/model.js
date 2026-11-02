// Domain functions have no browser dependencies; time and IDs are supplied by callers.
export const STORAGE_KEY = "pomodoro_study_v1";
export const MODES = {
  pomodoro: "Foco",
  short: "Pausa curta",
  long: "Pausa longa",
};
export const DEFAULT_SETTINGS = Object.freeze({
  pomodoro: 25,
  short: 5,
  long: 15,
  goal: 4,
  sound: true,
  autoAdvance: false,
});
const validNumber = (value, min, max) =>
  Number.isFinite(value) && value >= min && value <= max;
const cleanText = (value, max = 120) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function normalizeSettings(value = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [key, min, max] of [
    ["pomodoro", 5, 60],
    ["short", 1, 15],
    ["long", 5, 60],
    ["goal", 1, 12],
  ]) {
    if (validNumber(value[key], min, max))
      settings[key] = Math.round(value[key]);
  }
  for (const key of ["sound", "autoAdvance"])
    if (typeof value[key] === "boolean") settings[key] = value[key];
  return settings;
}
export function createTimer(settings, mode = "pomodoro") {
  const durationMs = settings[mode] * 60_000;
  return {
    mode,
    status: "idle",
    durationMs,
    remainingMs: durationMs,
    deadline: null,
    sessionId: null,
    taskId: null,
    taskTitle: "",
    subject: "",
  };
}
export function createState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    timer: createTimer(DEFAULT_SETTINGS),
    completedFocus: 0,
    sessions: [],
    legacyHistory: {},
    tasks: [],
    selectedTaskId: "",
    environment: "library",
  };
}
export function remainingTime(timer, now) {
  return timer.status === "running"
    ? Math.max(0, timer.deadline - now)
    : timer.remainingMs;
}
export function startTimer(state, now, id) {
  if (state.timer.status === "running") return state;
  const task = state.tasks.find(
    (task) => task.id === state.selectedTaskId && !task.done,
  );
  const isNew = !state.timer.sessionId;
  return {
    ...state,
    timer: {
      ...state.timer,
      status: "running",
      deadline: now + state.timer.remainingMs,
      sessionId: state.timer.sessionId || id,
      ...(isNew
        ? {
            taskId: task?.id || null,
            taskTitle: task?.title || "",
            subject: task?.subject || "",
          }
        : {}),
    },
  };
}
export function pauseTimer(state, now) {
  if (state.timer.status !== "running") return state;
  return {
    ...state,
    timer: {
      ...state.timer,
      remainingMs: remainingTime(state.timer, now),
      deadline: null,
      status: "paused",
    },
  };
}
export function resetTimer(state, mode = state.timer.mode) {
  return { ...state, timer: createTimer(state.settings, mode) };
}
// Only the finished interval is recorded. A suspended browser never invents additional sessions.
export function completeIfDue(state, now, nextId) {
  const timer = state.timer;
  if (timer.status !== "running" || remainingTime(timer, now) > 0)
    return { state, completed: false };
  const isFocus = timer.mode === "pomodoro";
  const duplicate = state.sessions.some(
    (session) => session.id === timer.sessionId,
  );
  const completedFocus = state.completedFocus + (isFocus && !duplicate ? 1 : 0);
  const nextMode = isFocus
    ? completedFocus % 4 === 0
      ? "long"
      : "short"
    : "pomodoro";
  const session = {
    id: timer.sessionId,
    completedAt: timer.deadline,
    durationMs: timer.durationMs,
    taskId: timer.taskId,
    taskTitle: timer.taskTitle,
    subject: timer.subject,
  };
  let next = {
    ...state,
    completedFocus,
    sessions:
      isFocus && !duplicate ? [...state.sessions, session] : state.sessions,
    timer: createTimer(state.settings, nextMode),
  };
  if (state.settings.autoAdvance) next = startTimer(next, now, nextId);
  return { state: next, completed: true, isFocus };
}
export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dayStats(state, dateKey) {
  const sessions = state.sessions.filter(
    (session) => localDateKey(new Date(session.completedAt)) === dateKey,
  );
  const legacyCount = state.legacyHistory[dateKey] || 0;
  return {
    count: sessions.length + legacyCount,
    minutes: sessions.reduce(
      (sum, session) => sum + session.durationMs / 60_000,
      0,
    ),
    legacyCount,
  };
}
export function recentDays(state, now, count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - count + index + 1);
    const key = localDateKey(date);
    return { date, key, ...dayStats(state, key) };
  });
}
export function streak(state, now) {
  let length = 0;
  const date = new Date(now);
  if (!dayStats(state, localDateKey(date)).count)
    date.setDate(date.getDate() - 1);
  while (dayStats(state, localDateKey(date)).count) {
    length++;
    date.setDate(date.getDate() - 1);
  }
  return length;
}
function normalizeHistory(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, count]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(key) &&
        Number.isInteger(count) &&
        count > 0 &&
        count < 100_000,
    ),
  );
}
export function normalizeState(value) {
  const state = createState();
  if (!value || value.version !== 1) return state;
  state.settings = normalizeSettings(value.settings || {});
  state.timer = createTimer(state.settings);
  state.completedFocus =
    Number.isSafeInteger(value.completedFocus) && value.completedFocus >= 0
      ? value.completedFocus
      : 0;
  state.environment = ["library", "forest", "cafe"].includes(value.environment)
    ? value.environment
    : "library";
  state.legacyHistory = normalizeHistory(value.legacyHistory);
  const ids = new Set();
  state.sessions = (Array.isArray(value.sessions) ? value.sessions : [])
    .filter((s) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        !s.id ||
        ids.has(s.id) ||
        !validNumber(s.completedAt, 1, 8.64e15) ||
        !validNumber(s.durationMs, 60_000, 3_600_000)
      )
        return false;
      ids.add(s.id);
      return true;
    })
    .map((s) => ({
      id: s.id.slice(0, 100),
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      taskId: cleanText(s.taskId, 100),
      taskTitle: cleanText(s.taskTitle),
      subject: cleanText(s.subject, 40),
    }));
  const taskIds = new Set();
  state.tasks = (Array.isArray(value.tasks) ? value.tasks : [])
    .filter((t) => {
      if (
        !t ||
        !cleanText(t.id, 100) ||
        !cleanText(t.title) ||
        taskIds.has(t.id)
      )
        return false;
      taskIds.add(t.id);
      return true;
    })
    .map((t) => ({
      id: cleanText(t.id, 100),
      title: cleanText(t.title),
      subject: cleanText(t.subject, 40),
      estimate: validNumber(t.estimate, 1, 12) ? Math.round(t.estimate) : 1,
      done: t.done === true,
    }));
  state.selectedTaskId = state.tasks.some(
    (t) => t.id === value.selectedTaskId && !t.done,
  )
    ? value.selectedTaskId
    : "";
  const timer = value.timer;
  if (
    timer &&
    Object.hasOwn(MODES, timer.mode) &&
    ["idle", "running", "paused"].includes(timer.status) &&
    validNumber(timer.durationMs, 60_000, 3_600_000) &&
    validNumber(timer.remainingMs, 0, timer.durationMs) &&
    (timer.status !== "running" ||
      (validNumber(timer.deadline, 1, 8.64e15) && cleanText(timer.sessionId)))
  ) {
    state.timer = {
      mode: timer.mode,
      status: timer.status,
      durationMs: timer.durationMs,
      remainingMs: timer.remainingMs,
      deadline: timer.status === "running" ? timer.deadline : null,
      sessionId: cleanText(timer.sessionId, 100) || null,
      taskId: cleanText(timer.taskId, 100),
      taskTitle: cleanText(timer.taskTitle),
      subject: cleanText(timer.subject, 40),
    };
  }
  return state;
}
export function migrateLegacy(legacy, history) {
  const state = createState();
  state.settings = normalizeSettings({
    ...(legacy?.settings || {}),
    sound: legacy?.soundOn,
    autoAdvance: legacy?.autoAdvance,
  });
  state.legacyHistory = normalizeHistory(history);
  state.completedFocus = Object.values(state.legacyHistory).reduce(
    (sum, count) => sum + count,
    0,
  );
  state.timer = createTimer(
    state.settings,
    Object.hasOwn(MODES, legacy?.mode) ? legacy.mode : "pomodoro",
  );
  if (
    validNumber(legacy?.totalSecs, 60, 3600) &&
    validNumber(legacy?.remaining, 0, legacy.totalSecs)
  ) {
    state.timer.durationMs = legacy.totalSecs * 1000;
    state.timer.remainingMs = legacy.remaining * 1000;
    state.timer.status =
      legacy.remaining < legacy.totalSecs ? "paused" : "idle";
    if (legacy.running && validNumber(legacy.expectedEndTs, 1, 8.64e15)) {
      Object.assign(state.timer, {
        status: "running",
        deadline: legacy.expectedEndTs,
        sessionId: `legacy-${legacy.expectedEndTs}`,
      });
    }
  }
  return state;
}
export function readState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return { state: normalizeState(JSON.parse(raw)), error: null };
    return {
      state: migrateLegacy(
        JSON.parse(storage.getItem("pomodoro_v4") || "null"),
        JSON.parse(storage.getItem("pomodoro_hist_v1") || "null"),
      ),
      error: null,
    };
  } catch {
    return {
      state: createState(),
      error:
        "Não foi possível ler os dados salvos. Exporte seu progresso antes de fechar esta aba.",
    };
  }
}
export function writeState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "O navegador não conseguiu salvar. Seus dados continuam nesta aba; exporte uma cópia antes de sair.";
  }
}
export function exportMarkdown(state, now) {
  const lines = [
    "# Meu progresso · Pomodoro Study",
    "",
    `Exportado em ${new Date(now).toLocaleString("pt-BR")}`,
    "",
    "## Sessões concluídas",
    "",
  ];
  for (const s of [...state.sessions].reverse())
    lines.push(
      `- ${new Date(s.completedAt).toLocaleString("pt-BR")} · ${s.durationMs / 60_000} min · ${s.taskTitle || "Foco livre"}${s.subject ? ` (${s.subject})` : ""}`,
    );
  if (!state.sessions.length)
    lines.push("Nenhuma sessão registrada nesta versão.");
  if (Object.keys(state.legacyHistory).length) {
    lines.push(
      "",
      "## Histórico importado",
      "",
      "A versão anterior guardava apenas a quantidade de sessões. Duração desconhecida.",
    );
    for (const [date, count] of Object.entries(state.legacyHistory).sort())
      lines.push(`- ${date}: ${count} sessões`);
  }
  lines.push("", "## Plano de estudos", "");
  for (const t of state.tasks)
    lines.push(
      `- [${t.done ? "x" : " "}] ${t.title} · ${t.subject || "Geral"} · ${t.estimate} ciclos planejados`,
    );
  return lines.join("\n");
}

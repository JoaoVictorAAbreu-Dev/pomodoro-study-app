import {
  STORAGE_KEY,
  MODES,
  createTimer,
  remainingTime,
  startTimer,
  pauseTimer,
  resetTimer,
  completeIfDue,
  normalizeSettings,
  readState,
  writeState,
  localDateKey,
  dayStats,
  recentDays,
  streak,
  exportMarkdown,
} from "./model.js";
import { remainingTime as getRemainingTime } from "./domain/model.ts";
import { resolveRoute, getPageTitle } from "./pages/routes.ts";
import {
  ENVIRONMENTS,
  searchStations,
  localWeather,
  prepareAlarm,
  playAlarm,
} from "./services.js";

const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);
const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
};
const id = () => crypto.randomUUID();
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const loaded = readState(storage);
let state = loaded.state;
let persistenceAvailable = !loaded.error;
let currentDay = localDateKey(new Date());
let toastTimeout;
let tickPending = false;
const radio = new Audio();
radio.preload = "none";
radio.volume = 0.5;
let playbackRequest = 0;
let searchRequest;

function toast(message) {
  clearTimeout(toastTimeout);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimeout = setTimeout(() => {
    $("toast").hidden = true;
  }, 5000);
}
function warn(message) {
  if (!message) return;
  $("storage-warning").textContent = message;
  $("storage-warning").hidden = false;
}
warn(loaded.error);
// Web Locks serializes read/modify/write across tabs, including completion of a timer.
async function update(change) {
  const commit = () => {
    if (persistenceAvailable) {
      const current = readState(storage);
      if (!current.error) state = current.state;
    }
    const next = change(state);
    if (next !== state) {
      state = next;
      const error = writeState(storage, state);
      if (error) {
        persistenceAvailable = false;
        warn(error);
      }
      renderData();
    }
    renderTimer();
  };
  if (navigator.locks)
    await navigator.locks.request("pomodoro-study-state", commit);
  else commit();
}
function complete(now) {
  return update((current) => {
    const result = completeIfDue(current, now, id());
    if (result.completed) {
      if (current.settings.sound) playAlarm();
      const message = result.isFocus
        ? "Ciclo concluído. Você merece uma pausa."
        : "Pausa concluída. Pronto para o próximo passo?";
      toast(message);
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        try {
          new Notification("Pomodoro Study", {
            body: message,
            icon: "./icons/icon-192.png",
            tag: "pomodoro-session",
          });
        } catch {
          /* Some mobile browsers only accept service worker notifications. */
        }
      }
    }
    return result.state;
  });
}
async function toggleTimer() {
  prepareAlarm();
  await complete(Date.now());
  await update((current) =>
    current.timer.status === "running"
      ? pauseTimer(current, Date.now())
      : startTimer(current, Date.now(), id()),
  );
}
function confirmAction(title, message) {
  const dialog = $("confirm-dialog");
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}
async function switchSession(mode, action = "Trocar de sessão?") {
  const elapsed =
    state.timer.durationMs - getRemainingTime(state.timer, Date.now());
  if (
    elapsed > 0 &&
    !(await confirmAction(
      action,
      "O tempo deste ciclo será descartado. As sessões já concluídas continuam no seu histórico.",
    ))
  )
    return;
  await update((current) => resetTimer(current, mode));
}
function renderTimer() {
  const { timer } = state;
  const seconds = Math.ceil(getRemainingTime(timer, Date.now()) / 1000);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("timer-display").textContent = time;
  document.title =
    timer.status === "running"
      ? `${time} · ${MODES[timer.mode]} · Pomodoro Study`
      : "Pomodoro Study · Seu tempo, com intenção";
  $("toggle-timer").querySelector("span").textContent =
    timer.status === "running"
      ? "Pausar"
      : timer.status === "paused"
        ? "Continuar"
        : timer.mode === "pomodoro"
          ? "Começar foco"
          : "Começar pausa";
  $("toggle-timer").querySelector("svg").hidden = timer.status === "running";
  $("timer-kicker").textContent =
    timer.status === "paused"
      ? "NO SEU TEMPO"
      : timer.mode === "pomodoro"
        ? "HORA DE SE CONCENTRAR"
        : "HORA DE RESPIRAR";
  $("timer-description").textContent =
    timer.status === "paused"
      ? "Tudo bem pausar. Volte quando estiver pronto."
      : timer.mode === "pomodoro"
        ? "Respire fundo. Seu próximo passo começa aqui."
        : "Levante, alongue, olhe pela janela. Este tempo é seu.";
  $("timer-progress-fill").style.width =
    `${Math.min(100, Math.max(0, (1 - getRemainingTime(timer, Date.now()) / timer.durationMs) * 100))}%`;
  $$("[data-mode]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === timer.mode),
    ),
  );
}
function renderTaskSelect() {
  const select = $("active-task");
  select.replaceChildren(new Option("Foco livre", ""));
  for (const task of state.tasks.filter((task) => !task.done))
    select.add(new Option(task.title, task.id));
  select.value = state.selectedTaskId;
  select.disabled = state.timer.status !== "idle";
  $("task-session-note").textContent =
    state.timer.status === "idle"
      ? "Escolha uma tarefa ou apenas comece."
      : `Esta sessão: ${state.timer.taskTitle || "Foco livre"}. Você pode trocar na próxima.`;
}
function renderGoal() {
  const today = dayStats(state, localDateKey(new Date()));
  $("today-count").textContent = today.count;
  $("daily-goal").textContent = state.settings.goal;
  $("today-minutes").textContent = `${today.minutes} min`;
  $("goal-fill").style.width =
    `${Math.min(100, (today.count / state.settings.goal) * 100)}%`;
  $("goal-message").textContent =
    today.count >= state.settings.goal
      ? "Meta alcançada. Celebre o caminho de hoje."
      : today.count
        ? "Você está construindo seu ritmo. Continue com calma."
        : "O primeiro passo já faz diferença.";
  $("cycle-label").textContent =
    state.timer.mode !== "pomodoro" &&
    state.completedFocus % 4 === 0 &&
    state.completedFocus > 0
      ? "4 ciclos. Uma pausa merecida."
      : `Ciclo ${(state.completedFocus % 4) + 1} de 4`;
  const completed =
    state.timer.mode !== "pomodoro" &&
    state.completedFocus % 4 === 0 &&
    state.completedFocus > 0
      ? 4
      : state.completedFocus % 4;
  $("cycle-dots").replaceChildren(
    ...Array.from({ length: 4 }, (_, i) =>
      make("span", i < completed ? "filled" : ""),
    ),
  );
  $("cycle-dots").setAttribute(
    "aria-label",
    `${completed} de 4 ciclos concluídos`,
  );
}
function taskButton(text, label, className, action) {
  const button = make("button", className, text);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.addEventListener("click", action);
  return button;
}
function renderTask(task) {
  const row = make("article", `task-item${task.done ? " is-done" : ""}`);
  const checkbox = make("input", "task-check");
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.setAttribute(
    "aria-label",
    `${task.done ? "Reabrir" : "Concluir"} ${task.title}`,
  );
  checkbox.addEventListener("change", () =>
    update((current) => ({
      ...current,
      selectedTaskId:
        checkbox.checked && current.selectedTaskId === task.id
          ? ""
          : current.selectedTaskId,
      tasks: current.tasks.map((t) =>
        t.id === task.id ? { ...t, done: checkbox.checked } : t,
      ),
    })),
  );
  const body = make("div", "task-body");
  body.append(make("h3", "", task.title));
  const meta = make("div", "task-meta");
  if (task.subject) meta.append(make("span", "task-subject", task.subject));
  const cycles = state.sessions.filter((s) => s.taskId === task.id).length;
  meta.append(make("span", "", `${cycles} / ${task.estimate} ciclos`));
  body.append(meta);
  const actions = make("div", "task-actions");
  if (!task.done)
    actions.append(
      taskButton("Focar", `Focar em ${task.title}`, "task-focus", async () => {
        if (state.timer.status !== "idle") {
          toast("Conclua ou reinicie a sessão atual para trocar de tarefa.");
          location.hash = "foco";
          return;
        }
        await update((current) => ({ ...current, selectedTaskId: task.id }));
        location.hash = "foco";
        $("toggle-timer").focus();
      }),
    );
  actions.append(
    taskButton("✎", `Editar ${task.title}`, "icon-button", () =>
      openTask(task),
    ),
  );
  actions.append(
    taskButton("×", `Excluir ${task.title}`, "icon-button", async () => {
      if (
        !(await confirmAction(
          "Excluir esta tarefa?",
          `“${task.title}” sairá do plano. As sessões concluídas serão preservadas.`,
        ))
      )
        return;
      await update((current) => ({
        ...current,
        tasks: current.tasks.filter((t) => t.id !== task.id),
        selectedTaskId:
          current.selectedTaskId === task.id ? "" : current.selectedTaskId,
      }));
    }),
  );
  row.append(checkbox, body, actions);
  return row;
}
function renderPlan() {
  const pending = state.tasks.filter((t) => !t.done),
    done = state.tasks.filter((t) => t.done);
  $("pending-count").textContent =
    `${pending.length} ${pending.length === 1 ? "tarefa" : "tarefas"}`;
  $("task-count").textContent =
    `${pending.length} ${pending.length === 1 ? "tarefa" : "tarefas"}`;
  $("completed-count").textContent = done.length;
  $("task-list").replaceChildren(...pending.map(renderTask));
  if (!pending.length) {
    const empty = make("div", "empty-state");
    empty.append(
      icon("plan"),
      make(
        "h3",
        "",
        done.length
          ? "Um respiro. Você concluiu seu plano."
          : "Toda descoberta começa com um passo.",
      ),
      make(
        "p",
        "",
        "Adicione uma pequena tarefa para a sua próxima sessão de estudo.",
      ),
      taskButton(
        "+ Criar minha primeira tarefa",
        "Criar tarefa",
        "secondary-button",
        () => openTask(),
      ),
    );
    $("task-list").append(empty);
  }
  $("completed-list").replaceChildren(...done.map(renderTask));
}
const durationLabel = (minutes) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`;
function renderProgress() {
  $("total-minutes").textContent = durationLabel(
    state.sessions.reduce((sum, s) => sum + s.durationMs / 60_000, 0),
  );
  $("total-count").textContent =
    state.sessions.length +
    Object.values(state.legacyHistory).reduce((sum, count) => sum + count, 0);
  const daysInRow = streak(state, Date.now());
  $("streak-count").textContent =
    `${daysInRow} ${daysInRow === 1 ? "dia" : "dias"}`;
  const days = recentDays(state, Date.now(), Number($("chart-period").value));
  const max = Math.max(1, ...days.map((day) => day.count));
  const chart = $("chart");
  chart.dataset.days = days.length;
  chart.replaceChildren();
  $("chart-table").replaceChildren();
  const dateFormat = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  for (const day of days) {
    const column = make("div", "chart-column");
    const bar = make("div", "chart-bar");
    bar.style.height = `${(day.count / max) * 125 || 3}px`;
    const label =
      days.length === 7
        ? day.date
            .toLocaleDateString("pt-BR", { weekday: "short" })
            .replace(".", "")
        : day.date.getDate();
    column.append(
      make("span", "chart-value", day.count),
      bar,
      make("span", "chart-day", label),
    );
    chart.append(column);
    const row = make("tr");
    row.append(
      make("td", "", dateFormat.format(day.date)),
      make("td", "", day.count),
      make(
        "td",
        "",
        `${day.minutes}${day.legacyCount ? " + duração antiga desconhecida" : ""}`,
      ),
    );
    $("chart-table").append(row);
  }
  const count = days.reduce((sum, d) => sum + d.count, 0);
  chart.setAttribute(
    "aria-label",
    `${count} sessões nos últimos ${days.length} dias. Detalhes na tabela abaixo.`,
  );
  $("chart-insight").textContent = count
    ? `${count} ${count === 1 ? "ciclo concluído" : "ciclos concluídos"} neste período. Cada um deles conta.`
    : "Seu primeiro ciclo será o começo desta história.";
  const history = $("session-history");
  history.replaceChildren();
  for (const session of [...state.sessions]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 6)) {
    const row = make("div", "session-row"),
      info = make("div");
    info.append(
      make("h3", "", session.taskTitle || "Foco livre"),
      make(
        "p",
        "",
        `${new Date(session.completedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${session.subject ? ` · ${session.subject}` : ""}`,
      ),
    );
    row.append(
      icon("check"),
      info,
      make("strong", "", `${session.durationMs / 60_000} min`),
    );
    history.append(row);
  }
  if (!state.sessions.length)
    history.append(
      make(
        "p",
        "history-empty",
        "Seus ciclos concluídos vão aparecer aqui. Que tal começar o primeiro?",
      ),
    );
  const legacyCount = Object.values(state.legacyHistory).reduce(
    (sum, count) => sum + count,
    0,
  );
  $("legacy-note").hidden = !legacyCount;
  $("legacy-note").textContent =
    `${legacyCount} sessões da versão anterior foram preservadas. Como ela não guardava a duração, essas sessões entram na contagem, mas não nos minutos.`;
}
function renderEnvironments() {
  const current = ENVIRONMENTS.find((item) => item.id === state.environment);
  $("hero-photo").src = `./assets/photos/${current.id}.jpg`;
  $("hero-photo").alt = current.alt;
  $("hero-environment").textContent = current.caption;
  $("environments").replaceChildren(
    ...ENVIRONMENTS.map((environment) => {
      const selected = environment.id === state.environment;
      const card = make(
          "article",
          `environment-card${selected ? " selected" : ""}`,
        ),
        photo = make("div", "environment-photo"),
        img = make("img");
      img.src = `./assets/photos/${environment.id}.jpg`;
      img.alt = environment.alt;
      img.loading = "lazy";
      photo.append(img, make("span", "environment-tag", environment.tag));
      const content = make("div", "environment-content");
      const button = taskButton(
        selected ? "✓ Ambiente escolhido" : "Escolher ambiente",
        `Escolher ${environment.title}`,
        "secondary-button",
        () =>
          update((current) => ({ ...current, environment: environment.id })),
      );
      button.setAttribute("aria-pressed", String(selected));
      content.append(
        make("h2", "", environment.title),
        make("p", "", environment.description),
        button,
      );
      card.append(photo, content);
      return card;
    }),
  );
}
function renderData() {
  renderTaskSelect();
  renderGoal();
  renderPlan();
  renderProgress();
  renderEnvironments();
}
function route({ focus = false } = {}) {
  const page = resolveRoute(location.hash);
  $$(".page").forEach((section) => {
    section.hidden = section.id !== `page-${page}`;
  });
  $$("[data-page]").forEach((link) => {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  $("breadcrumb-page").textContent = getPageTitle(page);
  if (page !== "foco") document.body.classList.remove("focus-mode");
  if (focus) {
    $("main").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
function openTask(task) {
  const form = $("task-form");
  form.reset();
  form.elements.id.value = task?.id || "";
  form.elements.title.value = task?.title || "";
  form.elements.subject.value = task?.subject || "";
  form.elements.estimate.value = task?.estimate || 1;
  $("task-dialog-title").textContent = task
    ? "Ajuste o próximo passo."
    : "O que quer aprender?";
  $("task-dialog").showModal();
  form.elements.title.focus();
}
function exportProgress() {
  const url = URL.createObjectURL(
    new Blob([exportMarkdown(state, Date.now())], {
      type: "text/markdown;charset=utf-8",
    }),
  );
  const link = make("a");
  link.href = url;
  link.download = `pomodoro-study-${localDateKey(new Date())}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Progresso exportado. Seu arquivo está nos downloads.");
}
$("toggle-timer").addEventListener("click", toggleTimer);
$("reset-timer").addEventListener("click", () =>
  switchSession(state.timer.mode, "Recomeçar esta sessão?"),
);
$("skip-timer").addEventListener("click", () =>
  switchSession(
    state.timer.mode === "pomodoro" ? "short" : "pomodoro",
    "Pular esta sessão?",
  ),
);
$$("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    if (state.timer.mode !== button.dataset.mode)
      void switchSession(button.dataset.mode);
  }),
);
$("active-task").addEventListener("change", (event) =>
  update((current) => ({ ...current, selectedTaskId: event.target.value })),
);
$("focus-view").addEventListener("click", () => {
  const active = document.body.classList.toggle("focus-mode");
  $("focus-view").querySelector("span").textContent = active
    ? "Sair da concentração"
    : "Modo concentração";
  $("focus-view").setAttribute("aria-pressed", String(active));
  $("focus-view").setAttribute(
    "aria-label",
    active ? "Sair da concentração" : "Modo concentração",
  );
});
$("add-task").addEventListener("click", () => openTask());
$("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  if (!title) {
    form.elements.title.setCustomValidity("Escreva uma tarefa para começar.");
    form.elements.title.reportValidity();
    return;
  }
  const task = {
    id: form.elements.id.value || id(),
    title,
    subject: form.elements.subject.value.trim(),
    estimate: Number(form.elements.estimate.value),
    done: false,
  };
  await update((current) => ({
    ...current,
    tasks: current.tasks.some((t) => t.id === task.id)
      ? current.tasks.map((t) =>
          t.id === task.id ? { ...task, done: t.done } : t,
        )
      : [...current.tasks, task],
  }));
  $("task-dialog").close();
  toast("Próximo passo salvo.");
});
$("task-form").elements.title.addEventListener("input", (event) =>
  event.target.setCustomValidity(""),
);
$$("[data-open-settings]").forEach((button) =>
  button.addEventListener("click", () => {
    const form = $("settings-form");
    for (const [key, value] of Object.entries(state.settings)) {
      const input = form.elements[key];
      if (typeof value === "boolean") input.checked = value;
      else input.value = value;
    }
    $("settings-dialog").showModal();
  }),
);
$$("[data-close-dialog]").forEach((button) =>
  button.addEventListener("click", () => button.closest("dialog").close()),
);
$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const settings = normalizeSettings(
    Object.fromEntries(
      Object.keys(state.settings).map((key) => [
        key,
        form.elements[key].type === "checkbox"
          ? form.elements[key].checked
          : Number(form.elements[key].value),
      ]),
    ),
  );
  await update((current) => ({
    ...current,
    settings,
    timer:
      current.timer.status === "idle"
        ? createTimer(settings, current.timer.mode)
        : current.timer,
  }));
  $("settings-dialog").close();
  toast("Preferências salvas. Seu ritmo, do seu jeito.");
});
$("enable-notifications").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    toast("Este navegador não oferece notificações.");
    return;
  }
  const permission = await Notification.requestPermission();
  toast(
    permission === "granted"
      ? "Notificações ativadas enquanto o app estiver aberto."
      : "Notificações não ativadas. O aviso na tela continua disponível.",
  );
});
$("chart-period").addEventListener("change", renderProgress);
$("export-progress").addEventListener("click", exportProgress);
$("export-notion").addEventListener("click", exportProgress);
$("weather-button").addEventListener("click", async () => {
  const button = $("weather-button");
  button.disabled = true;
  button.querySelector("span").textContent = "Localizando…";
  try {
    button.querySelector("span").textContent = await localWeather();
    button.title = "Previsão atual por Open-Meteo";
  } catch (error) {
    button.querySelector("span").textContent = "Ver clima";
    toast(
      error.code === 1
        ? "Localização não autorizada. Você pode continuar estudando normalmente."
        : "Não foi possível obter o clima. Tente novamente mais tarde.",
    );
  } finally {
    button.disabled = false;
  }
});
function stopRadio() {
  playbackRequest++;
  radio.pause();
  radio.removeAttribute("src");
  radio.load();
  $("player").hidden = true;
  $("radio-status").textContent =
    "Som pausado. Um pouco de silêncio também faz bem.";
}
async function playStation(station) {
  const request = ++playbackRequest;
  radio.pause();
  radio.src = station.url;
  $("player").hidden = false;
  $("playing-name").textContent = `Conectando a ${station.name}…`;
  $("radio-status").textContent = "Conectando à estação…";
  try {
    await radio.play();
    if (request !== playbackRequest) return;
    $("playing-name").textContent = station.name;
    $("radio-status").textContent = `Tocando: ${station.name}`;
  } catch {
    if (request !== playbackRequest) return;
    stopRadio();
    $("radio-status").textContent =
      "Esta estação não pôde tocar. Escolha outra ou tente novamente.";
  }
}
radio.addEventListener("error", () => {
  if (radio.hasAttribute("src")) {
    stopRadio();
    $("radio-status").textContent =
      "O áudio foi interrompido. Tente outra estação.";
  }
});
$("radio-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("radio-query").value.trim();
  if (!query) return;
  searchRequest?.abort();
  searchRequest = new AbortController();
  const controller = searchRequest;
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  button.textContent = "Buscando…";
  $("radio-status").textContent = "Procurando uma trilha para o seu foco…";
  $("radio-results").replaceChildren(...Array.from({ length: 4 }, () => {
    const skeleton = make("div", "radio-skeleton");
    skeleton.setAttribute("aria-hidden", "true"); return skeleton;
  }));
  try {
    const stations = await searchStations(
      query,
      AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    );
    if (controller.signal.aborted) return;
    $("radio-results").replaceChildren(
      ...stations.map((station) => {
        const button = make("button", "station-button");
        button.append(
          make("strong", "", station.name),
          make("span", "", "▶ Ouvir"),
        );
        button.addEventListener("click", () => playStation(station));
        return button;
      }),
    );
    $("radio-status").textContent = stations.length
      ? `${stations.length} estações encontradas. Escolha uma para ouvir.`
      : "Nenhuma estação disponível. Tente outro nome ou estilo.";
  } catch {
    if (!controller.signal.aborted) $("radio-results").replaceChildren();
    if (!controller.signal.aborted)
      $("radio-status").textContent =
        "Não foi possível buscar rádios agora. Verifique sua conexão e tente novamente.";
  } finally {
    if (searchRequest === controller) {
      button.disabled = false;
      button.textContent = "Buscar rádios";
    }
  }
});
$("stop-radio").addEventListener("click", stopRadio);
$("volume").addEventListener("input", (event) => {
  radio.volume = Number(event.target.value);
});
window.addEventListener("hashchange", () => route({ focus: true }));
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && persistenceAvailable) {
    state = readState(storage).state;
    renderData();
    renderTimer();
  }
});
window.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.repeat ||
    document.querySelector("dialog[open]") ||
    event.target.closest("input,textarea,select,button,a,[contenteditable]")
  )
    return;
  if (!$("page-foco").hidden && event.code === "Space") {
    event.preventDefault();
    void toggleTimer();
  }
  if (!$("page-foco").hidden && event.key.toLowerCase() === "r")
    void switchSession(state.timer.mode, "Recomeçar esta sessão?");
  if (event.key === "Escape" && document.body.classList.contains("focus-mode"))
    $("focus-view").click();
});
function tick() {
  renderTimer();
  if (
    state.timer.status === "running" &&
    getRemainingTime(state.timer, Date.now()) === 0 &&
    !tickPending
  ) {
    tickPending = true;
    void complete(Date.now()).finally(() => {
      tickPending = false;
    });
  }
  const day = localDateKey(new Date());
  if (day !== currentDay) {
    currentDay = day;
    renderGoal();
    renderProgress();
  }
}
document.addEventListener("visibilitychange", tick);
$("today-label").textContent = new Date()
  .toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  .toUpperCase();
let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("install-button").hidden = false;
});
$("install-button").addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("install-button").hidden = true;
});
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js")
      .catch(() =>
        toast("O modo offline não pôde ser preparado neste navegador."),
      );
  });
route();
renderData();
renderTimer();
tick();
setInterval(tick, 250);

document.querySelector(".skip-link").addEventListener("click", event => { event.preventDefault(); $("main").focus(); });

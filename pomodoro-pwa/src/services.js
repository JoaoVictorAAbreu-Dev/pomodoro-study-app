const RADIO_ENDPOINT =
  "https://de1.api.radio-browser.info/json/stations/search";
export const ENVIRONMENTS = [
  {
    id: "library",
    title: "Biblioteca",
    tag: "UM CAPÍTULO DE CADA VEZ",
    description: "Entre livros e ideias, um convite para ir mais fundo.",
    caption: "Biblioteca · para mergulhar nas ideias",
    alt: "Biblioteca iluminada, com estantes de livros e mesas de estudo",
  },
  {
    id: "forest",
    title: "Floresta",
    tag: "RESPIRE E RECOMECE",
    description: "Verde, silêncio e espaço para deixar a mente respirar.",
    caption: "Floresta · para respirar e recomeçar",
    alt: "Floresta de coníferas envolta em névoa",
  },
  {
    id: "cafe",
    title: "Café da tarde",
    tag: "IDEIAS À LUZ DA JANELA",
    description: "Um cantinho acolhedor para fazer as ideias acontecerem.",
    caption: "Café da tarde · ideias à luz da janela",
    alt: "Mesas de um café ensolarado ao lado de uma janela",
  },
];
export function safeStreamUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export async function searchStations(query, signal) {
  const url = new URL(RADIO_ENDPOINT);
  url.search = new URLSearchParams({
    name: query.trim(),
    limit: "12",
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    is_https: "true",
  });
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error("O catálogo não respondeu. Tente novamente em instantes.");
  const stations = await response.json();
  if (!Array.isArray(stations))
    throw new Error("O catálogo retornou uma resposta inesperada.");
  return stations
    .flatMap((station) => {
      const streamUrl = safeStreamUrl(station?.url_resolved || station?.url);
      return streamUrl && typeof station.name === "string"
        ? [{ name: station.name.slice(0, 100), url: streamUrl }]
        : [];
    })
    .slice(0, 6);
}
export async function localWeather() {
  if (!navigator.geolocation)
    throw new Error("Este navegador não oferece localização.");
  const position = await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10_000,
      maximumAge: 300_000,
    }),
  );
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: position.coords.latitude.toFixed(2),
    longitude: position.coords.longitude.toFixed(2),
    current: "temperature_2m,weather_code",
    timezone: "auto",
  });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    credentials: "omit",
  });
  if (!response.ok) throw new Error("O serviço de clima está indisponível.");
  const { current } = await response.json();
  if (!Number.isFinite(current?.temperature_2m))
    throw new Error("Não foi possível obter a temperatura.");
  return `${Math.round(current.temperature_2m)}°C · aqui por perto`;
}
let audioContext;
export function prepareAlarm() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioContext ||= new AudioContext();
      void audioContext.resume().catch(() => {});
    }
  } catch {
    /* An unavailable audio device must not block the timer. */
  }
}
export function playAlarm() {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  volume.gain.setValueAtTime(0, audioContext.currentTime);
  volume.gain.linearRampToValueAtTime(0.13, audioContext.currentTime + 0.03);
  volume.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.8,
  );
  oscillator.connect(volume);
  volume.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.85);
  oscillator.onended = () => {
    oscillator.disconnect();
    volume.disconnect();
  };
}

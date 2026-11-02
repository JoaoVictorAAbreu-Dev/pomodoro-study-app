// Accept only known YouTube URLs; never embed a user-provided URL directly.
export function parseYouTubeLink(input) {
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let video;
  if (host === 'youtu.be' && parts.length === 1) video = parts[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') video = url.searchParams.get('v');
    else if (['shorts', 'live', 'embed'].includes(parts[0]) && parts.length === 2) video = parts[1];
    else if (url.pathname !== '/playlist') return null;
  } else return null;
  const list = url.searchParams.get('list');
  if (video && !/^[\w-]{11}$/.test(video)) return null;
  if (list && !/^[\w-]{10,100}$/.test(list)) return null;
  if (!video && !list) return null;
  const embed = new URL(`https://www.youtube.com/embed/${video || 'videoseries'}`);
  embed.searchParams.set('playsinline', '1');
  if (list) { embed.searchParams.set('list', list); embed.searchParams.set('listType', 'playlist'); }
  return embed.href;
}
export async function searchYouTube(query, key, { fetcher = fetch, signal } = {}) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({ part: 'snippet', type: 'video', q: query.trim(),
    maxResults: '6', videoEmbeddable: 'true', videoSyndicated: 'true', key: key.trim() });
  const response = await fetcher(url, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) {
    const messages = { 400: 'Confira a chave e o termo de busca.',
      403: 'Verifique se a API está ativa, as restrições da chave e a cota no Google Cloud.',
      429: 'Limite de buscas atingido. Tente mais tarde.' };
    throw new Error(messages[response.status] || 'Não foi possível consultar o YouTube. Tente novamente.');
  }
  const data = await response.json();
  return (data.items || []).filter(item => /^[\w-]{11}$/.test(item.id?.videoId)).map(item => ({
    id: item.id.videoId, title: item.snippet?.title || 'Vídeo do YouTube',
    channel: item.snippet?.channelTitle || 'YouTube'
  }));
}

export function initYouTube() {
  const form = document.getElementById('youtube-form');
  const container = document.getElementById('youtube-player');
  const status = document.getElementById('youtube-status');
  const close = document.getElementById('youtube-close');
  function stop(message = 'Player fechado. Cole um link para abrir novamente.') {
    if (!container.childElementCount) return;
    container.replaceChildren(); container.hidden = true; close.hidden = true;
    status.textContent = message;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const source = parseYouTubeLink(document.getElementById('youtube-link').value);
    if (!source) { status.textContent = 'Use um link HTTPS de vídeo ou playlist do YouTube.'; return; }
    document.getElementById('stop-radio').click();
    const frame = document.createElement('iframe');
    frame.title = 'Player oficial do YouTube';
    frame.src = source;
    frame.allow = 'encrypted-media; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    container.replaceChildren(frame); container.hidden = false; close.hidden = false;
    status.textContent = 'Use o play e o volume do YouTube. Se o vídeo não permitir incorporação, escolha outro link. Ao sair desta tela ou ocultar a aba, o player será fechado.';
  });
  const searchForm = document.getElementById('youtube-search-form');
  const results = document.getElementById('youtube-search-results');
  const searchStatus = document.getElementById('youtube-search-status');
  let searchController;
  searchForm.addEventListener('submit', async event => {
    event.preventDefault();
    searchController?.abort();
    const key = document.getElementById('youtube-api-key').value.trim();
    results.replaceChildren();
    results.removeAttribute('aria-busy');
    if (!key) { searchStatus.textContent = 'Abra “Configurar busca do YouTube” e insira sua chave restrita.'; return; }
    const controller = new AbortController();
    searchController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    searchStatus.textContent = 'Buscando no YouTube…';
    results.setAttribute('aria-busy', 'true');
    try {
      const videos = await searchYouTube(document.getElementById('youtube-query').value, key, { signal: controller.signal });
      if (searchController !== controller) return;
      for (const video of videos) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'quiet-button bordered';
        const thumbnail = document.createElement('img');
        thumbnail.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
        thumbnail.alt = ''; thumbnail.loading = 'lazy'; thumbnail.width = 160; thumbnail.height = 90;
        const label = document.createElement('span');
        label.textContent = `${video.title} — ${video.channel}`;
        button.append(thumbnail, label);
        button.addEventListener('click', () => {
          document.getElementById('youtube-link').value = `https://www.youtube.com/watch?v=${video.id}`;
          form.requestSubmit();
        });
        results.append(button);
      }
      searchStatus.textContent = videos.length ? `${videos.length} resultados do YouTube. Escolha um vídeo para abrir o player.` : 'Nenhum vídeo encontrado. Tente outro termo.';
    } catch (error) {
      if (searchController !== controller) return;
      searchStatus.textContent = error.name === 'AbortError' ? 'A busca demorou demais. Tente novamente.' :
        error instanceof TypeError ? 'Sem conexão com o YouTube. Confira sua internet.' : error.message;
    } finally {
      clearTimeout(timeout);
      if (searchController === controller) results.removeAttribute('aria-busy');
    }
  });
  close.addEventListener('click', () => stop());
  document.getElementById('radio-results').addEventListener('click', event => {
    if (event.target.closest('button')) stop('YouTube fechado para ouvir a rádio.');
  });
  window.addEventListener('hashchange', () => {
    if (location.hash !== '#ambientes') stop('Player fechado ao sair de Ambientes. Abra o link novamente quando voltar.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop('Player fechado enquanto a aba estava oculta. Abra o link novamente para continuar.');
  });
}
if (typeof document !== 'undefined') initYouTube();

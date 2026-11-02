import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeLink } from '../pomodoro-pwa/src/youtube.js';
test('YouTube video, short link, live and music URLs resolve to the official embed', () => {
  for (const input of ['https://www.youtube.com/watch?v=M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE?t=30','https://youtube.com/live/M7lc1UVf-VE','https://music.youtube.com/watch?v=M7lc1UVf-VE']) {
    const url = new URL(parseYouTubeLink(input));
    assert.equal(url.origin, 'https://www.youtube.com');
    assert.equal(url.pathname, '/embed/M7lc1UVf-VE');
    assert.equal(url.searchParams.has('autoplay'), false);
  }
});
test('YouTube playlists preserve their identifier', () => {
  const url = new URL(parseYouTubeLink('https://www.youtube.com/playlist?list=PLC77007E23FF423C6'));
  assert.equal(url.pathname, '/embed/videoseries');
  assert.equal(url.searchParams.get('list'), 'PLC77007E23FF423C6');
});
test('rejects scripts, deceptive hosts, credentials and malformed IDs', () => {
  for (const input of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','http://youtu.be/M7lc1UVf-VE','https://user:pass@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com/watch?v=bad','https://example.com/playlist?list=PLC77007E23FF423C6','https://youtube.com/watch?v=M7lc1UVf-VE&list=%22%3E']) assert.equal(parseYouTubeLink(input),null,input);
});

test('search requests only embeddable videos and excludes invalid identifiers', async () => {
  const { searchYouTube } = await import('../pomodoro-pwa/src/youtube.js');
  const videos = await searchYouTube(' jazz ', 'synthetic-key', { fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.searchParams.get('q'), 'jazz');
    assert.equal(url.searchParams.get('videoEmbeddable'), 'true');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ items: [
      { id: { videoId: 'M7lc1UVf-VE' }, snippet: { title: '<script>text</script>', channelTitle: 'Channel' } },
      { id: { videoId: '../bad' } }
    ] }) };
  } });
  assert.equal(videos.length, 1);
  assert.equal(videos[0].title, '<script>text</script>');
});

test('search errors do not expose provider response or credentials', async () => {
  const { searchYouTube } = await import('../pomodoro-pwa/src/youtube.js');
  await assert.rejects(searchYouTube('jazz', 'synthetic-key', { fetcher: async () => ({ ok: false, status: 403 }) }), /restrições da chave/);
});

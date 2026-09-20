import './style.css';
import { LyricPlayer, BackgroundRender, MeshGradientRenderer, type LyricLine } from '@applemusic-like-lyrics/core';
import { parseTTML } from '@applemusic-like-lyrics/lyric';

// Declare Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

// 1. Initialize Telegram Mini App
if (window.Telegram?.WebApp) {
  try {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#09090b');
    tg.setBackgroundColor('#09090b');
  } catch (e) {
    console.warn('Telegram WebApp init warning:', e);
  }
}

// 2. DOM Elements
const trackTitleEl = document.getElementById('track-title') as HTMLHeadingElement;
const trackArtistEl = document.getElementById('track-artist') as HTMLParagraphElement;
const coverImgEl = document.getElementById('cover-img') as HTMLImageElement;
const timingBadgeEl = document.getElementById('timing-badge') as HTMLSpanElement;
const lyricContainerEl = document.getElementById('lyric-container') as HTMLElement;
const loadingSpinnerEl = document.getElementById('loading-spinner') as HTMLElement;
const loadingTextEl = document.getElementById('loading-text') as HTMLParagraphElement;
const fallbackBgEl = document.getElementById('fallback-bg') as HTMLElement;
const bgContainerEl = document.getElementById('bg-container') as HTMLElement;

// Controls DOM
const audioEl = document.getElementById('audio-player') as HTMLAudioElement;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const iconPlay = document.getElementById('icon-play') as SVGElement;
const iconPause = document.getElementById('icon-pause') as SVGElement;
const btnRewind = document.getElementById('btn-rewind') as HTMLButtonElement;
const btnForward = document.getElementById('btn-forward') as HTMLButtonElement;
const progressContainer = document.getElementById('progress-container') as HTMLElement;
const progressFill = document.getElementById('progress-fill') as HTMLElement;
const currentTimeEl = document.getElementById('current-time') as HTMLElement;
const totalTimeEl = document.getElementById('total-time') as HTMLElement;

// Search Modal DOM
const btnSearch = document.getElementById('btn-search') as HTMLButtonElement;
const searchOverlay = document.getElementById('search-overlay') as HTMLElement;
const btnCloseSearch = document.getElementById('btn-close-search') as HTMLButtonElement;
const searchForm = document.getElementById('search-form') as HTMLFormElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;

// State
let parsedLines: LyricLine[] = [];
let isPlaying = false;
let currentTimeSec = 0;
let durationSec = 180; // default duration if no audio
let lastTimeMs = performance.now();
let playerInstance: LyricPlayer | null = null;
let bgRenderer: BackgroundRender<MeshGradientRenderer> | null = null;
let hasRealAudio = false;

// 3. Initialize AMLL Mesh Gradient Background
try {
  if (MeshGradientRenderer.isSupported()) {
    bgRenderer = BackgroundRender.new(MeshGradientRenderer);
    const canvas = bgRenderer.getElement();
    bgContainerEl.appendChild(canvas);
  }
} catch (e) {
  console.warn('MeshGradientRenderer not supported, using fallback gradient:', e);
}

// 4. Initialize AMLL Lyric Player
playerInstance = new LyricPlayer();
playerInstance.setWordFadeWidth(0.5);
playerInstance.setEnableBlur(true);
playerInstance.setEnableScale(true);

const playerEl = playerInstance.getElement();
playerEl.style.width = '100%';
playerEl.style.height = '100%';
lyricContainerEl.appendChild(playerEl);

// Line Click seek listener
playerInstance.addEventListener('click', (e: any) => {
  const lineIdx = e.lineIndex;
  if (lineIdx !== undefined && lineIdx >= 0 && lineIdx < parsedLines.length) {
    const line = parsedLines[lineIdx];
    const targetSec = line.startTime / 1000;
    seekTo(targetSec);
    try {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    } catch {}
  }
});

// Helper: Format Seconds to M:SS
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function seekTo(targetSec: number) {
  currentTimeSec = Math.max(0, Math.min(targetSec, durationSec));
  if (hasRealAudio) {
    audioEl.currentTime = currentTimeSec;
  }
  if (playerInstance) {
    playerInstance.setCurrentTime(currentTimeSec * 1000, true);
    playerInstance.update();
  }
  updateUIProgress();
}

function play() {
  isPlaying = true;
  lastTimeMs = performance.now();
  iconPlay.classList.add('hidden');
  iconPause.classList.remove('hidden');
  if (hasRealAudio) {
    audioEl.play().catch((e) => console.warn('Audio play error:', e));
  }
  if (playerInstance) {
    playerInstance.resume();
  }
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
  } catch {}
}

function pause() {
  isPlaying = false;
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  if (hasRealAudio) {
    audioEl.pause();
  }
  if (playerInstance) {
    playerInstance.pause();
  }
}

function togglePlay() {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function updateUIProgress() {
  currentTimeEl.textContent = formatTime(currentTimeSec);
  totalTimeEl.textContent = formatTime(durationSec);
  const pct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;
  progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

// Controls Events
btnPlay.addEventListener('click', togglePlay);

btnRewind.addEventListener('click', () => {
  seekTo(currentTimeSec - 10);
});

btnForward.addEventListener('click', () => {
  seekTo(currentTimeSec + 10);
});

progressContainer.addEventListener('click', (e) => {
  const rect = progressContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  seekTo(ratio * durationSec);
});

// Audio callbacks
audioEl.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
    durationSec = audioEl.duration;
    totalTimeEl.textContent = formatTime(durationSec);
  }
});

audioEl.addEventListener('ended', () => {
  pause();
  seekTo(0);
});

// 5. Main RAF Render Loop
function renderLoop() {
  const now = performance.now();
  const delta = (now - lastTimeMs) / 1000;
  lastTimeMs = now;

  if (isPlaying) {
    if (hasRealAudio) {
      currentTimeSec = audioEl.currentTime;
    } else {
      currentTimeSec += delta;
      if (currentTimeSec >= durationSec) {
        pause();
        currentTimeSec = 0;
      }
    }

    if (playerInstance) {
      playerInstance.setCurrentTime(currentTimeSec * 1000);
      playerInstance.update();
    }
    updateUIProgress();
  }

  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

// 6. Track Loader
interface TrackOptions {
  id?: string;
  sf?: string;
  title?: string;
  artist?: string;
  cover?: string;
  audio?: string;
}

async function loadTrack(opts: TrackOptions) {
  pause();
  currentTimeSec = 0;
  parsedLines = [];
  updateUIProgress();

  loadingSpinnerEl.classList.remove('hidden');
  loadingTextEl.textContent = 'Загрузка слоговой лирики...';

  const title = opts.title || (opts.id ? 'Apple Track' : 'Демо');
  const artist = opts.artist || '';

  trackTitleEl.textContent = title;
  trackArtistEl.textContent = artist;

  // Cover image
  if (opts.cover) {
    coverImgEl.src = opts.cover;
    coverImgEl.classList.remove('hidden');
    if (bgRenderer) {
      bgRenderer.setAlbum(opts.cover).then(() => {
        fallbackBgEl.style.opacity = '0.2';
      }).catch((e) => console.warn('bg album set error:', e));
    }
  } else {
    coverImgEl.classList.add('hidden');
    fallbackBgEl.style.opacity = '1';
  }

  // Audio setup
  if (opts.audio) {
    hasRealAudio = true;
    audioEl.src = opts.audio;
    audioEl.load();
  } else {
    hasRealAudio = false;
    audioEl.removeAttribute('src');
  }

  try {
    const fetchUrl = '/v2/lyrics/ttml';
    const params = new URLSearchParams();
    if (opts.id) {
      params.set('id', opts.id);
      params.set('sf', opts.sf || 'us');
    } else if (opts.title) {
      params.set('title', opts.title);
      if (opts.artist) params.set('artist', opts.artist);
      if (opts.sf) params.set('sf', opts.sf);
    }

    const response = await fetch(`${fetchUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Read headers
    const trackNameHeader = response.headers.get('X-Track-Name');
    const artistNameHeader = response.headers.get('X-Artist-Name');
    const timingHeader = (response.headers.get('X-Lyrics-Timing') || 'Word').toLowerCase();

    if (trackNameHeader) trackTitleEl.textContent = decodeURIComponent(trackNameHeader);
    if (artistNameHeader) trackArtistEl.textContent = decodeURIComponent(artistNameHeader);

    if (timingHeader === 'word') {
      timingBadgeEl.textContent = 'Apple TTML';
    } else if (timingHeader === 'line') {
      timingBadgeEl.textContent = 'Line Synced';
    } else {
      timingBadgeEl.textContent = 'Lyrics';
    }

    const ttmlText = await response.text();
    const parsed = parseTTML(ttmlText);

    if (!parsed || !parsed.lines || parsed.lines.length === 0) {
      loadingTextEl.textContent = 'Текст песни пуст или не найден';
      return;
    }

    parsedLines = parsed.lines.map((line) => ({
      words: (line.words || []).map((w) => ({
        word: w.word,
        startTime: w.startTime,
        endTime: w.endTime,
        romanWord: w.romanWord || '',
        obscene: false,
      })),
      startTime: line.words?.[0]?.startTime ?? line.startTime ?? 0,
      endTime: line.words?.[line.words.length - 1]?.endTime ?? line.endTime ?? Number.POSITIVE_INFINITY,
      translatedLyric: line.translatedLyric || '',
      romanLyric: line.romanLyric || '',
      isBG: Boolean(line.isBG),
      isDuet: Boolean(line.isDuet),
    }));

    // Update duration estimate from last lyric line if no real audio
    const lastLine = parsedLines[parsedLines.length - 1];
    if (!hasRealAudio && lastLine && Number.isFinite(lastLine.endTime)) {
      durationSec = Math.ceil(lastLine.endTime / 1000) + 5;
    }

    // Feed lines to player
    playerInstance?.setLyricLines(parsedLines, 0);
    playerInstance?.setCurrentTime(0, true);
    playerInstance?.update();

    // Hide spinner
    loadingSpinnerEl.classList.add('hidden');
    updateUIProgress();

    // Auto-play demo or audio
    play();
  } catch (err: any) {
    console.error('Failed to load lyrics:', err);
    loadingTextEl.textContent = 'Лирика не найдена или временно недоступна';
  }
}

// 7. Search Modal Events
btnSearch.addEventListener('click', () => {
  searchOverlay.classList.remove('hidden');
  searchInput.focus();
  try {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
  } catch {}
});

btnCloseSearch.addEventListener('click', () => {
  searchOverlay.classList.add('hidden');
});

searchOverlay.addEventListener('click', (e) => {
  if (e.target === searchOverlay) {
    searchOverlay.classList.add('hidden');
  }
});

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;

  searchOverlay.classList.add('hidden');
  searchInput.value = '';

  let title = q;
  let artist = '';
  if (q.includes(' - ')) {
    const parts = q.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  } else if (q.includes(' — ')) {
    const parts = q.split(' — ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' — ').trim();
  }

  loadTrack({ title, artist });
});

// Quick suggestion chips
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const title = chip.getAttribute('data-title') || '';
    const artist = chip.getAttribute('data-artist') || '';
    searchOverlay.classList.add('hidden');
    loadTrack({ title, artist });
    try {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    } catch {}
  });
});

// 8. Initial Load: from URL parameters or default demo
const urlParams = new URLSearchParams(window.location.search);
const initTitle = urlParams.get('title') || '';
const initArtist = urlParams.get('artist') || '';
const initId = urlParams.get('id') || '';
const initSf = urlParams.get('sf') || 'us';
const initCover = urlParams.get('cover') || '';
const initAudio = urlParams.get('audio') || '';

if (initId || initTitle) {
  loadTrack({
    id: initId,
    sf: initSf,
    title: initTitle,
    artist: initArtist,
    cover: initCover,
    audio: initAudio,
  });
} else {
  // Default interactive demo
  loadTrack({
    title: 'Numb',
    artist: 'Linkin Park',
  });
}

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

// 2. Parse Query Parameters
const urlParams = new URLSearchParams(window.location.search);
const queryTitle = urlParams.get('title') || '';
const queryArtist = urlParams.get('artist') || '';
const queryId = urlParams.get('id') || '';
const querySf = urlParams.get('sf') || 'us';
const queryCover = urlParams.get('cover') || '';
const queryAudio = urlParams.get('audio') || '';

// DOM Elements
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

// Set initial Header info
if (queryTitle) trackTitleEl.textContent = queryTitle;
if (queryArtist) trackArtistEl.textContent = queryArtist;
if (queryCover) {
  coverImgEl.src = queryCover;
  coverImgEl.classList.remove('hidden');
}

// State
let parsedLines: LyricLine[] = [];
let isPlaying = false;
let currentTimeSec = 0;
let durationSec = 180; // default duration if no audio
let lastTimeMs = performance.now();
let playerInstance: LyricPlayer | null = null;
let bgRenderer: BackgroundRender<MeshGradientRenderer> | null = null;
let hasRealAudio = Boolean(queryAudio);

// 3. Initialize AMLL Mesh Gradient Background
try {
  if (MeshGradientRenderer.isSupported()) {
    bgRenderer = BackgroundRender.new(MeshGradientRenderer);
    const canvas = bgRenderer.getElement();
    bgContainerEl.appendChild(canvas);
    if (queryCover) {
      bgRenderer.setAlbum(queryCover).then(() => {
        fallbackBgEl.style.opacity = '0.3';
      }).catch((e) => console.warn('bg album set error:', e));
    }
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

// 5. Setup Audio if URL provided
if (hasRealAudio) {
  audioEl.src = queryAudio;
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

// 6. Main RAF Render Loop
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

// 7. Fetch TTML and Load Lyrics
async function loadLyrics() {
  try {
    let fetchUrl = '/v2/lyrics/ttml';
    const params = new URLSearchParams();
    if (queryId) {
      params.set('id', queryId);
      params.set('sf', querySf);
    } else if (queryTitle) {
      params.set('title', queryTitle);
      if (queryArtist) params.set('artist', queryArtist);
      if (querySf) params.set('sf', querySf);
    } else {
      loadingTextEl.textContent = 'Укажите песню для отображения текста';
      return;
    }

    const response = await fetch(`${fetchUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Read headers
    const trackNameHeader = response.headers.get('X-Track-Name');
    const artistNameHeader = response.headers.get('X-Artist-Name');
    const timingHeader = (response.headers.get('X-Lyrics-Timing') || 'Word').toLowerCase();

    if (trackNameHeader && !queryTitle) trackTitleEl.textContent = trackNameHeader;
    if (artistNameHeader && !queryArtist) trackArtistEl.textContent = artistNameHeader;

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

    // Update estimated duration from last lyric line if no real audio
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
  } catch (err: any) {
    console.error('Failed to load lyrics:', err);
    loadingTextEl.textContent = 'Лирика не найдена или временно недоступна';
  }
}

loadLyrics();

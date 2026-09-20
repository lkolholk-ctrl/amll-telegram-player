import type { PaletteAlgorithm } from "@applemusic-like-lyrics/core";
import { defineStore } from "pinia";

export type BackgroundRendererMode = "mg" | "pixi" | "isolation";

export interface SpringParams {
	mass: number;
	damping: number;
	stiffness: number;
	soft: boolean;
}

export const PRESET_TRACKS = [
	{
		title: "CHIHIRO",
		artist: "Billie Eilish",
		audio: "/player/audio/chihiro.mp3",
		album: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/92/9f/69/929f69f1-9977-3a44-d674-11f70c852d1b/24UMGIM36186.rgb.jpg/600x600bb.jpg",
		lyric: "/v2/lyrics/ttml?title=CHIHIRO&artist=Billie+Eilish",
	},
	{
		title: "Numb",
		artist: "Linkin Park",
		audio: "/player/audio/numb.mp3",
		album: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/13/44/05/134405bd-9e27-a678-8953-b5f724201f95/093624948988.jpg/600x600bb.jpg",
		lyric: "/v2/lyrics/ttml?title=Numb&artist=Linkin+Park",
	},
	{
		title: "Blinding Lights",
		artist: "The Weeknd",
		audio: "/player/audio/blinding_lights.mp3",
		album: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bf/16/91/bf16911d-ef1f-d7d8-3a9d-b4b3c004c356/24UMGIM39255.rgb.jpg/600x600bb.jpg",
		lyric: "/v2/lyrics/ttml?title=Blinding+Lights&artist=The+Weeknd",
	},
	{
		title: "In The End",
		artist: "Linkin Park",
		audio: "/player/audio/in_the_end.mp3",
		album: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/53/a7/7f/53a77fab-c54c-a57b-8130-248fc12d0c80/093624948995.jpg/600x600bb.jpg",
		lyric: "/v2/lyrics/ttml?title=In+The+End&artist=Linkin+Park",
	},
];

const query = new URLSearchParams(globalThis.location?.search ?? "");
const titleParam = query.get("title") ?? "";
const artistParam = query.get("artist") ?? "";
const audioParam = query.get("audio") ?? query.get("music") ?? "";
const coverParam = query.get("cover") ?? query.get("album") ?? "";
let lyricParam = query.get("lyric") ?? "";

// Auto-match preset or construct URL
const matchedPreset = PRESET_TRACKS.find(
	(p) =>
		p.title.toLowerCase() === titleParam.toLowerCase() ||
		titleParam.toLowerCase().includes(p.title.toLowerCase()),
);

let initialMusicUrl = audioParam;
let initialAlbumUrl = coverParam;
let initialLyricUrl = lyricParam;
let initialMusicName = titleParam ? (artistParam ? `${artistParam} — ${titleParam}` : titleParam) : "";
let initialLyricName = titleParam ? `${titleParam}.ttml` : "";

if (!initialMusicUrl && matchedPreset) {
	initialMusicUrl = matchedPreset.audio;
}
if (!initialAlbumUrl && matchedPreset) {
	initialAlbumUrl = matchedPreset.album;
}
if (!initialLyricUrl) {
	if (titleParam) {
		initialLyricUrl = `/v2/lyrics/ttml?title=${encodeURIComponent(titleParam)}&artist=${encodeURIComponent(artistParam)}`;
	} else if (matchedPreset) {
		initialLyricUrl = matchedPreset.lyric;
	} else {
		// Default to CHIHIRO
		const def = PRESET_TRACKS[0];
		initialMusicUrl = def.audio;
		initialAlbumUrl = def.album;
		initialLyricUrl = def.lyric;
		initialMusicName = `${def.artist} — ${def.title}`;
		initialLyricName = `${def.title}.ttml`;
	}
}

function revokeObjectUrl(url: string): void {
	if (url) URL.revokeObjectURL(url);
}

function clampTime(time: number, duration: number): number {
	const safeTime = Number.isFinite(time) ? time : 0;
	const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
	return Math.min(Math.max(0, safeTime), safeDuration);
}

export const usePlayerStore = defineStore("player", {
	state: () => ({
		source: {
			lyricUrl: initialLyricUrl,
			lyricName: initialLyricName || initialLyricUrl,
			lyricRevision: 0,
			musicUrl: initialMusicUrl,
			musicName: initialMusicName,
			albumUrl: initialAlbumUrl,
			albumName: initialMusicName,
			albumRevision: 0,
		},
		localObjectUrls: {
			lyric: "",
			music: "",
			album: "",
			extractedAlbum: "",
		},
		audio: {
			currentTime: 0,
			duration: 0,
			playing: false,
			seekRevision: 0,
			error: "",
		},
		lyric: {
			loading: false,
			error: "",
			fadeWidth: 0.5,
			enableBlur: true,
			enableSpring: true,
			fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
			fontWeight: 700,
			verticalSpring: {
				mass: 1,
				damping: 15,
				stiffness: 100,
				soft: false,
			} satisfies SpringParams,
			scaleSpring: {
				mass: 1,
				damping: 20,
				stiffness: 100,
				soft: false,
			} satisfies SpringParams,
		},
		background: {
			playing: true,
			staticMode: false,
			renderer: (query.get("bg") === "pixi"
				? "pixi"
				: query.get("bg") === "isolation"
					? "isolation"
					: "mg") as BackgroundRendererMode,
			scale: 1,
			fps: 60,
			flowSpeed: 0.2,
			isolation: {
				lightWave: false,
				dithering: true,
				paletteAlgorithm: "auto" as PaletteAlgorithm,
			},
			error: "",
		},
	}),
	actions: {
		setLyricUrl(url: string): void {
			if (url !== this.localObjectUrls.lyric) {
				revokeObjectUrl(this.localObjectUrls.lyric);
				this.localObjectUrls.lyric = "";
			}
			this.source.lyricUrl = url;
			this.source.lyricName = url;
		},
		setMusicUrl(url: string): void {
			if (url !== this.localObjectUrls.music) {
				revokeObjectUrl(this.localObjectUrls.music);
				this.localObjectUrls.music = "";
			}
			this.source.musicUrl = url;
			this.source.musicName = url;
		},
		setAlbumUrl(url: string): void {
			if (url !== this.localObjectUrls.album) {
				revokeObjectUrl(this.localObjectUrls.album);
				this.localObjectUrls.album = "";
			}
			if (url !== this.localObjectUrls.extractedAlbum) {
				revokeObjectUrl(this.localObjectUrls.extractedAlbum);
				this.localObjectUrls.extractedAlbum = "";
			}
			this.source.albumUrl = url;
			this.source.albumName = url;
		},
		setLocalLyricFile(file: File): void {
			revokeObjectUrl(this.localObjectUrls.lyric);
			const url = URL.createObjectURL(file);
			this.localObjectUrls.lyric = url;
			this.source.lyricUrl = url;
			this.source.lyricName = file.name;
		},
		setLocalMusicFile(file: File): void {
			revokeObjectUrl(this.localObjectUrls.music);
			const url = URL.createObjectURL(file);
			this.localObjectUrls.music = url;
			this.source.musicUrl = url;
			this.source.musicName = file.name;
		},
		setLocalAlbumFile(file: File): void {
			revokeObjectUrl(this.localObjectUrls.album);
			const url = URL.createObjectURL(file);
			this.localObjectUrls.album = url;
			this.source.albumUrl = url;
			this.source.albumName = file.name;
		},
		setExtractedAlbumBlob(blob: Blob, name: string): void {
			revokeObjectUrl(this.localObjectUrls.extractedAlbum);
			const url = URL.createObjectURL(blob);
			this.localObjectUrls.extractedAlbum = url;
			this.source.albumUrl = url;
			this.source.albumName = name;
		},
		clearExtractedAlbum(): void {
			if (this.source.albumUrl === this.localObjectUrls.extractedAlbum) {
				this.source.albumUrl = "";
				this.source.albumName = "";
			}
			revokeObjectUrl(this.localObjectUrls.extractedAlbum);
			this.localObjectUrls.extractedAlbum = "";
		},
		reloadLyric(): void {
			this.source.lyricRevision += 1;
		},
		reloadAlbum(): void {
			this.source.albumRevision += 1;
		},
		disposeLocalObjectUrls(): void {
			revokeObjectUrl(this.localObjectUrls.lyric);
			revokeObjectUrl(this.localObjectUrls.music);
			revokeObjectUrl(this.localObjectUrls.album);
			revokeObjectUrl(this.localObjectUrls.extractedAlbum);
			this.localObjectUrls.lyric = "";
			this.localObjectUrls.music = "";
			this.localObjectUrls.album = "";
			this.localObjectUrls.extractedAlbum = "";
		},
		togglePlayback(): void {
			this.audio.playing = !this.audio.playing;
		},
		setPlaying(playing: boolean): void {
			this.audio.playing = playing;
		},
		seek(time: number): void {
			this.audio.currentTime = clampTime(time, this.audio.duration);
			this.audio.seekRevision += 1;
		},
		syncCurrentTime(time: number): void {
			this.audio.currentTime = clampTime(time, this.audio.duration);
		},
		setDuration(duration: number): void {
			this.audio.duration =
				Number.isFinite(duration) && duration > 0 ? duration : 0;
		},
		setAudioError(error: string): void {
			this.audio.error = error;
		},
		setLyricLoading(loading: boolean): void {
			this.lyric.loading = loading;
		},
		setLyricError(error: string): void {
			this.lyric.error = error;
		},
		setBackgroundError(error: string): void {
			this.background.error = error;
		},
	},
});

<script setup lang="ts">
import {
	DomLyricPlayer,
	type LyricLineMouseEvent,
} from "@applemusic-like-lyrics/core";
import {
	PauseIcon,
	PlayIcon,
	RotateCcw,
	RotateCw,
	SearchIcon,
	XIcon,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Button from "@/components/ui/button/Button.vue";
import { extractSongwriters, parseLyricSource } from "@/lib/parse-lyric";
import { audioRuntime } from "@/runtime/audio";
import { backgroundRuntime } from "@/runtime/background";
import { PRESET_TRACKS, usePlayerStore } from "@/stores/player";

const player = usePlayerStore();
const playerEl = ref<HTMLElement | null>(null);
const lyricPlayerRef = shallowRef<DomLyricPlayer>();

let frameId = 0;
let lastFrameTime = -1;
let lyricLoadRevision = 0;

// Search modal state
const isSearchOpen = ref(false);
const searchQuery = ref("");

const progressPercent = computed(() => {
	const duration = player.audio.duration;
	if (!duration || duration <= 0) return 0;
	return Math.min(100, Math.max(0, (player.audio.currentTime / duration) * 100));
});

function formatTime(sec: number): string {
	if (!Number.isFinite(sec) || sec < 0) return "0:00";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function triggerHaptic(type: "light" | "medium" = "light"): void {
	try {
		(window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred(type);
	} catch {}
}

function togglePlay(): void {
	triggerHaptic("medium");
	if (player.audio.playing) {
		player.setPlaying(false);
		void audioRuntime.setPlaying(false);
		lyricPlayerRef.value?.pause();
	} else {
		player.setPlaying(true);
		void audioRuntime.setPlaying(true);
		lyricPlayerRef.value?.resume();
	}
}

function rewind10(): void {
	triggerHaptic("light");
	const target = Math.max(0, player.audio.currentTime - 10);
	player.seek(target);
	audioRuntime.seek(target);
	lyricPlayerRef.value?.setCurrentTime(Math.round(target * 1000), true);
}

function forward10(): void {
	triggerHaptic("light");
	const target = Math.min(player.audio.duration, player.audio.currentTime + 10);
	player.seek(target);
	audioRuntime.seek(target);
	lyricPlayerRef.value?.setCurrentTime(Math.round(target * 1000), true);
}

function onProgressClick(e: MouseEvent): void {
	const el = e.currentTarget as HTMLElement;
	if (!el || !player.audio.duration) return;
	const rect = el.getBoundingClientRect();
	const clickX = e.clientX - rect.left;
	const ratio = Math.max(0, Math.min(1, clickX / rect.width));
	const target = ratio * player.audio.duration;
	player.seek(target);
	audioRuntime.seek(target);
	lyricPlayerRef.value?.setCurrentTime(Math.round(target * 1000), true);
	triggerHaptic("light");
}

function applyLyricSettings(): void {
	const lyricPlayer = lyricPlayerRef.value;
	if (!lyricPlayer) return;
	lyricPlayer.setWordFadeWidth(player.lyric.fadeWidth);
	lyricPlayer.setEnableBlur(player.lyric.enableBlur);
	lyricPlayer.setEnableSpring(player.lyric.enableSpring);
	lyricPlayer.setLinePosYSpringParams({ ...player.lyric.verticalSpring });
	lyricPlayer.setLineScaleSpringParams({ ...player.lyric.scaleSpring });
}

function mountBackground(): void {
	const host = playerEl.value;
	if (!host) return;

	const lyricElement = lyricPlayerRef.value?.getElement() ?? null;
	backgroundRuntime.mount(host, player.background.renderer, lyricElement);
	player.setBackgroundError("");
	backgroundRuntime.applySettings(player);
	void backgroundRuntime.loadAlbum(player);
}

function applySongwriters(songwriters: string[]): void {
	const bottomLineElement = lyricPlayerRef.value?.getBottomLineElement();
	if (!bottomLineElement) return;

	bottomLineElement.textContent = "";
	if (songwriters.length === 0) return;

	const b = document.createElement("b");
	b.textContent = "Авторы";
	bottomLineElement.append(b, `: ${songwriters.join(", ")}`);
}

async function loadLyric(): Promise<void> {
	const lyricPlayer = lyricPlayerRef.value;
	if (!lyricPlayer) return;

	const revision = ++lyricLoadRevision;
	player.setLyricLoading(true);
	player.setLyricError("");

	try {
		const { lines, metadata } = await parseLyricSource(
			player.source.lyricUrl,
			player.source.lyricName,
		);
		if (revision !== lyricLoadRevision) return;

		const currentTime = Math.round(player.audio.currentTime * 1000);
		lyricPlayer.setLyricLines(lines, currentTime);
		lyricPlayer.setCurrentTime(currentTime, true);
		backgroundRuntime.setHasLyric(lines.length > 0);
		applyLyricSettings();

		const songwriters = extractSongwriters(metadata);
		applySongwriters(songwriters);

		// If playing, keep in sync
		if (player.audio.playing) {
			lyricPlayer.resume();
		}
	} catch (error) {
		if (revision !== lyricLoadRevision) return;
		lyricPlayer.setLyricLines([]);
		applySongwriters([]);
		backgroundRuntime.setHasLyric(false);
		player.setLyricError(
			error instanceof Error ? error.message : String(error),
		);
	} finally {
		if (revision === lyricLoadRevision) player.setLyricLoading(false);
	}
}

function applyMusicSource(): void {
	audioRuntime.setSource(player.source.musicUrl);
}

function applyPlayback(playing: boolean): void {
	const lyricPlayer = lyricPlayerRef.value;
	if (!playing) {
		lyricPlayer?.pause();
		void audioRuntime.setPlaying(false);
		return;
	}

	lyricPlayer?.resume();
	void audioRuntime.setPlaying(true);
}

function seekCoreToStoreTime(): void {
	const currentTime = player.audio.currentTime;
	audioRuntime.seek(currentTime);
	lyricPlayerRef.value?.setCurrentTime(Math.round(currentTime * 1000), true);
}

function startFrameLoop(): void {
	const onFrame = (time: number) => {
		if (lastFrameTime === -1) lastFrameTime = time;
		const delta = Math.min(time - lastFrameTime, 100);
		const lyricPlayer = lyricPlayerRef.value;

		if (!audioRuntime.isPaused) {
			const currentTime = audioRuntime.currentTime;
			player.syncCurrentTime(currentTime);
			lyricPlayer?.setCurrentTime(Math.round(currentTime * 1000));
		}

		lyricPlayer?.update(delta);
		lastFrameTime = time;
		frameId = requestAnimationFrame(onFrame);
	};

	frameId = requestAnimationFrame(onFrame);
}

function stopFrameLoop(): void {
	if (frameId) cancelAnimationFrame(frameId);
	frameId = 0;
	lastFrameTime = -1;
}

function onLineClick(event: Event): void {
	const lineEvent = event as LyricLineMouseEvent;
	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();
	const targetTime = lineEvent.line.getLine().startTime / 1000;
	player.seek(targetTime);
	audioRuntime.seek(targetTime);
	lyricPlayerRef.value?.setCurrentTime(Math.round(targetTime * 1000), true);
	triggerHaptic("light");
	if (!player.audio.playing) {
		togglePlay();
	}
}

function selectPresetTrack(item: typeof PRESET_TRACKS[0]): void {
	player.setMusicUrl(item.audio);
	player.setAlbumUrl(item.album);
	player.setLyricUrl(item.lyric);
	player.source.musicName = `${item.artist} — ${item.title}`;
	player.source.lyricName = `${item.title}.ttml`;
	isSearchOpen.value = false;
	triggerHaptic("medium");
	// Auto play selected track
	setTimeout(() => {
		togglePlay();
	}, 200);
}

function handleSearchSubmit(): void {
	const q = searchQuery.value.trim();
	if (!q) return;

	let title = q;
	let artist = "";
	if (q.includes(" - ")) {
		const parts = q.split(" - ");
		artist = parts[0].trim();
		title = parts.slice(1).join(" - ").trim();
	} else if (q.includes(" — ")) {
		const parts = q.split(" — ");
		artist = parts[0].trim();
		title = parts.slice(1).join(" — ").trim();
	}

	player.setLyricUrl(`/v2/lyrics/ttml?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
	player.source.musicName = artist ? `${artist} — ${title}` : title;
	player.source.lyricName = `${title}.ttml`;

	// Auto search Apple Cover & Preview
	fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`)
		.then((r) => r.json())
		.then((data) => {
			if (data.results && data.results.length > 0) {
				const track = data.results[0];
				if (track.artworkUrl100) {
					player.setAlbumUrl(track.artworkUrl100.replace("100x100bb.jpg", "600x600bb.jpg"));
				}
				if (track.previewUrl) {
					player.setMusicUrl(track.previewUrl);
				}
			}
		})
		.catch((e) => console.warn("Search artwork error:", e));

	isSearchOpen.value = false;
	searchQuery.value = "";
	triggerHaptic("medium");
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tagName = target.tagName.toLowerCase();
	return (
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		target.isContentEditable
	);
}

function onGlobalKeyDown(event: KeyboardEvent): void {
	if (event.defaultPrevented || isEditableTarget(event.target)) return;

	if (event.code === "Space") {
		event.preventDefault();
		togglePlay();
		return;
	}

	if (event.code === "ArrowLeft") {
		event.preventDefault();
		rewind10();
		return;
	}

	if (event.code === "ArrowRight") {
		event.preventDefault();
		forward10();
	}
}

onMounted(() => {
	const host = playerEl.value;
	if (!host) return;

	audioRuntime.attachStore(player);
	audioRuntime.mount(host);

	const lyricPlayer = new DomLyricPlayer();
	lyricPlayer.addEventListener("line-click", onLineClick);
	host.appendChild(lyricPlayer.getElement());
	lyricPlayerRef.value = lyricPlayer;

	mountBackground();
	applyLyricSettings();
	applyMusicSource();
	applyPlayback(player.audio.playing);
	void loadLyric();
	startFrameLoop();
	window.addEventListener("keydown", onGlobalKeyDown);
});

onBeforeUnmount(() => {
	stopFrameLoop();
	window.removeEventListener("keydown", onGlobalKeyDown);

	lyricPlayerRef.value?.removeEventListener("line-click", onLineClick);
	lyricPlayerRef.value?.dispose();
});

watch(
	() => player.source.musicUrl,
	() => applyMusicSource(),
);

watch(
	() => [
		player.source.lyricUrl,
		player.source.lyricName,
		player.source.lyricRevision,
	],
	() => void loadLyric(),
);

watch(
	() => [
		player.source.albumUrl,
		player.source.albumName,
		player.source.albumRevision,
	],
	() => void backgroundRuntime.loadAlbum(player),
);

watch(
	() => player.audio.playing,
	(playing) => applyPlayback(playing),
);

watch(
	() => player.audio.seekRevision,
	() => seekCoreToStoreTime(),
);

watch(
	() => player.background.renderer,
	() => mountBackground(),
);

watch(
	() => [
		player.background.fps,
		player.background.scale,
		player.background.flowSpeed,
		player.background.staticMode,
		player.background.playing,
		player.background.isolation.lightWave,
		player.background.isolation.dithering,
		player.background.isolation.paletteAlgorithm,
	],
	() => backgroundRuntime.applySettings(player),
);

watch(
	() => [
		player.lyric.fadeWidth,
		player.lyric.enableBlur,
		player.lyric.enableSpring,
		player.lyric.verticalSpring.mass,
		player.lyric.verticalSpring.damping,
		player.lyric.verticalSpring.stiffness,
		player.lyric.verticalSpring.soft,
		player.lyric.scaleSpring.mass,
		player.lyric.scaleSpring.damping,
		player.lyric.scaleSpring.stiffness,
		player.lyric.scaleSpring.soft,
	],
	() => applyLyricSettings(),
);
</script>

<template>
	<div class="relative w-full h-full overflow-hidden bg-black text-white select-none">
		<!-- Top Floating Apple Music Header -->
		<header class="z-20 absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-auto">
			<div
				class="flex items-center gap-3 py-1.5 px-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg max-w-[78%] cursor-pointer active:scale-98 transition"
				@click="isSearchOpen = true"
			>
				<img
					v-if="player.source.albumUrl"
					:src="player.source.albumUrl"
					class="w-8 h-8 rounded-lg object-cover shadow-sm shrink-0 border border-white/10"
				/>
				<div class="overflow-hidden">
					<div class="font-bold text-xs truncate leading-tight text-white">
						{{ player.source.musicName || 'Выберите песню' }}
					</div>
					<div class="text-[10px] text-white/50 font-medium">Apple TTML • Послогово</div>
				</div>
			</div>

			<Button
				variant="ghost"
				size="icon"
				class="w-10 h-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white hover:bg-white/20 active:scale-90 shadow-lg transition"
				@click="isSearchOpen = true"
			>
				<SearchIcon class="w-4 h-4" />
			</Button>
		</header>

		<!-- Fullscreen AMLL Lyric Player + WebGL Canvas -->
		<main
			ref="playerEl"
			id="player"
			class="absolute inset-0 overflow-hidden bg-black text-white z-0"
			:style="{
				fontFamily: player.lyric.fontFamily || undefined,
				fontWeight: player.lyric.fontWeight
			}"
		/>

		<!-- Bottom Floating Apple Music Player Pill -->
		<footer
			class="z-20 absolute bottom-5 left-4 right-4 max-w-md mx-auto flex flex-col gap-2 p-3.5 rounded-3xl bg-black/50 backdrop-blur-2xl border border-white/15 text-white shadow-2xl transition-all pointer-events-auto"
		>
			<!-- Scrubber progress bar -->
			<div class="flex flex-col gap-1">
				<div
					class="w-full h-1.5 hover:h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer transition-all relative"
					@click.stop="onProgressClick"
				>
					<div
						class="h-full bg-white rounded-full transition-all duration-75"
						:style="{ width: `${progressPercent}%` }"
					/>
				</div>
				<div class="flex items-center justify-between text-[11px] font-semibold text-white/60 tabular-nums px-0.5">
					<span>{{ formatTime(player.audio.currentTime) }}</span>
					<span>{{ formatTime(player.audio.duration) }}</span>
				</div>
			</div>

			<!-- Player Control Buttons -->
			<div class="flex items-center justify-center gap-8 py-0.5">
				<Button
					variant="ghost"
					size="icon"
					class="w-10 h-10 rounded-full text-white/80 hover:text-white hover:bg-white/20 active:scale-90 transition"
					@click.stop="rewind10"
				>
					<RotateCcw class="w-5 h-5" />
				</Button>
				<Button
					size="icon"
					class="w-14 h-14 rounded-full bg-white text-black hover:bg-white/90 active:scale-92 shadow-2xl transition flex items-center justify-center cursor-pointer"
					@click.stop="togglePlay"
				>
					<PauseIcon v-if="player.audio.playing" class="w-6 h-6 fill-current" />
					<PlayIcon v-else class="w-6 h-6 fill-current ml-0.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="w-10 h-10 rounded-full text-white/80 hover:text-white hover:bg-white/20 active:scale-90 transition"
					@click.stop="forward10"
				>
					<RotateCw class="w-5 h-5" />
				</Button>
			</div>
		</footer>

		<!-- Search & Song Selection Modal -->
		<div
			v-if="isSearchOpen"
			class="z-50 fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col justify-end p-4 animate-in fade-in duration-200"
			@click.self="isSearchOpen = false"
		>
			<div class="w-full max-w-lg mx-auto bg-zinc-900/95 border border-white/15 rounded-3xl p-5 flex flex-col gap-4 shadow-2xl">
				<div class="flex items-center justify-between">
					<h3 class="font-bold text-base text-white">Выбор трека</h3>
					<button
						class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white"
						@click="isSearchOpen = false"
					>
						<XIcon class="w-4 h-4" />
					</button>
				</div>

				<form class="flex gap-2" @submit.prevent="handleSearchSubmit">
					<input
						v-model="searchQuery"
						type="text"
						placeholder="Название песни или артист..."
						class="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-red-500"
						autofocus
					/>
					<button
						type="submit"
						class="bg-red-500 hover:bg-red-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition"
					>
						Найти
					</button>
				</form>

				<div class="flex flex-col gap-2">
					<span class="text-xs font-bold text-white/50 uppercase tracking-wider">Популярные треки:</span>
					<div class="flex flex-col gap-1.5">
						<button
							v-for="item in PRESET_TRACKS"
							:key="item.title"
							class="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition active:scale-98"
							@click="selectPresetTrack(item)"
						>
							<img :src="item.album" class="w-10 h-10 rounded-lg object-cover shadow" />
							<div class="overflow-hidden">
								<div class="font-semibold text-sm text-white truncate">{{ item.title }}</div>
								<div class="text-xs text-white/50 truncate">{{ item.artist }}</div>
							</div>
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

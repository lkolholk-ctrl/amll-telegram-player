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
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import Button from "@/components/ui/button/Button.vue";
import { extractSongwriters, parseLyricSource } from "@/lib/parse-lyric";
import { audioRuntime } from "@/runtime/audio";
import { backgroundRuntime } from "@/runtime/background";
import { usePlayerStore } from "@/stores/player";
import { SidebarTrigger } from "./ui/sidebar";

const player = usePlayerStore();
const playerEl = ref<HTMLElement | null>(null);
const lyricPlayerRef = shallowRef<DomLyricPlayer>();

let frameId = 0;
let lastFrameTime = -1;
let lyricLoadRevision = 0;

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

function onProgressClick(e: MouseEvent): void {
	const el = e.currentTarget as HTMLElement;
	if (!el || !player.audio.duration) return;
	const rect = el.getBoundingClientRect();
	const clickX = e.clientX - rect.left;
	const ratio = Math.max(0, Math.min(1, clickX / rect.width));
	player.seek(ratio * player.audio.duration);
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

		// Auto-start playback on load
		if (player.source.musicUrl && !player.audio.playing) {
			void audioRuntime.setPlaying(true);
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
		const delta = time - lastFrameTime;
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
	if (!player.audio.playing) {
		void audioRuntime.setPlaying(true);
	}
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
		player.togglePlayback();
		return;
	}

	if (event.code === "ArrowLeft") {
		event.preventDefault();
		player.seek(player.audio.currentTime - 5);
		return;
	}

	if (event.code === "ArrowRight") {
		event.preventDefault();
		player.seek(player.audio.currentTime + 5);
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
	<SidebarTrigger
		class="z-20 absolute top-3 left-3 text-white bg-black/40 hover:bg-white/20! hover:text-white rounded-full p-2 backdrop-blur-lg border border-white/10"
	/>
	<main
		ref="playerEl"
		id="player"
		class="absolute top-0 right-0 bottom-0 left-0 overflow-hidden bg-black text-white"
		:style="{
			fontFamily: player.lyric.fontFamily || undefined,
			fontWeight: player.lyric.fontWeight
		}"
	/>

	<!-- Apple Music Floating Player Pill -->
	<div
		v-if="player.source.musicUrl"
		class="z-20 absolute bottom-4 left-3 right-3 max-w-lg mx-auto flex flex-col gap-2 p-3 rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/15 text-white shadow-2xl transition-all"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-3 overflow-hidden cursor-pointer flex-1" @click="player.togglePlayback">
				<img
					v-if="player.source.albumUrl"
					:src="player.source.albumUrl"
					class="w-11 h-11 rounded-xl object-cover shadow-lg shrink-0 border border-white/10"
				/>
				<div class="overflow-hidden">
					<div class="font-bold text-sm truncate text-white">{{ player.source.musicName || 'Песня' }}</div>
					<div class="text-xs text-white/60 tabular-nums font-medium">
						{{ formatTime(player.audio.currentTime) }} / {{ formatTime(player.audio.duration) }}
					</div>
				</div>
			</div>
			<div class="flex items-center gap-2 shrink-0">
				<Button
					variant="ghost"
					size="icon"
					class="w-9 h-9 rounded-full text-white/80 hover:text-white hover:bg-white/20 active:scale-90 transition"
					@click.stop="player.seek(player.audio.currentTime - 10)"
				>
					<RotateCcw class="w-4 h-4" />
				</Button>
				<Button
					size="icon"
					class="w-11 h-11 rounded-full bg-white text-black hover:bg-white/90 active:scale-95 shadow-xl transition flex items-center justify-center cursor-pointer"
					@click.stop="player.togglePlayback"
				>
					<PauseIcon v-if="player.audio.playing" class="w-5 h-5 fill-current" />
					<PlayIcon v-else class="w-5 h-5 fill-current ml-0.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="w-9 h-9 rounded-full text-white/80 hover:text-white hover:bg-white/20 active:scale-90 transition"
					@click.stop="player.seek(player.audio.currentTime + 10)"
				>
					<RotateCw class="w-4 h-4" />
				</Button>
			</div>
		</div>
		<!-- Mini progress scrubber bar -->
		<div
			class="w-full h-1.5 bg-white/20 hover:h-2 rounded-full overflow-hidden cursor-pointer transition-all relative"
			@click.stop="onProgressClick"
		>
			<div
				class="h-full bg-white rounded-full transition-all duration-75"
				:style="{ width: `${progressPercent}%` }"
			/>
		</div>
	</div>
</template>

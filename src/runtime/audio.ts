import type { usePlayerStore } from "@/stores/player";

type PlayerStore = ReturnType<typeof usePlayerStore>;

class AudioRuntime {
	readonly audio = document.createElement("audio");
	private store: PlayerStore | undefined;
	private source = "";

	constructor() {
		this.audio.preload = "auto";
		this.audio.volume = 1.0;
		(this.audio as any).playsInline = true;
		this.audio.setAttribute("playsinline", "true");
		this.audio.setAttribute("webkit-playsinline", "true");
		this.audio.style.position = "absolute";
		this.audio.style.opacity = "0";
		this.audio.style.pointerEvents = "none";
		this.audio.style.width = "1px";
		this.audio.style.height = "1px";
		this.audio.addEventListener("play", this.onPlay);
		this.audio.addEventListener("pause", this.onPause);
		this.audio.addEventListener("ended", this.onEnded);
		this.audio.addEventListener("loadedmetadata", this.onLoadedMetadata);
		this.audio.addEventListener("durationchange", this.onLoadedMetadata);
		this.audio.addEventListener("error", this.onError);
	}

	private readonly onPlay = (): void => {
		this.store?.setPlaying(true);
	};

	private readonly onPause = (): void => {
		this.store?.setPlaying(false);
	};

	private readonly onEnded = (): void => {
		this.store?.syncCurrentTime(this.audio.duration);
		this.store?.setPlaying(false);
	};

	private readonly onLoadedMetadata = (): void => {
		if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
			this.store?.setDuration(this.audio.duration);
		}
	};

	private readonly onError = (): void => {
		console.warn("Audio element error:", this.audio.error);
		this.store?.setPlaying(false);
		this.store?.setAudioError("Ошибка загрузки аудио");
	};

	attachStore(store: PlayerStore): void {
		this.store = store;
	}

	mount(host: HTMLElement): void {
		if (this.audio.parentElement !== host) {
			host.appendChild(this.audio);
		}
	}

	setSource(source: string): void {
		const normalizedSource = source.trim();
		this.store?.setAudioError("");

		if (!normalizedSource) {
			this.source = "";
			this.audio.pause();
			this.audio.removeAttribute("src");
			this.audio.load();
			this.store?.setDuration(0);
			return;
		}

		if (this.source === normalizedSource) return;

		const shouldResume = this.store?.audio.playing ?? !this.audio.paused;
		this.source = normalizedSource;
		this.audio.src = normalizedSource;
		this.audio.load();
		if (shouldResume) void this.setPlaying(true);
	}

	async setPlaying(playing: boolean): Promise<void> {
		if (!playing) {
			this.audio.pause();
			return;
		}

		if (!this.audio.src) return;

		if (this.audio.ended) {
			this.seek(0);
		}

		try {
			const res = this.audio.play();
			if (res !== undefined) {
				await res;
			}
			this.store?.setPlaying(true);
			this.store?.setAudioError("");
		} catch (error) {
			console.warn("Audio play error:", error);
			this.store?.setPlaying(false);
		}
	}

	seek(time: number): void {
		if (Number.isFinite(time)) {
			this.audio.currentTime = Math.max(0, time);
		}
	}

	get currentTime(): number {
		return this.audio.currentTime;
	}

	get isPaused(): boolean {
		return this.audio.paused;
	}
}

type HotData = {
	audioRuntime?: AudioRuntime;
};

const hotData = import.meta.hot?.data as HotData | undefined;

export const audioRuntime = hotData?.audioRuntime ?? new AudioRuntime();

if (hotData?.audioRuntime) {
	Object.setPrototypeOf(audioRuntime, AudioRuntime.prototype);
}

if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose((data: HotData) => {
		data.audioRuntime = audioRuntime;
	});
}

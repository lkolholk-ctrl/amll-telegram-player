<script setup lang="ts">
import {
	Disc3Icon,
	FileAudioIcon,
	FileTextIcon,
	ImageIcon,
	MusicIcon,
	RefreshCwIcon,
	TextAlignStartIcon,
} from "lucide-vue-next";
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { extractCoverBlob } from "@/lib/extract-cover";
import { PRESET_TRACKS, usePlayerStore } from "@/stores/player";

const player = usePlayerStore();

const lyric = computed({
	get: () => player.source.lyricUrl,
	set: (value) => player.setLyricUrl(String(value)),
});
const music = computed({
	get: () => player.source.musicUrl,
	set: (value) => player.setMusicUrl(String(value)),
});
const album = computed({
	get: () => player.source.albumUrl,
	set: (value) => player.setAlbumUrl(String(value)),
});

function selectPreset(preset: typeof PRESET_TRACKS[0]): void {
	player.setMusicUrl(preset.audio);
	player.setAlbumUrl(preset.album);
	player.setLyricUrl(preset.lyric);
	player.source.musicName = `${preset.artist} — ${preset.title}`;
	player.source.lyricName = `${preset.title}.ttml`;
}

function openFile(accept: string, onFile: (file: File) => void): void {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = accept;
	input.onchange = () => {
		const file = input.files?.[0];
		if (file) onFile(file);
	};
	input.click();
}

async function openLocalMusicFile(file: File): Promise<void> {
	player.setLocalMusicFile(file);
	try {
		const cover = await extractCoverBlob(file);
		if (cover) {
			player.setExtractedAlbumBlob(cover, `${file.name} cover`);
		} else {
			player.clearExtractedAlbum();
		}
	} catch {
		player.clearExtractedAlbum();
	}
}
</script>

<template>
	<div class="space-y-4 py-1">
		<!-- Quick Demo Presets -->
		<section class="space-y-2">
			<h3 class="text-sm font-bold flex items-center gap-1.5 text-white">
				<Disc3Icon :size="16" />
				Популярные треки
			</h3>
			<div class="grid grid-cols-1 gap-1.5">
				<Button
					v-for="item in PRESET_TRACKS"
					:key="item.title"
					variant="outline"
					size="sm"
					class="justify-start text-xs font-semibold truncate hover:bg-white/10"
					@click="selectPreset(item)"
				>
					{{ item.artist }} — {{ item.title }}
				</Button>
			</div>
		</section>

		<Separator />

		<!-- Lyrics -->
		<section class="space-y-2.5">
			<h3 class="text-sm font-bold flex items-center gap-1 text-white">
				<TextAlignStartIcon :size="16" />
				Текст (TTML / LRC)
			</h3>
			<Input id="lyric-url" v-model="lyric" placeholder="URL текста песни" />
			<div class="grid grid-cols-2 gap-2">
				<Button
					variant="outline"
					size="sm"
					@click="openFile('.ttml,.lrc,.alrc,.yrc,.lys,.lyl,.lqe,.qrc,.eslrc', player.setLocalLyricFile)"
				>
					<FileTextIcon />
					Файл
				</Button>
				<Button variant="outline" size="sm" @click="player.reloadLyric">
					<RefreshCwIcon />
					Обновить
				</Button>
			</div>
			<p v-if="player.lyric.error" class="text-xs text-destructive">
				{{ player.lyric.error }}
			</p>
		</section>

		<Separator />

		<!-- Audio -->
		<section class="space-y-2.5">
			<h3 class="text-sm font-bold flex items-center gap-1 text-white">
				<MusicIcon :size="16" />
				Аудиодорожка
			</h3>
			<Input id="music-url" v-model="music" placeholder="URL аудиофайла" />
			<Button
				class="w-full"
				variant="outline"
				size="sm"
				@click="openFile('audio/*', openLocalMusicFile)"
			>
				<FileAudioIcon />
				Загрузить аудиофайл
			</Button>
			<p v-if="player.audio.error" class="text-xs text-destructive">
				{{ player.audio.error }}
			</p>
		</section>

		<Separator />

		<!-- Album cover -->
		<section class="space-y-2.5">
			<h3 class="text-sm font-bold flex items-center gap-1 text-white">
				<ImageIcon :size="16" />
				Обложка альбома
			</h3>
			<Input id="album-url" v-model="album" placeholder="URL изображения обложки" />
			<div class="grid grid-cols-2 gap-2">
				<Button
					variant="outline"
					size="sm"
					@click="openFile('image/*,video/*', player.setLocalAlbumFile)"
				>
					<ImageIcon />
					Файл
				</Button>
				<Button variant="outline" size="sm" @click="player.reloadAlbum">
					<RefreshCwIcon />
					Обновить
				</Button>
			</div>
			<p v-if="player.background.error" class="text-xs text-destructive">
				{{ player.background.error }}
			</p>
		</section>
	</div>
</template>

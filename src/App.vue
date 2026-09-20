<script setup lang="ts">
import LyricPlayer from "./components/MainPlayer.vue";
</script>

<template>
	<main class="w-screen h-screen overflow-hidden bg-black text-white relative">
		<LyricPlayer />
	</main>
</template>

<style>
html,
body,
#app {
	margin: 0;
	padding: 0;
	width: 100vw;
	height: 100vh;
	overflow: hidden;
	background-color: #000000;
	-webkit-tap-highlight-color: transparent;
	user-select: none;
}
</style>

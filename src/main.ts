import "@applemusic-like-lyrics/core/style.css";
import "./assets/index.tailwind.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

declare global {
	interface Window {
		Telegram?: {
			WebApp?: {
				ready: () => void;
				expand: () => void;
				setHeaderColor: (color: string) => void;
				setBackgroundColor: (color: string) => void;
				HapticFeedback?: {
					impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
					selectionChanged: () => void;
				};
			};
		};
	}
}

if (window.Telegram?.WebApp) {
	try {
		window.Telegram.WebApp.ready();
		window.Telegram.WebApp.expand();
		window.Telegram.WebApp.setHeaderColor("#000000");
		window.Telegram.WebApp.setBackgroundColor("#000000");
	} catch (e) {
		console.warn("Telegram WebApp init warning:", e);
	}
}

createApp(App).use(createPinia()).mount("#app");

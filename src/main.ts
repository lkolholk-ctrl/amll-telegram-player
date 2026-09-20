import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

import "./assets/index.tailwind.css";

declare global {
	interface Window {
		Telegram?: {
			WebApp?: {
				ready: () => void;
				expand: () => void;
				setHeaderColor: (color: string) => void;
				setBackgroundColor: (color: string) => void;
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

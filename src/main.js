import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		const swUrl = new URL('sw.js', window.location.href).toString()
		navigator.serviceWorker.register(swUrl).catch((error) => {
			console.error('Service worker registration failed:', error)
		})
	})
}

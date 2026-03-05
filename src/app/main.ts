// ABOUTME: App entry point — mounts the Svelte app to the DOM.
// ABOUTME: Imports global styles.
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;

import { writable } from 'svelte/store';

/**
 * A writable store for dispatching menu actions to the active app.
 * { appId: string, action: string }
 * Set to null after consumption.
 */
export const pendingMenuAction = writable(null);

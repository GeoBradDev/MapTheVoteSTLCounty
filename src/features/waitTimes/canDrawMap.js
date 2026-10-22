/** MapLibre GL JS needs WebGL 2. Without it, the wait times page offers no map. */
export const canDrawMap = () => typeof globalThis.WebGL2RenderingContext === 'function';

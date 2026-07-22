const STORAGE_KEY = "3dmaster-theme";

/** Inline script for the document head — prevents theme flash on load. */
export const themeInitScript = `(function(){try{var k='${STORAGE_KEY}';var t=localStorage.getItem(k)||'system';if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=d?'dark':'light';var e=document.documentElement;e.dataset.theme=r;e.dataset.themePreference=t;e.style.colorScheme=r;}catch(e){}})();`;

export { STORAGE_KEY as THEME_STORAGE_KEY };

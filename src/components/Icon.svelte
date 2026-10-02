<script>
  let { name, size = 22, ...rest } = $props();

  // 24×24, stroke icons unless the path sets its own fill.
  const PATHS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>',
    play: '<path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.3-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="5.5" y="4" width="4.5" height="16" rx="1.3" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4.5" height="16" rx="1.3" fill="currentColor" stroke="none"/>',
    prev: '<path d="M19 19.2V4.8a.8.8 0 0 0-1.25-.66L8 11.34a.8.8 0 0 0 0 1.32l9.75 7.2A.8.8 0 0 0 19 19.2z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
    next: '<path d="M5 4.8v14.4a.8.8 0 0 0 1.25.66l9.75-7.2a.8.8 0 0 0 0-1.32L6.25 4.14A.8.8 0 0 0 5 4.8z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
    rewind: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8.3"/><path d="M3 3.5v4.8h4.8"/>',
    forward: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8.3"/><path d="M21 3.5v4.8h-4.8"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    camera: '<path d="M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3.5l2-3h5l2 3H20a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/>',
    'camera-off': '<path d="M2 2l20 20"/><path d="M7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/><path d="M22 16V9a2 2 0 0 0-2-2h-3.5l-2-3h-5l-1 1.5"/><path d="M14.1 14.6a3.5 3.5 0 0 1-4.7-4.7"/>',
    flip: '<path d="M3 3v6h6"/><path d="M21 12a9 9 0 0 0-15.4-6.4L3 9"/><path d="M21 21v-6h-6"/><path d="M3 12a9 9 0 0 0 15.4 6.4L21 15"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.75-1.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    gauge: '<path d="M12 14l3.5-3.5"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".6" fill="currentColor"/><circle cx="3.5" cy="12" r=".6" fill="currentColor"/><circle cx="3.5" cy="18" r=".6" fill="currentColor"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  {...rest}
>
  {@html PATHS[name]}
</svg>

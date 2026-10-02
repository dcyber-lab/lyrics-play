<script>
  import { onMount } from 'svelte';
  import { lib, load } from './lib/store.svelte.js';
  import { wakeLock } from './lib/wakelock.svelte.js';
  import { leavePlayer } from './lib/session.svelte.js';
  import Home from './components/Home.svelte';
  import PlaylistView from './components/PlaylistView.svelte';
  import Player from './components/Player.svelte';
  import ImportView from './components/ImportView.svelte';
  import TapSync from './components/TapSync.svelte';

  let hash = $state(location.hash);

  onMount(() => {
    load();
    const onHash = () => (hash = location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });

  // #/            home
  // #/p/:id       playlist
  // #/play/:id/:i player
  // #/sync/:id/:i  tap out timings for a song
  // #/import/:code shared playlist
  const route = $derived.by(() => {
    const [name, id, i] = hash.replace(/^#\/?/, '').split('/');
    if (name === 'p' && id) return { name: 'playlist', id };
    if (name === 'play' && id) return { name: 'play', id, index: Number(i) || 0 };
    if (name === 'sync' && id) return { name: 'sync', id, index: Number(i) || 0 };
    if (name === 'import' && id) return { name: 'import', code: id };
    return { name: 'home' };
  });

  $effect(() => {
    if (route.name === 'play' || route.name === 'sync') wakeLock.enable();
    else {
      wakeLock.disable();
      leavePlayer();
    }
  });
</script>

{#if !lib.loaded}
  <div class="page muted">加载中…</div>
{:else if route.name === 'playlist'}
  <PlaylistView id={route.id} />
{:else if route.name === 'import'}
  <ImportView code={route.code} />
{:else if route.name === 'sync'}
  {#key `${route.id}/${route.index}`}
    <TapSync pid={route.id} index={route.index} />
  {/key}
{:else if route.name === 'play'}
  {#key `${route.id}/${route.index}`}
    <Player pid={route.id} index={route.index} />
  {/key}
{:else}
  <Home />
{/if}

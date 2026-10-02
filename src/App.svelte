<script>
  import { onMount } from 'svelte';
  import { lib, load } from './lib/store.svelte.js';
  import { wakeLock } from './lib/wakelock.svelte.js';
  import { leavePlayer } from './lib/session.svelte.js';
  import Home from './components/Home.svelte';
  import PlaylistView from './components/PlaylistView.svelte';
  import Player from './components/Player.svelte';

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
  const route = $derived.by(() => {
    const [name, id, i] = hash.replace(/^#\/?/, '').split('/');
    if (name === 'p' && id) return { name: 'playlist', id };
    if (name === 'play' && id) return { name: 'play', id, index: Number(i) || 0 };
    return { name: 'home' };
  });

  $effect(() => {
    if (route.name === 'play') wakeLock.enable();
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
{:else if route.name === 'play'}
  {#key `${route.id}/${route.index}`}
    <Player pid={route.id} index={route.index} />
  {/key}
{:else}
  <Home />
{/if}

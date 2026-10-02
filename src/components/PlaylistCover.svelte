<script>
  import { playlistArt } from '../lib/artwork.js';
  import Cover from './Cover.svelte';

  let { playlist, size = 56, radius = 12 } = $props();
  const art = $derived(playlistArt(playlist.songIds));
</script>

{#if art.mosaic}
  <span class="mosaic" style="width:{size}px; height:{size}px; border-radius:{radius}px">
    {#each art.mosaic as src}
      <Cover {src} seed={playlist.name} size={size / 2} radius={0} />
    {/each}
  </span>
{:else}
  <Cover src={art.photo} seed={playlist.name} {size} {radius} />
{/if}

<style>
  .mosaic {
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
    flex: none;
    box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.12);
  }
</style>

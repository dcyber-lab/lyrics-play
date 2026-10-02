<script>
  // Image with a coloured-gradient fallback (no art yet, offline, or 404).
  import { coverStyle } from '../lib/color.js';
  import Icon from './Icon.svelte';

  let { src = null, seed = '', size = 48, radius = 10, round = false, icon = 'music' } = $props();
  let failed = $state(false);
  $effect(() => {
    src; // reset when the image changes
    failed = false;
  });
</script>

<span
  class="cover"
  style="{coverStyle(seed)} width:{size}px; height:{size}px; border-radius:{round ? '50%' : `${radius}px`}"
>
  {#if src && !failed}
    <img {src} alt="" draggable="false" onerror={() => (failed = true)} />
  {:else}
    <Icon name={icon} size={Math.round(size * 0.4)} />
  {/if}
</span>

<style>
  .cover {
    position: relative;
    overflow: hidden;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>

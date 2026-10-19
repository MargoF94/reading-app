<script lang="ts">
  import { kindle, kindleStatus, sendToKindle, sentDate } from '../lib/kindle.svelte';
  import { sync } from '../lib/sync.svelte';
  import type { Item } from '../lib/types';
  import Icon from './Icon.svelte';

  // Under the Read button: whether the book is on the Kindle already, or a button to send it.
  let { item }: { item: Item } = $props();

  const status = $derived(kindleStatus(item, kindle.sending));
</script>

{#if status?.sending}
  <p class="kindle muted" role="status"><Icon name="send" size={15} /> Sending to your Kindle…</p>
{:else if status && !status.next}
  <p class="kindle on">
    <Icon name="check" size={16} /> On your Kindle{#if status.at}&nbsp;· <span class="when">{sentDate(status.at)}</span>{/if}
  </p>
{:else if status?.next && sync.config}
  {@const next = status.next}
  <button type="button" class="btn send" disabled={!navigator.onLine} onclick={() => sendToKindle(item, next)}>
    <Icon name="send" size={16} />
    {status.older ? 'Send new version' : 'Send to Kindle'}
  </button>
  {#if status.older}
    <p class="kindle muted">Your Kindle has an older version (<span class="when">{sentDate(status.older)}</span>).</p>
  {/if}
{/if}

<style>
  .kindle {
    margin: 0;
    font-size: 0.875rem;
    text-align: center;
  }

  .kindle :global(svg) {
    vertical-align: -0.15em;
  }

  .on {
    color: var(--ok);
    font-weight: 600;
  }

  .when {
    white-space: nowrap;
  }

  .send {
    width: 100%;
    padding-inline: 0.5em;
    font-size: 0.9375rem;
    white-space: normal;
  }
</style>

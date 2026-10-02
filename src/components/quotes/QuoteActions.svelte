<script lang="ts">
  import { library } from '../../lib/store.svelte';
  import { toasts } from '../../lib/toast.svelte';
  import type { Quote } from '../../lib/types';
  import Icon from '../Icon.svelte';

  // Copy, edit and remove buttons for a quote.
  let { quote, copyText, onedit }: { quote: Quote; copyText: string; onedit?: () => void } = $props();

  const short = $derived(quote.text.length > 40 ? quote.text.slice(0, 40).trimEnd() + '…' : quote.text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      toasts.show('Quote copied.');
    } catch {
      toasts.show('Couldn’t copy. Select the text and copy it instead.', 'error');
    }
  }

  async function remove() {
    if (!confirm(`Remove the quote “${short}”?`)) return;
    await library.deleteQuote(quote);
  }
</script>

<button type="button" class="btn ghost icon small" aria-label="Copy quote" title="Copy" onclick={copy}>
  <Icon name="copy" size={16} />
</button>
{#if onedit}
  <button type="button" class="btn ghost icon small" aria-label="Edit quote" onclick={onedit}>
    <Icon name="edit" size={16} />
  </button>
{/if}
<button type="button" class="btn ghost icon small" aria-label="Remove quote" onclick={remove}>
  <Icon name="trash" size={16} />
</button>

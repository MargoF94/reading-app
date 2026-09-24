<script lang="ts" module>
  export interface Option {
    value: string;
    label: string;
  }
  let uid = 0;
</script>

<script lang="ts">
  import { normalize } from '../lib/util';
  import Icon from './Icon.svelte';

  // Searchable dropdown. Single mode uses `value`, multi mode uses `values`.
  // With `oncreate`, typing a new name offers "Add “…”".
  let {
    options,
    value = undefined,
    values = [],
    multiple = false,
    placeholder = '',
    id = undefined,
    oncreate = undefined,
    onchange = undefined,
    onchangeMany = undefined,
    clearable = true,
  }: {
    options: Option[];
    value?: string;
    values?: string[];
    multiple?: boolean;
    placeholder?: string;
    id?: string;
    oncreate?: (label: string) => string | Promise<string>;
    onchange?: (value: string | undefined) => void;
    onchangeMany?: (values: string[]) => void;
    clearable?: boolean;
  } = $props();

  const listId = `cb-list-${++uid}`;
  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const selectedLabel = $derived(value ? labelOf(value) : '');

  const filtered = $derived.by(() => {
    const q = normalize(query);
    return options
      .filter((o) => !multiple || !values.includes(o.value))
      .filter((o) => !q || normalize(o.label).includes(q))
      .slice(0, 60);
  });

  const canCreate = $derived(
    !!oncreate && query.trim() !== '' && !options.some((o) => normalize(o.label) === normalize(query)),
  );
  const count = $derived(filtered.length + (canCreate ? 1 : 0));

  async function choose(index: number) {
    let v: string;
    if (index < filtered.length) v = filtered[index].value;
    else if (canCreate) v = await oncreate!(query.trim());
    else return;
    if (multiple) {
      onchangeMany?.([...values, v]);
      query = '';
      active = 0;
    } else {
      onchange?.(v);
      query = '';
      open = false;
      input?.blur();
    }
  }

  function removeAt(i: number) {
    onchangeMany?.(values.filter((_, j) => j !== i));
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      active = Math.min(active + 1, count - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      if (open && count > 0) {
        e.preventDefault();
        void choose(active);
      }
    } else if (e.key === 'Escape') {
      open = false;
    } else if (e.key === 'Backspace' && multiple && query === '' && values.length) {
      removeAt(values.length - 1);
    }
  }
</script>

<div class="combo" class:multiple>
  <div class="control">
    {#if multiple}
      {#each values as v, i (v)}
        <span class="chip">
          {labelOf(v)}
          <button type="button" class="x" aria-label="Remove {labelOf(v)}" onclick={() => removeAt(i)}>
            <Icon name="close" size={14} />
          </button>
        </span>
      {/each}
    {/if}
    <input
      bind:this={input}
      {id}
      type="text"
      role="combobox"
      autocomplete="off"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && count ? `${listId}-${active}` : undefined}
      placeholder={multiple ? (values.length ? '' : placeholder) : selectedLabel || placeholder}
      class:has-value={!multiple && !!value}
      value={open || multiple ? query : selectedLabel}
      oninput={(e) => {
        query = e.currentTarget.value;
        open = true;
        active = 0;
      }}
      onfocus={() => {
        open = true;
        query = '';
        active = 0;
      }}
      onblur={() => {
        open = false;
        query = '';
      }}
      onkeydown={keydown}
    />
    {#if !multiple && value && clearable}
      <button type="button" class="clear" aria-label="Clear" onclick={() => onchange?.(undefined)}>
        <Icon name="close" size={16} />
      </button>
    {/if}
  </div>
  {#if open && count > 0}
    <ul class="menu" id={listId} role="listbox">
      {#each filtered as o, i (o.value)}
        <li
          id="{listId}-{i}"
          role="option"
          aria-selected={i === active}
          class:active={i === active}
          onpointerdown={(e) => {
            e.preventDefault();
            void choose(i);
          }}
        >
          {o.label}
        </li>
      {/each}
      {#if canCreate}
        <li
          id="{listId}-{filtered.length}"
          role="option"
          aria-selected={active === filtered.length}
          class="create"
          class:active={active === filtered.length}
          onpointerdown={(e) => {
            e.preventDefault();
            void choose(filtered.length);
          }}
        >
          Add “{query.trim()}”
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .combo {
    position: relative;
  }

  .control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    position: relative;
  }

  .multiple .control {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    padding: 0.3rem;
    min-height: 42px;
  }

  .multiple .control:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }

  .multiple input {
    border: none;
    outline: none;
    min-height: 30px;
    padding: 0.2em 0.4em;
    flex: 1;
    min-width: 8em;
    width: auto;
  }

  .combo:not(.multiple) input {
    padding-right: 2.2em;
  }

  input.has-value::placeholder {
    color: var(--text);
  }

  .clear {
    position: absolute;
    right: 4px;
    top: 50%;
    translate: 0 -50%;
    border: none;
    background: none;
    color: var(--text-2);
    padding: 6px;
    display: flex;
  }

  .chip {
    padding-right: 0.2em;
  }

  .x {
    border: none;
    background: none;
    color: var(--text-2);
    padding: 2px;
    display: flex;
    border-radius: 50%;
  }

  .menu {
    position: absolute;
    z-index: 30;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    max-height: 260px;
    overflow-y: auto;
  }

  li {
    padding: 0.5em 0.7em;
    border-radius: 4px;
    cursor: pointer;
  }

  li.active {
    background: var(--accent-soft);
  }

  .create {
    color: var(--accent);
    font-weight: 600;
  }
</style>

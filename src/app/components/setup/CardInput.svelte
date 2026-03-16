<!-- ABOUTME: Input for a single card slot rendered as a card shape. -->
<!-- ABOUTME: Accepts single-char keypresses (1-9, A/a/0=10) and advances focus automatically. -->
<script lang="ts">
  import { createCard, CardType, type Card } from '../../../engine';

  let {
    onchange,
    onadvance = () => {},
    onback = () => {},
    allowUnknown = false,
  }: {
    onchange: (card: Card | null) => void;
    onadvance?: () => void;
    onback?: () => void;
    allowUnknown?: boolean;
  } = $props();

  let values = $state<(number | null)[]>([null, null, null, null]);
  let type = $state<CardType>(CardType.None);
  let inputEls: HTMLInputElement[] = $state([]);
  let isUnknown = $state(false);

  function displayValue(v: number | null): string {
    if (v === null) return '';
    return v === 10 ? 'A' : String(v);
  }

  function parseKey(key: string): number | null {
    if (key >= '1' && key <= '9') return parseInt(key);
    if (key === '0' || key === 'a' || key === 'A') return 10;
    return null;
  }

  function toggleUnknown() {
    isUnknown = !isUnknown;
    if (isUnknown) {
      values = [null, null, null, null];
      onchange(null);
    }
  }

  function emit() {
    if (isUnknown) { onchange(null); return; }
    const [t, r, b, l] = values;
    if (t !== null && r !== null && b !== null && l !== null) {
      onchange(createCard(t, r, b, l, type));
    } else {
      onchange(null);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent) {
    if (allowUnknown && e.key === ' ') {
      e.preventDefault();
      isUnknown = true;
      onchange(null);
      onadvance();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      values[index] = null;
      emit();
      if (index > 0) {
        inputEls[index - 1]?.focus();
      } else {
        onback();
      }
      return;
    }
    const parsed = parseKey(e.key);
    if (parsed === null) return;
    e.preventDefault();
    values[index] = parsed;
    emit();
    if (index < 3) {
      inputEls[index + 1]?.focus();
    } else {
      onadvance();
    }
  }

  function onTypeChange(e: Event) {
    type = (e.target as HTMLSelectElement).value as CardType;
    emit();
  }

  export function focusFirst() {
    inputEls[0]?.focus();
  }

  export function focusLast() {
    inputEls[3]?.focus();
  }
</script>

<!-- Card-shaped container: fixed size, bordered, relative for type dropdown positioning -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  tabindex="-1"
  class="relative w-36 h-36 bg-gradient-to-b from-surface-700 to-surface-800 border border-surface-600 hover:border-surface-500 rounded-lg p-1 flex flex-col
  {isUnknown ? 'opacity-60 border-dashed' : ''}"
  onclick={(e) => {
    if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      inputEls[0]?.focus();
    }
  }}>
  <!-- Type dropdown at top-right (hidden when unknown) -->
  {#if !isUnknown}
    <div class="absolute top-1 right-1">
      <select
        value={type}
        onchange={onTypeChange}
        class="bg-surface-700 border border-surface-600 rounded text-xs text-surface-400 p-0.5 w-14"
      >
        {#each Object.values(CardType) as ct}
          <option value={ct}>{ct}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- Unknown toggle at top-left (when allowUnknown) -->
  {#if allowUnknown}
    <div class="absolute top-1 left-1">
      <button
        aria-label="Toggle unknown"
        onclick={toggleUnknown}
        class="text-xs px-1 rounded border
          {isUnknown ? 'bg-accent-blue border-accent-blue text-white' : 'border-surface-500 text-surface-400 hover:border-accent-blue'}"
      >?</button>
    </div>
  {/if}

  <!-- Cross layout for directional values (or ? placeholder when unknown) -->
  {#if isUnknown}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-3xl font-bold text-surface-400">?</span>
    </div>
  {:else}
    <div class="flex-1 grid grid-cols-3 grid-rows-3 items-center justify-items-center">
      <!-- Row 1: [empty] [top] [empty] -->
      <div></div>
      <input
        aria-label="Top"
        type="text"
        inputmode="numeric"
        maxlength="1"
        readonly
        placeholder="·"
        value={displayValue(values[0] ?? null)}
        onkeydown={(e) => handleKeyDown(0, e)}
        bind:this={inputEls[0]}
        class="w-8 h-8 text-center bg-surface-700 border border-surface-600 rounded text-base font-bold font-mono text-surface-300 cursor-default focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue placeholder:text-surface-600"
      />
      <div></div>
      <!-- Row 2: [left] [empty] [right] -->
      <input
        aria-label="Left"
        type="text"
        inputmode="numeric"
        maxlength="1"
        readonly
        placeholder="·"
        value={displayValue(values[3] ?? null)}
        onkeydown={(e) => handleKeyDown(3, e)}
        bind:this={inputEls[3]}
        class="w-8 h-8 text-center bg-surface-700 border border-surface-600 rounded text-base font-bold font-mono text-surface-300 cursor-default focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue placeholder:text-surface-600"
      />
      <div></div>
      <input
        aria-label="Right"
        type="text"
        inputmode="numeric"
        maxlength="1"
        readonly
        placeholder="·"
        value={displayValue(values[1] ?? null)}
        onkeydown={(e) => handleKeyDown(1, e)}
        bind:this={inputEls[1]}
        class="w-8 h-8 text-center bg-surface-700 border border-surface-600 rounded text-base font-bold font-mono text-surface-300 cursor-default focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue placeholder:text-surface-600"
      />
      <!-- Row 3: [empty] [bottom] [empty] -->
      <div></div>
      <input
        aria-label="Bottom"
        type="text"
        inputmode="numeric"
        maxlength="1"
        readonly
        placeholder="·"
        value={displayValue(values[2] ?? null)}
        onkeydown={(e) => handleKeyDown(2, e)}
        bind:this={inputEls[2]}
        class="w-8 h-8 text-center bg-surface-700 border border-surface-600 rounded text-base font-bold font-mono text-surface-300 cursor-default focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue placeholder:text-surface-600"
      />
      <div></div>
    </div>
  {/if}
</div>

<!-- ABOUTME: Input for a single card slot — four directional values and a card type. -->
<!-- ABOUTME: Calls onchange with a Card when all fields are filled, or null otherwise. -->
<script lang="ts">
  import { createCard, CardType, type Card } from '../../../engine';

  let { onchange }: { onchange: (card: Card | null) => void } = $props();

  let top = $state('');
  let right = $state('');
  let bottom = $state('');
  let left = $state('');
  let type = $state<CardType>(CardType.None);

  function emitFromValues(t: string, r: string, b: string, l: string, ty: CardType) {
    const tv = parseInt(t);
    const rv = parseInt(r);
    const bv = parseInt(b);
    const lv = parseInt(l);
    if ([tv, rv, bv, lv].some((v) => isNaN(v) || v < 1 || v > 10)) {
      onchange(null);
    } else {
      onchange(createCard(tv, rv, bv, lv, ty));
    }
  }

  function onTopChange(e: Event) {
    top = (e.target as HTMLInputElement).value;
    emitFromValues(top, right, bottom, left, type);
  }
  function onRightChange(e: Event) {
    right = (e.target as HTMLInputElement).value;
    emitFromValues(top, right, bottom, left, type);
  }
  function onBottomChange(e: Event) {
    bottom = (e.target as HTMLInputElement).value;
    emitFromValues(top, right, bottom, left, type);
  }
  function onLeftChange(e: Event) {
    left = (e.target as HTMLInputElement).value;
    emitFromValues(top, right, bottom, left, type);
  }
  function onTypeChange(e: Event) {
    type = (e.target as HTMLSelectElement).value as CardType;
    emitFromValues(top, right, bottom, left, type);
  }
</script>

<div class="grid grid-cols-3 gap-1 text-sm">
  <div></div>
  <input aria-label="Top" type="number" min="1" max="10"
    value={top} oninput={onTopChange} onchange={onTopChange}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <div></div>

  <input aria-label="Left" type="number" min="1" max="10"
    value={left} oninput={onLeftChange} onchange={onLeftChange}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <select value={type} onchange={onTypeChange}
    class="bg-gray-700 rounded border border-gray-600 p-1 text-xs">
    {#each Object.values(CardType) as ct}
      <option value={ct}>{ct}</option>
    {/each}
  </select>
  <input aria-label="Right" type="number" min="1" max="10"
    value={right} oninput={onRightChange} onchange={onRightChange}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />

  <div></div>
  <input aria-label="Bottom" type="number" min="1" max="10"
    value={bottom} oninput={onBottomChange} onchange={onBottomChange}
    class="w-10 text-center bg-gray-700 rounded border border-gray-600 p-1" />
  <div></div>
</div>

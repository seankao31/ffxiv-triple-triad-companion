<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same, Reverse, Fallen Ace, Ascension, Descension, Order, Swap, Three Open, All Open). -->
<!-- ABOUTME: Updates the ruleset and format flags in the central game store on change. -->
<script lang="ts">
  import { game, updateRuleset, updateSwap, updateThreeOpen, updateAllOpen } from '../../store';

  let plus = $state($game.ruleset.plus);
  let same = $state($game.ruleset.same);
  let reverse = $state($game.ruleset.reverse);
  let fallenAce = $state($game.ruleset.fallenAce);
  let ascension = $state($game.ruleset.ascension);
  let descension = $state($game.ruleset.descension);
  let order = $state($game.ruleset.order);
  let swap = $state($game.swap);
  let threeOpen = $state($game.threeOpen);
  let allOpen = $state($game.allOpen);

  function updateRules() {
    updateRuleset({ plus, same, reverse, fallenAce, ascension, descension, order });
  }

  function ruleChanged(setter: (v: boolean) => void) {
    return (v: boolean) => { setter(v); updateRules(); };
  }
</script>

<div class="flex gap-4">
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => plus,
      ruleChanged((v) => plus = v)
    } class="accent-accent-blue" />
    Plus
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => same,
      ruleChanged((v) => same = v)
    } class="accent-accent-blue" />
    Same
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => reverse,
      ruleChanged((v) => reverse = v)
    } class="accent-accent-blue" />
    Reverse
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => fallenAce,
      ruleChanged((v) => fallenAce = v)
    } class="accent-accent-blue" />
    Fallen Ace
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => ascension,
      ruleChanged((v) => ascension = v)
    } class="accent-accent-blue" />
    Ascension
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => descension,
      ruleChanged((v) => descension = v)
    } class="accent-accent-blue" />
    Descension
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => order,
      ruleChanged((v) => order = v)
    } class="accent-accent-blue" />
    Order
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => swap,
      (v) => { swap = v; updateSwap(swap); }
    } class="accent-accent-blue" />
    Swap
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => threeOpen,
      (v) => { threeOpen = v; updateThreeOpen(threeOpen); if (threeOpen) allOpen = false; }
    } class="accent-accent-blue" />
    Three Open
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={
      () => allOpen,
      (v) => { allOpen = v; updateAllOpen(allOpen); if (allOpen) threeOpen = false; }
    } class="accent-accent-blue" />
    All Open
  </label>
</div>

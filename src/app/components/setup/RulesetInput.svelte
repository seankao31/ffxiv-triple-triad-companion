<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same, Reverse, Fallen Ace, Ascension, Descension, Swap, Three Open). -->
<!-- ABOUTME: Updates the ruleset and format flags in the central game store on change. -->
<script lang="ts">
  import { game, updateRuleset, updateSwap, updateThreeOpen } from '../../store';

  let plus = $state($game.ruleset.plus);
  let same = $state($game.ruleset.same);
  let reverse = $state($game.ruleset.reverse);
  let fallenAce = $state($game.ruleset.fallenAce);
  let ascension = $state($game.ruleset.ascension);
  let descension = $state($game.ruleset.descension);
  let swap = $state($game.swap);
  let threeOpen = $state($game.threeOpen);

  function updateRules() {
    updateRuleset({ plus, same, reverse, fallenAce, ascension, descension });
  }
</script>

<div class="flex gap-4">
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={plus} onchange={updateRules} class="accent-accent-blue" />
    Plus
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={same} onchange={updateRules} class="accent-accent-blue" />
    Same
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={reverse} onchange={updateRules} class="accent-accent-blue" />
    Reverse
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={fallenAce} onchange={updateRules} class="accent-accent-blue" />
    Fallen Ace
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={ascension} onchange={updateRules} class="accent-accent-blue" />
    Ascension
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={descension} onchange={updateRules} class="accent-accent-blue" />
    Descension
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={swap} onchange={() => updateSwap(swap)} class="accent-accent-blue" />
    Swap
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={threeOpen} onchange={() => updateThreeOpen(threeOpen)} class="accent-accent-blue" />
    Three Open
  </label>
</div>

<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same, Reverse, Fallen Ace, Ascension, Descension). -->
<!-- ABOUTME: Updates the ruleset in the central game store on change. -->
<script lang="ts">
  import { game, updateRuleset } from '../../store';

  let plus = $state($game.ruleset.plus);
  let same = $state($game.ruleset.same);
  let reverse = $state($game.ruleset.reverse);
  let fallenAce = $state($game.ruleset.fallenAce);
  let ascension = $state($game.ruleset.ascension);
  let descension = $state($game.ruleset.descension);

  function update() {
    updateRuleset({ plus, same, reverse, fallenAce, ascension, descension });
  }
</script>

<div class="flex gap-4">
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={plus} onchange={update} class="accent-accent-blue" />
    Plus
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={same} onchange={update} class="accent-accent-blue" />
    Same
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={reverse} onchange={update} class="accent-accent-blue" />
    Reverse
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={fallenAce} onchange={update} class="accent-accent-blue" />
    Fallen Ace
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={ascension} onchange={update} class="accent-accent-blue" />
    Ascension
  </label>
  <label class="flex items-center gap-2 text-sm font-semibold tracking-wide cursor-pointer">
    <input type="checkbox" bind:checked={descension} onchange={update} class="accent-accent-blue" />
    Descension
  </label>
</div>

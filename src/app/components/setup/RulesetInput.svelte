<!-- ABOUTME: Checkbox inputs for selecting the active ruleset (Plus, Same). -->
<!-- ABOUTME: Updates the ruleset in the central game store on change. -->
<script lang="ts">
  import { game, updateRuleset } from '../../store';

  let plus = $state($game.ruleset.plus);
  let same = $state($game.ruleset.same);

  function update() {
    updateRuleset({ plus, same });
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
</div>

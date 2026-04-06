<!-- ABOUTME: Displays which rules are active during a game as an inline text list. -->
<!-- ABOUTME: Shows "No active rules" when no capture or format rules are enabled. -->
<script lang="ts">
  import { game } from '../../store';
  import type { RuleSet } from '../../../engine';

  const ruleLabels: [key: keyof RuleSet, label: string][] = [
    ['plus', 'Plus'],
    ['same', 'Same'],
    ['reverse', 'Reverse'],
    ['fallenAce', 'Fallen Ace'],
    ['ascension', 'Ascension'],
    ['descension', 'Descension'],
  ];

  let activeRules = $derived.by(() => {
    const names: string[] = [];
    for (const [key, label] of ruleLabels) {
      if ($game.ruleset[key]) names.push(label);
    }
    if ($game.swap) names.push('Swap');
    if ($game.threeOpen) names.push('Three Open');
    return names;
  });
</script>

<div class="text-sm text-surface-400 text-center">
  {activeRules.length > 0 ? activeRules.join(' · ') : 'No active rules'}
</div>

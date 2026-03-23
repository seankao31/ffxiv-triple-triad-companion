<!-- ABOUTME: Minimal solver backend selector: WASM (default) or native server. -->
<!-- ABOUTME: Server mode requires the engine-rs binary running locally at the configured URL. -->
<script lang="ts">
  import { solverMode, serverEndpoint, updateSolverMode, updateServerEndpoint } from '../../store';

  const DEFAULT_SERVER_URL = 'http://127.0.0.1:8080';

  let endpointInput = $state($serverEndpoint);

  function handleModeChange(mode: 'wasm' | 'server') {
    updateSolverMode(mode);
    if (mode === 'server' && !endpointInput) {
      endpointInput = DEFAULT_SERVER_URL;
      updateServerEndpoint(DEFAULT_SERVER_URL);
    }
  }

  function handleEndpointBlur() {
    updateServerEndpoint(endpointInput.trim());
  }
</script>

<fieldset class="flex flex-col gap-3 border-t border-surface-700 pt-4 w-full">
  <legend class="text-sm font-semibold text-surface-400">Solver Backend</legend>

  <div class="flex gap-6 items-center justify-center">
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="radio"
        name="solverMode"
        value="wasm"
        checked={$solverMode === 'wasm'}
        onchange={() => handleModeChange('wasm')}
      />
      WASM (in-browser)
    </label>
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="radio"
        name="solverMode"
        value="server"
        checked={$solverMode === 'server'}
        onchange={() => handleModeChange('server')}
      />
      Native server
    </label>
  </div>

  {#if $solverMode === 'server'}
    <div class="flex items-center gap-2 justify-center">
      <label class="text-sm text-surface-400" for="server-endpoint">Server URL</label>
      <input
        id="server-endpoint"
        type="text"
        class="px-2 py-1 text-sm bg-surface-800 border border-surface-600 rounded w-56"
        placeholder="http://localhost:8080"
        bind:value={endpointInput}
        onblur={handleEndpointBlur}
      />
    </div>
  {/if}
</fieldset>

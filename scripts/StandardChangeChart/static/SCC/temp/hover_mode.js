// Activate hover mode on the chart with crosshair (spike lines)
// mode options: 'closest' | 'x' | 'y' | 'x unified' | 'y unified' | false
function activateHoverMode(mode = 'x') {
  const chartDiv = document.getElementById('chart');

  if (!chartDiv) {
    console.error('Chart not initialized');
    return false;
  }

  // Validate mode
  const validModes = ['closest', 'x', 'y', 'x unified', 'y unified', false];
  if (!validModes.includes(mode)) {
    console.error(`Invalid hover mode: ${mode}. Valid modes are: ${validModes.join(', ')}`);
    return false;
  }

  // Update the layout with hover mode and crosshair (spike lines)
  Plotly.relayout(chartDiv, {
    'hovermode': mode,
    'xaxis.showspikes': true,
    'xaxis.spikemode': 'across',
    'xaxis.spikethickness': 1,
    'xaxis.spikecolor': '#999999',
    'xaxis.spikedash': 'solid',
    'yaxis.showspikes': true,
    'yaxis.spikemode': 'across',
    'yaxis.spikethickness': 1,
    'yaxis.spikecolor': '#999999',
    'yaxis.spikedash': 'solid'
  });

  console.log(`Hover mode set to: ${mode} with crosshair`);
  return true;
}

// Toggle hover mode on/off
function toggleHoverMode() {
  const chartDiv = document.getElementById('chart');

  if (!chartDiv || !chartDiv.layout) {
    console.error('Chart not initialized');
    return false;
  }

  const currentMode = chartDiv.layout.hovermode;
  const newMode = (!currentMode || currentMode === false) ? 'x' : false;

  return activateHoverMode(newMode);
}

// Set specific hover comparison mode
function setHoverCompareMode(axis = 'x') {
  if (axis !== 'x' && axis !== 'y') {
    console.error('Axis must be "x" or "y"');
    return false;
  }

  return activateHoverMode(`${axis} unified`);
}
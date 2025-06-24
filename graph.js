import { UnrealBloomPass } from 'https://esm.sh/three/examples/jsm/postprocessing/UnrealBloomPass.js';

const tooltip = document.getElementById('tooltip');

const colorMap = {
  1: 'magenta',
  2: 'orange',
  3: 'darkblue',
  4: 'darkgreen'
};


fetch('../assets/samplenodes.json')
  .then(res => res.json())
  .then(data => {
    const Graph = ForceGraph3D()
      (document.getElementById('3d-graph'))
      .graphData(data)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalParticles("value")
      .linkDirectionalParticleSpeed(d => 0.001)
      .linkColor(link => colorMap[link.value])
      .nodeLabel(node => node.id)
      .onNodeHover(node => {
        if (node) {
          const connections = data.links
            .filter(l => l.source === node.id)
            .map(l => l.target);
          tooltip.innerHTML = `<strong>${node.id}</strong><br>→ ${connections.join(', ')}`;
          tooltip.style.display = 'block';
        } else {
          tooltip.style.display = 'none';
        }
      });

    const bloomPass = new UnrealBloomPass();
    bloomPass.strength = 2;
    bloomPass.radius = 1;
    bloomPass.threshold = 0;
    Graph.postProcessingComposer().addPass(bloomPass);
    const sum = data.links.reduce((acc, link) => acc + link.value, 0);
    const avg = (sum / data.links.length).toFixed(0);
    document.getElementById('interaction_style').textContent = `Style: ${avg}`;
    const avgValue = Math.round(avg); // Convert 2.13 -> 2
    const mappedColor = colorMap[avgValue] || 'black'; // fallback if not 1–4

    const el = document.getElementById('interaction_style');
    el.style.color = mappedColor;
  });


// Make tooltip follow the mouse
document.addEventListener('mousemove', (event) => {
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
});

import { UnrealBloomPass } from 'https://esm.sh/three/examples/jsm/postprocessing/UnrealBloomPass.js';

const tooltip = document.getElementById('tooltip');

const colorMap = {
  1: 'magenta',
  2: 'orange',
  3: 'darkblue',
  4: 'darkgreen'
};


const Graph = ForceGraph3D()
  (document.body)
  .jsonUrl('../assets/samplenodes.json')
  .linkDirectionalArrowLength(4)
  .linkDirectionalArrowRelPos(1)
  .linkDirectionalParticles("value")
  .linkDirectionalParticleSpeed(d => 0.001)
  .linkColor(link => colorMap[link.value])
  .nodeLabel(node => node.id)
  .onNodeHover(node => {
    if (node) {
      const connections = Graph.graphData().links
        .filter(l => l.source.id === node.id)
        .map(l => l.target.id);
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

// Make tooltip follow the mouse
document.addEventListener('mousemove', (event) => {
  tooltip.style.left = `${event.clientX + 12}px`;
  tooltip.style.top = `${event.clientY + 12}px`;
});

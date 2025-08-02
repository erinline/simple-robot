import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.117.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.update();

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 1));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);
scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6));

// Sky
const skyGeo = new THREE.SphereGeometry(500, 32, 15);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0xfff1c1) },
    bottomColor: { value: new THREE.Color(0xb0d9ff) },
    offset: { value: 33 },
    exponent: { value: 0.6 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Variables
let beanmodel;
let mixer;
let clock = new THREE.Clock();
let lookLRAction, walkAction, wobbleAction;
let mouseInScene = false;
let lastLookTime = 0;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let targetPosition = new THREE.Vector3();

function convertToYukaNavMesh(geometry) {
    const pos = geometry.attributes.position.array;
    const index = geometry.index ? geometry.index.array : null;

    const vertices = [];
    const regions = [];

    // Build vertex list
    for (let i = 0; i < pos.length; i += 3) {
        vertices.push({ x: pos[i], y: pos[i + 1], z: pos[i + 2] });
    }

    // Build regions (triangles)
    if (index) {
        for (let i = 0; i < index.length; i += 3) {
            regions.push({ vertices: [index[i], index[i + 1], index[i + 2]] });
        }
    } else {
        for (let i = 0; i < vertices.length; i += 3) {
            regions.push({ vertices: [i, i + 1, i + 2] });
        }
    }

    return { vertices, regions };
}

function getHeightAtPosition(mesh, x, z) {
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    raycaster.set(new THREE.Vector3(x, 100, z), down); // start high above
    const intersects = raycaster.intersectObject(mesh, true);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}

// Load model
const loader = new GLTFLoader();
let navmesh;
// Load NavMesh
loader.load('assets/navmesh.gltf', (gltf) => {
    navmesh = gltf.scene.children[0];  // Assuming your navmesh is the first mesh
    const geometry = navmesh.geometry;
    navmesh.material = new THREE.MeshStandardMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.5, transparent: true }); 
    scene.add(navmesh);

    // Convert geometry to a Yuka-compatible navmesh JSON
    const json = convertToYukaNavMesh(geometry);
});

loader.load('assets/lowpolybennybean.glb', (gltf) => {
  beanmodel = gltf.scene;
  beanmodel.position.set(0, 0, 0);
  scene.add(beanmodel);

    // Wait a tick for world matrices to update
    setTimeout(() => {
        if (navmesh) {
            navmesh.updateMatrixWorld(true);
            const y = getHeightAtPosition(navmesh, 0, 0); // get height under (0,0)
            beanmodel.position.set(0, y + 0.01, 0);
        }
    }, 50);

  mixer = new THREE.AnimationMixer(beanmodel);
  gltf.animations.forEach((clip) => {
    if (clip.name.toLowerCase().includes('looklr')) {
        lookLRAction = mixer.clipAction(clip);
        lookLRAction.setLoop(THREE.LoopOnce, 1);
        lookLRAction.clampWhenFinished = true;
    } else if (clip.name.toLowerCase() === ('wobble')) {
        wobbleAction = mixer.clipAction(clip);
        wobbleAction.setLoop(THREE.LoopOnce, 1);
        wobbleAction.clampWhenFinished = true;
    }
  });

  console.log('Animations loaded:', gltf.animations.map(a => a.name));
});

// Mouse move listener
renderer.domElement.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseInScene = true;
});
renderer.domElement.addEventListener('mouseleave', () => {
  mouseInScene = false;
});

// Animate
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  // Handle animation logic
  if (beanmodel && mixer) {
    if (mouseInScene) {
        if (wobbleAction && !wobbleAction.isRunning()) {
            wobbleAction.reset()
                .setLoop(THREE.LoopOnce, 1)
                .setDuration(2)
                .clampWhenFinished = true;
            wobbleAction.play();
            if (lookLRAction) lookLRAction.fadeOut(0.2);
        }
    } else {
        if (clock.elapsedTime - lastLookTime > 5) {
            if (lookLRAction) {
                lookLRAction.reset().fadeIn(0.3).play();
                if (wobbleAction) wobbleAction.fadeOut(0.2);
            }
            lastLookTime = clock.elapsedTime;
        }
    }

  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

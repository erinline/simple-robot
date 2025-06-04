import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.117.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/OrbitControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // smooth motion
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0); // where the camera looks
controls.update();

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambient);

// Load the street world
const loader = new GLTFLoader();
loader.load('assets/world.glb', gltf => {
  scene.add(gltf.scene);
});

// Load and animate robot
// let robot;
// loader.load('assets/robot.glb', gltf => {
//   robot = gltf.scene;
//   robot.position.set(-2, 0, 0);
//   scene.add(robot);
// });

// let direction = 1;
function animate() {
  requestAnimationFrame(animate);
//   if (robot) {
//     robot.position.x += 0.01 * direction;
//     if (robot.position.x > 2 || robot.position.x < -2) direction *= -1;
//   }
  controls.update();
  renderer.render(scene, camera);
}
animate();

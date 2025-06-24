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

// Animation-related variables
let foxModel = null;
let tailBone = null;
let leftLeg = null;
let rightLeg = null;
let leftArm = null;
let rightArm = null;
let walkTime = 0;

// Load fox model
const loader = new GLTFLoader();
loader.load('assets/foxrig.glb', (gltf) => {
  foxModel = gltf.scene;
  foxModel.position.set(0, 0, 0);
  scene.add(foxModel);

  foxModel.traverse((obj) => {
    if (obj.isSkinnedMesh && obj.skeleton) {
      obj.skeleton.bones.forEach(bone => {
        const name = bone.name.toLowerCase();
        console.log(bone.name);
        if (name.toLowerCase().includes('tail')) tailBone = bone;
        else if (name.includes('shoulderl')) leftArm = bone;
        else if (name.includes('shoulderr')) rightArm = bone;
        else if (name.includes('thighl')) leftLeg = bone;
        else if (name.includes('thighr')) rightLeg = bone;
      });
    }
  });
});

// Animate everything
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  walkTime += 0.05;

//   if (foxModel) foxModel.position.z -= 0.01;

  if (tailBone) tailBone.rotation.y = Math.sin(walkTime * 2) * 0.5;

  const swing = Math.sin(walkTime) * 0.5;

  if (leftLeg)  leftLeg.rotation.x = -Math.PI * 0.5 + swing;
  if (rightLeg) rightLeg.rotation.x = -Math.PI * 0.5 -swing;
  if (leftArm)  leftArm.rotation.x = -Math.PI * 0.5 - swing * 0.5;
  if (rightArm) rightArm.rotation.x = -Math.PI * 0.5 + swing * 0.5;

  renderer.render(scene, camera);
}
animate();

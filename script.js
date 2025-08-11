import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.117.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/OrbitControls.js';
import * as YUKA from 'https://cdn.jsdelivr.net/npm/yuka/build/yuka.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/PointerLockControls.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/RGBELoader.js';

let entityManager = new YUKA.EntityManager();
let vehicle;
let yukaNavMesh;

let planeMesh;
let beanmodel, mixer, wobbleAction;
const clock = new THREE.Clock();

const MODEL_FORWARD = new THREE.Vector3(0, 0, -1); // change if your GLB faces +Z

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

// HDR for environment lighting
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
new RGBELoader()
    .setDataType(THREE.UnsignedByteType)
    .load('assets/skyline.hdr', (hdrEquirect) => {
        const envMap = pmremGenerator.fromEquirectangular(hdrEquirect).texture;
        scene.environment = envMap;
        scene.background = envMap;
        hdrEquirect.dispose();
        pmremGenerator.dispose();
    });

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);
scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6));

// === Controls: Orbit (default) + PointerLock (toggle with Tab) ===
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.minPolarAngle = 0;
orbit.maxPolarAngle = Math.PI / 2.05;
orbit.enableDamping = true;
orbit.dampingFactor = 0.05;
orbit.target.set(0, 0, 0);
orbit.update();

const look = new PointerLockControls(camera, document.body); // used only for yaw/pitch in PILOT mode

let mode = 'ORBIT'; // 'ORBIT' | 'PILOT'
function setMode(next) {
    if (next === mode) return;
    mode = next;

    if (mode === 'PILOT') {
        orbit.enabled = false;
        // Lock pointer (user gesture needed in most browsers; fallback handled on click)
        look.lock();
    } else {
        // Back to orbit
        look.unlock();
        orbit.enabled = true;
        // Snap orbit target to bunny if available
        if (beanmodel) {
            orbit.target.copy(beanmodel.position);
            orbit.update();
        }
    }
}

// Lock only does anything meaningful when in PILOT mode
document.body.addEventListener('click', () => {
    if (mode === 'PILOT' && !look.isLocked) look.lock();
});

// Tab toggles modes
window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        setMode(mode === 'ORBIT' ? 'PILOT' : 'ORBIT');
    }
});

// Movement keys (active only in PILOT mode)
const keys = { w: false, a: false, s: false, d: false };
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = true;
});
window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k in keys) keys[k] = false;
});

const moveSpeed = 4; // m/s

// Clamp position to navmesh plane
function clampToNavMesh(pos) {
    if (!planeMesh) return pos;
    const raycaster = new THREE.Raycaster(
        new THREE.Vector3(pos.x, pos.y + 20, pos.z),
        new THREE.Vector3(0, -1, 0)
    );
    const hit = raycaster.intersectObject(planeMesh, true);
    return hit.length ? hit[0].point : pos;
}

// Load plane (visualized wireframe) as the walkable
const gltf = new GLTFLoader();
gltf.load('assets/dangplane.glb', (res) => {
    planeMesh = res.scene;
    planeMesh.traverse(obj => {
        if (obj.isMesh) {
            obj.material = new THREE.MeshStandardMaterial({
                color: 0x00ff00,
                wireframe: true,
                opacity: 0.5,
                transparent: true
            });
            obj.castShadow = false;
            obj.receiveShadow = true;
        }
    });
    scene.add(planeMesh);
});

function getHeightAtPosition(mesh, x, z) {
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(mesh, true);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}

// YUKA support
function createYukaVehicle(bean) {
    vehicle = new YUKA.Vehicle();
    vehicle.setRenderComponent(bean, (entity, renderComponent) => {
        renderComponent.position.copy(entity.position);
    });
    vehicle.maxSpeed = 2;
    entityManager.add(vehicle);
}

// Load NavMesh + Model
const navLoader = new YUKA.NavMeshLoader();
let navmesh;
navLoader.load('assets/navmesh.gltf')
    .then((navMesh) => {
        // Your loaded NavMesh is available here
        navmesh = navMesh;
        console.log('NavMesh loaded for pathfinding');
        console.log('NavMesh loaded successfully:', navMesh);
        // You can now use this navMesh for pathfinding, etc.
    })
    .catch((error) => {
        console.error('Error loading NavMesh:', error);
    });


// Load bunny
gltf.load('assets/wheelbunny.glb', (res) => {
    beanmodel = res.scene;
    beanmodel.position.set(0, 0.1, 0);
    beanmodel.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(beanmodel);

    // Snap to navmesh once it's loaded
    setTimeout(() => {
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, 0, 0);
            beanmodel.position.set(0, y + 0.01, 0);
        }
    }, 100);

    // Start orbit target on the bunny
    orbit.target.copy(beanmodel.position);
    orbit.update();

    mixer = new THREE.AnimationMixer(beanmodel);
    res.animations.forEach((clip) => {
        if (clip.name.toLowerCase() === 'fullwheels') {
            wobbleAction = mixer.clipAction(clip);
            wobbleAction.play();
            wobbleAction.enabled = true;
            wobbleAction.setEffectiveWeight(0);
        }
    });
});

// Helpers reused each frame
const UP = new THREE.Vector3(0, 1, 0);
const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const moveDir = new THREE.Vector3();

// Camera follow params (TPS feel)
const cameraHeight = 4;
const cameraDistance = 15;

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    let moving = false;

    if (beanmodel) {
        if (mode === 'PILOT') {
            // Compute camera-space movement basis (yaw only)
            camera.getWorldDirection(tmpForward);
            tmpForward.y = 0;
            tmpForward.normalize();
            // RIGHT = forward × up  (not up × forward, which flips handedness)
            tmpRight.copy(tmpForward).cross(UP).normalize();

            moveDir.set(0, 0, 0);
            if (keys.w) moveDir.add(tmpForward);
            if (keys.s) moveDir.sub(tmpForward);
            if (keys.a) moveDir.sub(tmpRight);
            if (keys.d) moveDir.add(tmpRight);

            if (moveDir.lengthSq() > 0) {
                moving = true;
                moveDir.normalize().multiplyScalar(moveSpeed * dt);

                // Rotate bunny to face movement direction (flat)
                const faceDir = new THREE.Vector3(moveDir.x, 0, moveDir.z).normalize();
                if (faceDir.lengthSq() > 0) {
                    const targetQuat = new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, faceDir);
                    beanmodel.quaternion.slerp(targetQuat, 0.18);
                }

                const targetPos = beanmodel.position.clone().add(moveDir);
                const clamped = clampToNavMesh(targetPos);
                beanmodel.position.copy(clamped);
            }

            // Place camera behind & above bunny along current camera forward so bunny stays centered
            const camPos = beanmodel.position.clone()
                .addScaledVector(tmpForward, -cameraDistance)
                .addScaledVector(UP, cameraHeight);

            // The PointerLockControls owns the camera transform; we set its object position to our follow pos.
            look.getObject().position.copy(camPos);
            // We do NOT call look.getObject().lookAt — pointer yaw/pitch is from the mouse.
        } else {
            // ORBIT mode keeps orbit target on bunny, so orbit feels anchored
            if (beanmodel) {
                orbit.target.lerp(beanmodel.position, 0.2);
                orbit.update();
            }
        }
    }

    // Blend “wheels” animation by speed
    if (wobbleAction) {
        const targetWeight = moving ? 1 : 0;
        const current = wobbleAction.getEffectiveWeight();
        wobbleAction.setEffectiveWeight(THREE.MathUtils.lerp(current, targetWeight, 0.5));
    }
    if (mixer) mixer.update(dt);

    // Resize
    if (renderer.domElement.width !== window.innerWidth || renderer.domElement.height !== window.innerHeight) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }

    // Update active control
    if (mode === 'ORBIT') orbit.update();

    renderer.render(scene, camera);
}

animate();

// Optional: Esc to exit PILOT back to Orbit smoothly
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode === 'PILOT') setMode('ORBIT');
});

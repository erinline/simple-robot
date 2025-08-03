import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.117.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/OrbitControls.js';
import * as YUKA from 'https://cdn.jsdelivr.net/npm/yuka/build/yuka.module.js';

let entityManager = new YUKA.EntityManager();
let vehicle;
let yukaNavMesh;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.update();

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 1));
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);
scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6));

// Place bean on mesh
function getHeightAtPosition(mesh, x, z) {
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(mesh, true);
    return intersects.length > 0 ? intersects[0].point.y : 0;
}

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
        .then( ( navMesh ) => {
            // Your loaded NavMesh is available here
            navmesh = navMesh;
            console.log('NavMesh loaded for pathfinding');
            console.log( 'NavMesh loaded successfully:', navMesh );
            // You can now use this navMesh for pathfinding, etc.
        } )
        .catch( ( error ) => {
            console.error( 'Error loading NavMesh:', error );
        } );

let beanmodel, mixer;
const clock = new THREE.Clock();

const loader = new GLTFLoader();
// Load NavMesh
let planeMesh;
loader.load('assets/dangplane.glb', (gltf) => {
    planeMesh = gltf.scene;  // Assuming your navmesh is the first mesh
    const geometry = planeMesh.geometry;
    planeMesh.material = new THREE.MeshStandardMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.5, transparent: true }); 
    scene.add(planeMesh);
});
let wobbleAction;
loader.load('assets/lowpolybennybean.glb', (gltf) => {
    beanmodel = gltf.scene;
    scene.add(beanmodel);
    createYukaVehicle(beanmodel);

    // Snap to navmesh once it's loaded
    setTimeout(() => {
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, 0, 0);
            beanmodel.position.set(0, y + 0.01, 0);
            vehicle.position.set(0, y + 0.01, 0);
        }
    }, 100);

    mixer = new THREE.AnimationMixer(beanmodel);
    gltf.animations.forEach((clip) => {
        if (clip.name.toLowerCase() === ('wobble')) {
            wobbleAction = mixer.clipAction(clip);
            wobbleAction.play();
            wobbleAction.enabled = true;
            wobbleAction.setEffectiveWeight(0);
        }
    });
});

// Click to move the agent along the navmesh
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener('click', (event) => {
    if (!vehicle || !navmesh || !planeMesh) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(planeMesh, true);
    if (intersects.length > 0) {
        const target = intersects[0].point;

        // Compute path
        const rawPoints = navmesh.findPath(vehicle.position, target);
        if (rawPoints && rawPoints.length > 0) {

            // Build a proper YUKA.Path
            const yukaPath = new YUKA.Path();
            for (const p of rawPoints) {
              yukaPath.add(new YUKA.Vector3(p.x, p.y, p.z)); // <-- convert here
            }
            yukaPath.loop = false;

            vehicle.steering.clear();
            vehicle.steering.add(new YUKA.FollowPathBehavior(yukaPath, 0.5));
            vehicle.steering.add(new YUKA.ArriveBehavior(rawPoints[rawPoints.length - 1], 2, 0.5));
        }

    }
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);

        // Determine speed
        const speed = vehicle ? vehicle.velocity.length() : 0;
        const walkingNow = speed > 0.05;

        if (wobbleAction) {
            // Smoothly adjust weight instead of instant pause
            const targetWeight = walkingNow ? 1 : 0;
            const currentWeight = wobbleAction.getEffectiveWeight();
            const newWeight = THREE.MathUtils.lerp(currentWeight, targetWeight, 0.5); // smooth step
            wobbleAction.setEffectiveWeight(newWeight);
        }
    }

    // Make bean face movement direction
    if (vehicle && vehicle.velocity.squaredLength() > 0.0001) {
        const dir = vehicle.velocity.clone().normalize();
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(1, 0, 0), // model's forward
            new THREE.Vector3(dir.x, 0, dir.z).normalize() // movement direction (flat)
        );
        beanmodel.quaternion.slerp(targetQuat, 0.15); // smooth rotate
    }

    entityManager.update(delta);
    controls.update();
    renderer.render(scene, camera);
}

animate();
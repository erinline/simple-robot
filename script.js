import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.117.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/OrbitControls.js';
import * as YUKA from 'https://cdn.jsdelivr.net/npm/yuka/build/yuka.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/controls/PointerLockControls.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.117.1/examples/jsm/loaders/RGBELoader.js';

let entityManager = new YUKA.EntityManager();
let vehicle;
let yukaNavMesh;

let freebunny, freeMixer, freeWheels, myWheels; // actions
let bounds, boundsMargin = 0.2;

const hasState = {
    synced: false,
    proximityTimer: 0,               // seconds inside 1m
    proximityThreshold: 3.0,         // seconds to fill
};

const freeState = {
    dir: new THREE.Vector3(1, 0, 0).normalize(),
    speed: 2.2,
    driftAmp: 0.9,   // how loopy (radians/sec)
    driftHz: 0.25,   // drift frequency
};

const myOrbitState = {
    dir: new THREE.Vector3(1, 0, 0).normalize(), // straight line until edge
    speed: 2.0
};

const myLoopyState = { // used after syncing, when ORBIT behaves like freebunny
    dir: new THREE.Vector3(0, 0, 1).normalize(),
    speed: 2.2,
    driftAmp: 0.8,
    driftHz: 0.25,
};

let planeMesh;
let mybunny, mixer, wobbleAction;
const clock = new THREE.Clock();

const MODEL_FORWARD = new THREE.Vector3(0, 0, -1); // change if your GLB faces +Z

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;

const hud = document.createElement('div');
hud.style.position = 'fixed';
hud.style.top = '10px';
hud.style.left = '12px';
hud.style.zIndex = '10';
hud.style.display = 'flex';
hud.style.alignItems = 'center';
hud.style.gap = '8px';
document.body.appendChild(hud);

// diamond icon
const diamond = document.createElement('div');
diamond.style.width = '16px';
diamond.style.height = '16px';
diamond.style.transform = 'rotate(45deg)';
diamond.style.background = hasState.synced ? '#4caf50' : '#ffffff';
diamond.style.opacity = '0.9';
diamond.style.boxShadow = '0 0 8px rgba(255,255,255,0.5)';
hud.appendChild(diamond);

// progress bar
const barWrap = document.createElement('div');
barWrap.style.width = '160px';
barWrap.style.height = '10px';
barWrap.style.border = '1px solid rgba(255,255,255,0.7)';
barWrap.style.background = 'rgba(255,255,255,0.08)';
barWrap.style.borderRadius = '6px';
barWrap.style.overflow = 'hidden';
hud.appendChild(barWrap);

const barFill = document.createElement('div');
barFill.style.height = '100%';
barFill.style.width = '0%';
barFill.style.background = '#00d1ff';
barFill.style.transition = 'width 0.1s linear';
barWrap.appendChild(barFill);

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
        if (mybunny) {
            orbit.target.copy(mybunny.position);
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
const keys = { w: false, a: false, s: false, d: false, capslock: false };
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (e.getModifierState && e.getModifierState('CapsLock')) keys.capslock = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
    if (e.getModifierState && !e.getModifierState('CapsLock')) keys.capslock = false;
});

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

function clampXZToBounds(pos) {
    if (!bounds) return pos;
    pos.x = THREE.MathUtils.clamp(pos.x, bounds.min.x + boundsMargin, bounds.max.x - boundsMargin);
    pos.z = THREE.MathUtils.clamp(pos.z, bounds.min.z + boundsMargin, bounds.max.z - boundsMargin);
    return pos;
}
function hitEdge(next) {
    if (!bounds) return null;
    const sideXMin = next.x <= bounds.min.x + boundsMargin;
    const sideXMax = next.x >= bounds.max.x - boundsMargin;
    const sideZMin = next.z <= bounds.min.z + boundsMargin;
    const sideZMax = next.z >= bounds.max.z - boundsMargin;
    if (sideXMin) return 'xmin';
    if (sideXMax) return 'xmax';
    if (sideZMin) return 'zmin';
    if (sideZMax) return 'zmax';
    return null;
}
function rotateRight90(vec) {
    // rotate in XZ by -90°: (x,z) -> (z, -x)
    const x = vec.x, z = vec.z;
    vec.x = z; vec.z = -x;
    vec.normalize();
    return vec;
}
function reflectXZ(dir, side) {
    // perfect reflection on an axis-aligned wall
    if (side === 'xmin' || side === 'xmax') dir.x *= -1;
    if (side === 'zmin' || side === 'zmax') dir.z *= -1;
    dir.normalize();
    return dir;
}
function jitterAngle(dir, radians) {
    const ang = Math.atan2(dir.z, dir.x) + (Math.random() * 2 - 1) * radians;
    dir.set(Math.cos(ang), 0, Math.sin(ang)).normalize();
    return dir;
}
function moveOnPlane(object3D, dir, speed, dt) {
    const next = object3D.position.clone().addScaledVector(dir, speed * dt);
    const side = hitEdge(next);
    if (side) {
        // clamp to boundary and signal edge hit
        clampXZToBounds(next);
        object3D.position.copy(next);
        return side;
    } else {
        object3D.position.copy(next);
        return null;
    }
}
function faceMoveDirection(object3D, dir) {
    const faceDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    if (faceDir.lengthSq() > 0) {
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(MODEL_FORWARD, faceDir);
        object3D.quaternion.slerp(targetQuat, 0.18);
    }
}

function hitEdgeFlags(next) {
    if (!bounds) return null;
    const f = {
        xmin: next.x <= bounds.min.x + boundsMargin,
        xmax: next.x >= bounds.max.x - boundsMargin,
        zmin: next.z <= bounds.min.z + boundsMargin,
        zmax: next.z >= bounds.max.z - boundsMargin,
    };
    return (f.xmin || f.xmax || f.zmin || f.zmax) ? f : null;
}

function pushInsideFromEdge(pos, flags, eps = 0.03) {
    if (flags.xmin) pos.x = bounds.min.x + boundsMargin + eps;
    if (flags.xmax) pos.x = bounds.max.x - boundsMargin - eps;
    if (flags.zmin) pos.z = bounds.min.z + boundsMargin + eps;
    if (flags.zmax) pos.z = bounds.max.z - boundsMargin - eps;
}

function setLeftTurnTangent(dir, flags) {
    // Compute a “turn left candidate from current dir, then project to edge tangent.
    const turned = dir.clone();
    // left turn in XZ: (x,z) -> (z, -x)
    turned.set(dir.z, 0, -dir.x).normalize();

    if (flags.xmin || flags.xmax) {
        // tangent must be along ±Z
        dir.set(0, 0, Math.sign(turned.z) || 1).normalize();
    } else if (flags.zmin || flags.zmax) {
        // tangent must be along ±X
        dir.set(Math.sign(turned.x) || 1, 0, 0).normalize();
    }
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

    planeMesh.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(planeMesh);
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

function loadFreeBunny(animationsRef) {
    gltf.load('assets/wheelbunny.glb', (res) => {
        freebunny = res.scene;
        freebunny.name = 'freebunny';
        freebunny.position.set(12.5, 0.1, -2.5);

        // make it blue: clone materials so we don't affect mybunny
        freebunny.traverse(o => {
            if (o.isMesh) {
                o.material = o.material.clone();
                if (o.material.color) o.material.color.set('#3aa0ff');
                o.castShadow = true; o.receiveShadow = true;
            }
        });

        scene.add(freebunny);

        // snap to plane
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, freebunny.position.x, freebunny.position.z);
            freebunny.position.y = y + 0.01;
        }

        freeMixer = new THREE.AnimationMixer(freebunny);
        // prefer the same 'fullwheels' if present
        const clip = (res.animations.find(c => c.name.toLowerCase() === 'fullwheels')
            || animationsRef?.find(c => c.name.toLowerCase() === 'fullwheels'));
        if (clip) {
            freeWheels = freeMixer.clipAction(clip);
            freeWheels.play();
            freeWheels.enabled = true;
            freeWheels.setEffectiveWeight(1); // always rolling
        }
    });
}


// Load bunny
gltf.load('assets/wheelbunny.glb', (res) => {
    mybunny = res.scene;
    mybunny.position.set(0, 0.1, 0);
    mybunny.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(mybunny);

    setTimeout(() => {
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, 0, 0);
            mybunny.position.set(0, y + 0.01, 0);
        }
    }, 100);

    orbit.target.copy(mybunny.position);
    orbit.update();

    mixer = new THREE.AnimationMixer(mybunny);
    res.animations.forEach((clip) => {
        if (clip.name.toLowerCase() === 'fullwheels') {
            myWheels = mixer.clipAction(clip);
            myWheels.play();
            myWheels.enabled = true;
            myWheels.setEffectiveWeight(0); // blended by movement
        }
    });

    // AFTER mybunny is ready, load freebunny
    loadFreeBunny(res.animations);
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
    const moveSpeed = keys.capslock ? 8 : 4; // check dynamically here

    let moving = false;

    if (mybunny) {
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
                    mybunny.quaternion.slerp(targetQuat, 0.18);
                }

                const targetPos = mybunny.position.clone().add(moveDir);
                const clamped = clampToNavMesh(targetPos);
                mybunny.position.copy(clamped);
            }

            // Place camera behind & above bunny along current camera forward so bunny stays centered
            const camPos = mybunny.position.clone()
                .addScaledVector(tmpForward, -cameraDistance)
                .addScaledVector(UP, cameraHeight);

            // The PointerLockControls owns the camera transform; we set its object position to our follow pos.
            look.getObject().position.copy(camPos);
            // We do NOT call look.getObject().lookAt — pointer yaw/pitch is from the mouse.
        } else {
            // ORBIT mode keeps orbit target on bunny, so orbit feels anchored
            if (mybunny) {
                orbit.target.lerp(mybunny.position, 0.2);
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

    // === AUTONOMY: freebunny loopy bounce ===
    if (freebunny) {
        // drift heading to make it "loopy"
        const t = clock.elapsedTime;
        const drift = Math.sin(2 * Math.PI * freeState.driftHz * t) * freeState.driftAmp * dt;
        const ang = Math.atan2(freeState.dir.z, freeState.dir.x) + drift;
        freeState.dir.set(Math.cos(ang), 0, Math.sin(ang)).normalize();

        const edgeHit = moveOnPlane(freebunny, freeState.dir, freeState.speed, dt);
        if (edgeHit) {
            reflectXZ(freeState.dir, edgeHit);
            jitterAngle(freeState.dir, THREE.MathUtils.degToRad(30));
        }
        // keep on plane height
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, freebunny.position.x, freebunny.position.z);
            freebunny.position.y = y + 0.01;
        }
        faceMoveDirection(freebunny, freeState.dir);
        if (freeMixer) freeMixer.update(dt);
    }

    // === mybunny: ORBIT autopilot ===
    if (mybunny && mode === 'ORBIT') {
        if (hasState.synced) {
            // behave like freebunny
            const t = clock.elapsedTime;
            const drift = Math.sin(2 * Math.PI * myLoopyState.driftHz * t) * myLoopyState.driftAmp * dt;
            const ang = Math.atan2(myLoopyState.dir.z, myLoopyState.dir.x) + drift;
            myLoopyState.dir.set(Math.cos(ang), 0, Math.sin(ang)).normalize();

            const edgeHit = moveOnPlane(mybunny, myLoopyState.dir, myLoopyState.speed, dt);
            if (edgeHit) {
                reflectXZ(myLoopyState.dir, edgeHit);
                jitterAngle(myLoopyState.dir, THREE.MathUtils.degToRad(25));
            }
        } else {
            // linear path; on edge, turn left and then follow edge
            const next = mybunny.position.clone().addScaledVector(myOrbitState.dir, myOrbitState.speed * dt);
            const flags = hitEdgeFlags(next);
            if (flags) {
                // clamp & nudge slightly inside to avoid sticking at the exact boundary/corner
                pushInsideFromEdge(next, flags, 0.04);
                mybunny.position.copy(next);

                // choose a single tangent consistent with a left turn
                setLeftTurnTangent(myOrbitState.dir, flags);

                // give it a tiny step along tangent so we leave the corner this frame
                mybunny.position.addScaledVector(myOrbitState.dir, 0.02);
            } else {
                mybunny.position.copy(next);
            }
        }
        // keep on plane height
        if (planeMesh) {
            const y = getHeightAtPosition(planeMesh, mybunny.position.x, mybunny.position.z);
            mybunny.position.y = y + 0.01;
        }
        faceMoveDirection(mybunny, mode === 'ORBIT' ? (hasState.synced ? myLoopyState.dir : myOrbitState.dir) : moveDir);
    }

    // === PROXIMITY + HUD ===
    if (mybunny && freebunny) {
        const d = mybunny.position.distanceTo(freebunny.position);
        if (d <= 5.0) {
            hasState.proximityTimer = Math.min(hasState.proximityThreshold, hasState.proximityTimer + dt);
        } else {
            hasState.proximityTimer = Math.max(0, hasState.proximityTimer - 1.5 * dt); // mild decay feels good
        }
        const pct = (hasState.proximityTimer / hasState.proximityThreshold) * 100;
        barFill.style.width = `${pct}%`;

        if (!hasState.synced && hasState.proximityTimer >= hasState.proximityThreshold) {
            hasState.synced = true;
            diamond.style.background = '#4caf50'; // turn green once synced
        }
    }

    renderer.render(scene, camera);
}

animate();

// Optional: Esc to exit PILOT back to Orbit smoothly
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode === 'PILOT') setMode('ORBIT');
});

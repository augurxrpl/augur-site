import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const BLUE=0x258cff, RED=0xff4038;
const accentTank=(r,c)=>r.traverse(o=>{if(o.isMesh&&["Tank_Turret_2","Tank_body_4","Tank_body_5"].includes(o.name)){o.material=o.material.clone();o.material.color.set(c);if(o.material.emissive){o.material.emissive.set(c);o.material.emissiveIntensity=.12;}}});
const accentSoldier=(r,c)=>r.traverse(o=>{if(o.isMesh&&["ShoulderPadL","ShoulderPadR"].includes(o.name)){o.material=o.material.clone();o.material.color.set(c);if(o.material.emissive){o.material.emissive.set(c);o.material.emissiveIntensity=.18;}}});

const root = document.getElementById('battlefield');

const scene = new THREE.Scene();
window.scene = scene;
window.THREE = THREE;
scene.background = null;

root.style.backgroundImage = "url('./assets/textures/battlefield.webp')";
root.style.backgroundSize = "cover";
root.style.backgroundPosition = "center center";
root.style.backgroundRepeat = "no-repeat";

const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  500
);

camera.position.set(0, 35, 65);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);

root.replaceChildren(renderer.domElement);

renderer.render(scene, camera);


/* AUGUR BATTLEFIELD — SCREEN BACKGROUND + INVISIBLE PLAYFIELD */
root.style.backgroundImage = "url('./assets/textures/battlefield.webp')";
root.style.backgroundSize = "cover";
root.style.backgroundPosition = "center center";
root.style.backgroundRepeat = "no-repeat";

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 90),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
scene.add(ground);

scene.add(new THREE.HemisphereLight(0xb8d8ff, 0x202015, 3));

renderer.render(scene, camera);

renderer.render(scene,camera);
const loader = new GLTFLoader();

/* Organic battlefield placement */
const occupied = [];

/* Unit visibility halos */
function addUnitHalo(unit, color, kind){
  const size = kind === "tank" ? 3.0 : 1.0;
  const opacity = kind === "tank" ? 0.10 : 0.18;

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(size, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );

  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.035, 0);
  halo.renderOrder = 1;

  unit.add(halo);
}

function scatteredPosition(side, minGap=5){
  const minX = side==="blue" ? -52 : 8;
  const maxX = side==="blue" ? -8  : 52;

  for(let tries=0; tries<200; tries++){
    const x = THREE.MathUtils.randFloat(minX,maxX);
    const z = THREE.MathUtils.randFloat(-34,34);

    const clear = occupied.every(p=>{
      const dx=x-p.x, dz=z-p.z;
      return Math.hypot(dx,dz) >= minGap;
    });

    if(clear){
      occupied.push({x,z});
      return {x,z};
    }
  }

  return {
    x: THREE.MathUtils.randFloat(minX,maxX),
    z: THREE.MathUtils.randFloat(-34,34)
  };
}

loader.load('./assets/models/master-tank.glb', (gltf) => {
  const tank = gltf.scene;
  tank.position.set(-22, 0, 8);
  tank.rotation.y = Math.PI;
  tank.scale.setScalar(0.35);
    tank.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});
  tank.userData.side="blue"; tank.userData.kind="tank";
    const redTank=clone(tank); redTank.position.set(22,0,8);
  accentTank(tank,BLUE);
  redTank.userData.side="red"; redTank.userData.kind="tank";
  accentTank(redTank,RED);
  redTank.rotation.y = Math.PI;
    for(let i=0;i<20;i++){
    const bp=scatteredPosition("blue",7);
    const b=clone(tank);
    b.position.set(bp.x,0,bp.z);
    b.userData.side="blue";
    b.userData.kind="tank";
    addUnitHalo(b, BLUE, "tank");
    scene.add(b);

    const rp=scatteredPosition("red",7);
    const r=clone(redTank);
    r.position.set(rp.x,0,rp.z);
    r.userData.side="red";
    r.userData.kind="tank";
    addUnitHalo(r, RED, "tank");
    scene.add(r);
  }
  renderer.render(scene, camera);
});

loader.load('./assets/models/master-soldier.glb', (gltf) => {
  const soldier = gltf.scene;
  soldier.position.set(-10, 0, -8);
  soldier.rotation.y = Math.PI / 2;
  soldier.scale.setScalar(0.75);

  soldier.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});

  const redSoldier=clone(soldier); redSoldier.position.set(10,0,-8); redSoldier.rotation.y=-Math.PI/2;
  accentSoldier(soldier,BLUE); accentSoldier(redSoldier,RED);
  for(let i=0;i<60;i++){
    const bp=scatteredPosition("blue",4);
    const b=clone(soldier);
    b.position.set(bp.x,0,bp.z);
    b.userData.side="blue";
    b.userData.kind="soldier";
    addUnitHalo(b, BLUE, "soldier");
    scene.add(b);

    const rp=scatteredPosition("red",4);
    const r=clone(redSoldier);
    r.position.set(rp.x,0,rp.z);
    r.userData.side="red";
    r.userData.kind="soldier";
    addUnitHalo(r, RED, "soldier");
    scene.add(r);
  }
  renderer.render(scene, camera);
});

function animate(){
  requestAnimationFrame(animate);

  scene.traverse((o)=>{
    if(o.userData.kind!=="soldier") return;
    if(o.userData.startX===undefined) o.userData.startX=o.position.x;

    const push=(Math.sin(performance.now()*0.001)+1)*1.5;
    o.position.x=o.userData.startX+(o.userData.side==="blue"?push:-push);
  });

  renderer.render(scene,camera);
}

animate();

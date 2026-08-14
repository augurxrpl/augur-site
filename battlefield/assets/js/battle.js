import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const root = document.getElementById('battlefield');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071017);

const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  500
);

camera.position.set(0, 35, 65);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);

root.replaceChildren(renderer.domElement);

renderer.render(scene, camera);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 90),
  new THREE.MeshStandardMaterial({ color: 0x30372b })
);

ground.rotation.x = -Math.PI / 2;
scene.add(ground);

scene.add(new THREE.HemisphereLight(0xb8d8ff, 0x202015, 3));

renderer.render(scene, camera);

const blueZone = new THREE.Mesh(
  new THREE.PlaneGeometry(58, 90),
  new THREE.MeshBasicMaterial({color:0x075da8,transparent:true,opacity:.18})
);
blueZone.rotation.x = -Math.PI/2;
blueZone.position.set(-30,.02,0);
scene.add(blueZone);

const redZone = blueZone.clone();
redZone.material = new THREE.MeshBasicMaterial({color:0xb51f1f,transparent:true,opacity:.18});
redZone.position.x = 30;
scene.add(redZone);

const frontLine = new THREE.Mesh(
  new THREE.BoxGeometry(.3,.25,90),
  new THREE.MeshBasicMaterial({color:0x70d8ff})
);
frontLine.position.y = .15;
scene.add(frontLine);

renderer.render(scene,camera);
const loader = new GLTFLoader();

loader.load('./assets/models/master-tank.glb', (gltf) => {
  const tank = gltf.scene;
  tank.position.set(-22, 0, 8);
  tank.rotation.y = Math.PI;
  tank.scale.setScalar(0.35);
    tank.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(0x258cff); } });
    const redTank = clone(tank); redTank.position.set(22,0,8); redTank.traverse((o)=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0xff4038);}}); scene.add(redTank);
  redTank.rotation.y = Math.PI;
  scene.add(tank);
    for(let r=0;r<4;r++)for(let c=0;c<5;c++){if(r||c){const b=clone(tank);b.position.set(-12-c*8,0,-24+r*16);scene.add(b);const s=clone(redTank);s.position.set(12+c*8,0,-24+r*16);scene.add(s);}}
  renderer.render(scene, camera);
});

loader.load('./assets/models/master-soldier.glb', (gltf) => {
  const soldier = gltf.scene;
  soldier.position.set(-10, 0, -8);
  soldier.rotation.y = Math.PI / 2;
  soldier.scale.setScalar(1.5);

  soldier.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.color.set(0x258cff);
    }
  });

  const redSoldier=clone(soldier); redSoldier.position.set(10,0,-8); redSoldier.rotation.y = -Math.PI / 2; redSoldier.traverse((o)=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0xff4038);}});
  for(const z of [-16,0,16])for(let i=0;i<5;i++){const b=clone(soldier);b.position.set(-8-i*6,0,z);b.userData.side="blue";b.userData.kind="soldier";scene.add(b);const r=clone(redSoldier);r.position.set(8+i*6,0,z);r.userData.side="red";r.userData.kind="soldier";scene.add(r);}
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

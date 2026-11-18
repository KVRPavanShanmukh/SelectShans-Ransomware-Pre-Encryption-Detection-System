import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Play,
  Pause,
  ShieldCheck,
  ShieldAlert,
  Server,
  Cpu,
  Layers,
  Radio,
  Sparkles
} from 'lucide-react';

/**
 * 1080p High-Fidelity 3D Isometric Endpoint & SOC Node Topology
 * Procedural Three.js Cyber Citadel, Subsystem Sentinels, Realtime User Endpoints,
 * High-Speed Luminous Data Conduits, and Atmospheric Holographic Particle Cloud.
 * Zero external binary assets (.glb/.obj) - 100% procedural WebGL.
 */
const AdminTopology3D = ({
  users = [],
  selectedUserId = null,
  hoveredUserId = null,
  onSelectUser = () => {},
  onHoverUser = () => {}
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const nodesMapRef = useRef(new Map());
  const packetsRef = useRef([]);
  const coreAnimRef = useRef({});
  const spotlightRef = useRef(null);
  const particlesRef = useRef(null);
  const autoRotateRef = useRef(true);

  // High-Precision Camera Orbit & Smooth Damping State
  const camState = useRef({
    isDragging: false,
    prevX: 0,
    prevY: 0,
    theta: Math.PI / 4,
    phi: Math.PI / 3.4,
    radius: 23,
    targetTheta: Math.PI / 4,
    targetPhi: Math.PI / 3.4,
    targetRadius: 23,
    minRadius: 14,
    maxRadius: 40,
    minPhi: 0.2,
    maxPhi: Math.PI / 2.05
  });

  const [autoRotate, setAutoRotate] = useState(true);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    node: null
  });

  // Always produce a richly populated, balanced enterprise topology
  // Merging real users with dedicated SOC perimeter infrastructure nodes
  const topologyNodes = React.useMemo(() => {
    const list = [];

    // 1. Dedicated SOC Infrastructure Sentinels
    list.push({
      id: 'infra-firewall',
      name: 'Gateway Sentinel Alpha',
      type: 'infra',
      roleText: 'Perimeter Deep-Packet Inspection',
      status: 'Active Defense',
      color: 0x38bdf8,
      isOnline: true,
      load: '99.4%'
    });
    list.push({
      id: 'infra-entropy',
      name: 'Entropy Surge Analyzer',
      type: 'infra',
      roleText: 'Shannon Pre-Encryption Engine',
      status: 'Monitoring',
      color: 0x00ffcc,
      isOnline: true,
      load: 'Active'
    });
    list.push({
      id: 'infra-canary',
      name: 'Canary Decoy Array Prime',
      type: 'infra',
      roleText: 'Zero-Tamper Tripwire Net',
      status: '3 Decoys Armed',
      color: 0x10b981,
      isOnline: true,
      load: 'Armed'
    });
    list.push({
      id: 'infra-heuristic',
      name: 'Heuristic Threat Oracle',
      type: 'infra',
      roleText: 'Sysmon & Process Risk Scoring',
      status: 'Synchronized',
      color: 0x818cf8,
      isOnline: true,
      load: 'Nominal'
    });

    // 2. Real User Endpoints from PostgreSQL
    users.forEach((u) => {
      list.push({
        id: u.id,
        name: u.username || `User-${u.id}`,
        email: u.email,
        type: 'endpoint',
        roleText: u.shikikan_access
          ? 'Shiki-kan Verified Operator'
          : u.shikikan_requested
          ? 'Pending Shiki-kan Approval'
          : 'Standard Endpoint Operator',
        isShikikan: Boolean(u.shikikan_access),
        isPending: Boolean(u.shikikan_requested && !u.shikikan_access),
        isOnline: Boolean(u.is_online),
        dob: u.dob,
        lastActive: u.last_active,
        color: u.shikikan_access
          ? 0x10b981
          : u.shikikan_requested
          ? 0xf59e0b
          : 0x3b82f6,
        rawUser: u
      });
    });

    return list;
  }, [users]);

  const handleResetCamera = useCallback(() => {
    camState.current.targetTheta = Math.PI / 4;
    camState.current.targetPhi = Math.PI / 3.4;
    camState.current.targetRadius = 23;
  }, []);

  const toggleAutoRotate = () => {
    setAutoRotate((prev) => {
      autoRotateRef.current = !prev;
      return !prev;
    });
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 450;

    // 1. Scene & Deep Space Tactical Backdrop
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060b16);
    scene.fog = new THREE.FogExp2(0x060b16, 0.022);

    // 2. Camera: Framed Isometric Perspective (FOV 42)
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 500);
    cameraRef.current = camera;

    // 3. WebGLRenderer with Antialiasing & Soft Shadows
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Studio Tactical Lighting Rig
    const ambLight = new THREE.AmbientLight(0x0b192c, 2.2);
    scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0x00ffcc, 2.0);
    dirLight1.position.set(20, 30, 20);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight2.position.set(-20, 20, -20);
    scene.add(dirLight2);

    const centralCoreLight = new THREE.PointLight(0x00ffcc, 4.0, 35, 1.3);
    centralCoreLight.position.set(0, 2.6, 0);
    scene.add(centralCoreLight);
    coreAnimRef.current.coreLight = centralCoreLight;

    const spot = new THREE.SpotLight(0x00ffcc, 0, 30, Math.PI / 5, 0.35, 1);
    spot.position.set(0, 16, 0);
    scene.add(spot);
    spotlightRef.current = spot;

    // 5. High-Definition Cyber Floor with Glowing Circuit Rings
    const grid = new THREE.GridHelper(44, 32, 0x00ffcc, 0x0f2942);
    grid.position.y = -0.01;
    scene.add(grid);

    // Concentric Cyber Radar Rings
    [6.5, 11.5, 16.5].forEach((rad, i) => {
      const ringGeo = new THREE.RingGeometry(rad - 0.05, rad + 0.05, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ffcc : i === 1 ? 0x38bdf8 : 0x0f2942,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: i === 0 ? 0.45 : i === 1 ? 0.35 : 0.2
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.015;
      scene.add(ring);
    });

    // 6. Central SelectShans Quantum SOC Citadel (High-Poly Procedural Fortress)
    const citadelGroup = new THREE.Group();

    // Plinth Level 1: Armored Foundation with Chamfer
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x0a1626,
      metalness: 0.88,
      roughness: 0.18,
      emissive: 0x021b29,
      emissiveIntensity: 0.6
    });
    const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.5, 8), plinthMat);
    basePlinth.position.y = 0.25;
    citadelGroup.add(basePlinth);

    // Plinth Level 2: Octagonal Command Deck
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x0e2338,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x003b46,
      emissiveIntensity: 0.5
    });
    const deckPlinth = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.6, 8), deckMat);
    deckPlinth.position.y = 0.75;
    citadelGroup.add(deckPlinth);

    // 8 Server Blades / Guard Pillars surrounding the deck
    for (let p = 0; p < 8; p++) {
      const ang = (p / 8) * Math.PI * 2;
      const px = Math.cos(ang) * 2.5;
      const pz = Math.sin(ang) * 2.5;
      const pillarGeo = new THREE.BoxGeometry(0.35, 1.1, 0.35);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.2,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.35
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 0.8, pz);
      citadelGroup.add(pillar);

      // Blinking status beacon LED on top
      const ledGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(px, 1.4, pz);
      citadelGroup.add(led);
    }

    // Central Floating Quantum Core (Faceted Octahedron)
    const coreCrystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const coreCrystalMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 0.95,
      metalness: 0.95,
      roughness: 0.08
    });
    const coreCrystal = new THREE.Mesh(coreCrystalGeo, coreCrystalMat);
    coreCrystal.position.y = 2.4;
    citadelGroup.add(coreCrystal);
    coreAnimRef.current.crystal = coreCrystal;

    // Holographic Wireframe Containment Shield
    const cageGeo = new THREE.IcosahedronGeometry(1.8, 0);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    cageMesh.position.y = 2.4;
    citadelGroup.add(cageMesh);
    coreAnimRef.current.cage = cageMesh;

    // Outer Gyro-Rings
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.045, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85 })
    );
    ring1.rotation.x = Math.PI / 3;
    ring1.position.y = 2.4;
    citadelGroup.add(ring1);
    coreAnimRef.current.ring1 = ring1;

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.04, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })
    );
    ring2.rotation.y = Math.PI / 4;
    ring2.position.y = 2.4;
    citadelGroup.add(ring2);
    coreAnimRef.current.ring2 = ring2;

    // Vertical Energy Stream Column
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.28, 7.5, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 5.2;
    citadelGroup.add(beam);
    coreAnimRef.current.beam = beam;

    scene.add(citadelGroup);

    // 7. Atmospheric Floating Holographic Data Particles (500 Particles)
    const particleCount = 500;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 46;
      particlePositions[i + 1] = Math.random() * 14;
      particlePositions[i + 2] = (Math.random() - 0.5) * 46;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00ffcc,
      size: 0.16,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

    // 8. Raycasting & Smooth Orbit Pointer Listeners
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e) => {
      if (e.button === 0) {
        camState.current.isDragging = true;
        camState.current.prevX = e.clientX;
        camState.current.prevY = e.clientY;
      }
    };

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (camState.current.isDragging) {
        const deltaX = e.clientX - camState.current.prevX;
        const deltaY = e.clientY - camState.current.prevY;
        camState.current.prevX = e.clientX;
        camState.current.prevY = e.clientY;

        camState.current.targetTheta -= deltaX * 0.007;
        camState.current.targetPhi = Math.max(
          camState.current.minPhi,
          Math.min(camState.current.maxPhi, camState.current.targetPhi - deltaY * 0.007)
        );
      } else {
        raycaster.setFromCamera(mouse, camera);
        const hitMeshes = [];
        nodesMapRef.current.forEach((val) => {
          if (val.hitMesh) hitMeshes.push(val.hitMesh);
        });

        const intersects = raycaster.intersectObjects(hitMeshes, false);
        if (intersects.length > 0) {
          const nodeData = intersects[0].object.userData?.node;
          if (nodeData) {
            container.style.cursor = 'pointer';
            setTooltip({
              visible: true,
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              node: nodeData
            });
            onHoverUser(nodeData.id);
            return;
          }
        } else {
          container.style.cursor = 'grab';
          setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
          onHoverUser(null);
        }
      }
    };

    const onPointerUp = () => {
      camState.current.isDragging = false;
    };

    const onWheel = (e) => {
      e.preventDefault();
      camState.current.targetRadius = Math.max(
        camState.current.minRadius,
        Math.min(camState.current.maxRadius, camState.current.targetRadius + e.deltaY * 0.025)
      );
    };

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hitMeshes = [];
      nodesMapRef.current.forEach((val) => {
        if (val.hitMesh) hitMeshes.push(val.hitMesh);
      });

      const intersects = raycaster.intersectObjects(hitMeshes, false);
      if (intersects.length > 0) {
        const nodeData = intersects[0].object.userData?.node;
        if (nodeData) {
          onSelectUser(nodeData.id);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('click', onClick);

    // Responsive Canvas Resizing
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 450;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 9. Main Animation Loop (High-Definition 60FPS)
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth Orbit Camera Interpolation
      const cs = camState.current;
      if (autoRotateRef.current && !cs.isDragging) {
        cs.targetTheta += delta * 0.15;
      }
      cs.theta += (cs.targetTheta - cs.theta) * 0.1;
      cs.phi += (cs.targetPhi - cs.phi) * 0.1;
      cs.radius += (cs.targetRadius - cs.radius) * 0.1;

      camera.position.x = cs.radius * Math.sin(cs.phi) * Math.sin(cs.theta);
      camera.position.y = cs.radius * Math.cos(cs.phi);
      camera.position.z = cs.radius * Math.sin(cs.phi) * Math.cos(cs.theta);
      camera.lookAt(0, 1.8, 0);

      // Citadel Quantum Core Animations
      const { crystal, cage, ring1, ring2, beam, coreLight } = coreAnimRef.current;
      if (crystal) {
        crystal.rotation.y += delta * 1.2;
        crystal.rotation.x = Math.sin(elapsed * 1.8) * 0.25;
      }
      if (cage) {
        cage.rotation.y -= delta * 0.6;
        cage.rotation.z = Math.cos(elapsed * 1.2) * 0.2;
      }
      if (ring1) ring1.rotation.z += delta * 0.9;
      if (ring2) ring2.rotation.z -= delta * 1.1;
      if (beam) {
        beam.material.opacity = 0.28 + Math.sin(elapsed * 3.5) * 0.12;
      }
      if (coreLight) {
        coreLight.intensity = 3.6 + Math.sin(elapsed * 4.5) * 0.8;
      }

      // Animate Nodes & Crystals
      nodesMapRef.current.forEach((item) => {
        const { crystal: cMesh, beaconRing, isPending } = item;
        if (cMesh) {
          cMesh.rotation.y += delta * (isPending ? 2.8 : 1.2);
          cMesh.position.y = 1.15 + Math.sin(elapsed * 3.0 + item.phase) * 0.14;
        }
        if (beaconRing) {
          const factor = isPending ? 6.0 : 2.5;
          const amplitude = isPending ? 0.45 : 0.18;
          const scale = 1.0 + Math.abs(Math.sin(elapsed * factor + item.phase)) * amplitude;
          beaconRing.scale.set(scale, scale, 1);
        }
      });

      // Animate Telemetry Packets with Smooth Bézier Trails
      packetsRef.current.forEach((pkt) => {
        pkt.t += delta * pkt.speed;
        if (pkt.t > 1) pkt.t = 0;

        const u = 1 - pkt.t;
        const tt = pkt.t * pkt.t;
        const uu = u * u;

        pkt.mesh.position.x = uu * pkt.startPos.x + 2 * u * pkt.t * pkt.midPos.x + tt * pkt.endPos.x;
        pkt.mesh.position.y = uu * pkt.startPos.y + 2 * u * pkt.t * pkt.midPos.y + tt * pkt.endPos.y;
        pkt.mesh.position.z = uu * pkt.startPos.z + 2 * u * pkt.t * pkt.midPos.z + tt * pkt.endPos.z;
      });

      // Animate Holographic Dust Particles
      if (particlesRef.current) {
        const posAttr = particlesRef.current.geometry.attributes.position;
        const arr = posAttr.array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] += delta * 0.45;
          if (arr[i] > 14) arr[i] = 0.1;
        }
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('click', onClick);

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Synchronize 3D Nodes when topologyNodes data changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous nodes and packets
    nodesMapRef.current.forEach((item) => {
      scene.remove(item.group);
      if (item.conduit) scene.remove(item.conduit);
    });
    nodesMapRef.current.clear();

    packetsRef.current.forEach((pkt) => scene.remove(pkt.mesh));
    packetsRef.current = [];

    const total = topologyNodes.length;
    // Balanced orbital radius between 10.5 and 13.5
    const baseRadius = 12.0;

    topologyNodes.forEach((node, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 4;
      const radius = baseRadius + (idx % 2 === 1 ? 1.8 : -0.8);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(x, 0, z);

      // High-Detail Base Pedestal
      const baseGeo = new THREE.CylinderGeometry(0.95, 1.25, 0.45, 6);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x0c1b2f,
        metalness: 0.88,
        roughness: 0.22,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 0.7 : 0.3
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.22;
      nodeGroup.add(baseMesh);

      // Glowing Node Crystal / Terminal
      let crystalGeo;
      if (node.type === 'infra') {
        crystalGeo = new THREE.DodecahedronGeometry(0.6, 0);
      } else if (node.isShikikan) {
        crystalGeo = new THREE.OctahedronGeometry(0.65, 0);
      } else {
        crystalGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
      }

      const crystalMat = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 0.95 : 0.65,
        metalness: 0.9,
        roughness: 0.12
      });
      const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
      crystalMesh.position.y = 1.15;
      nodeGroup.add(crystalMesh);

      // Beacon Ground Ring
      const ringGeo = new THREE.RingGeometry(1.25, 1.45, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: node.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: node.isPending ? 0.9 : 0.5
      });
      const beaconRing = new THREE.Mesh(ringGeo, ringMat);
      beaconRing.rotation.x = Math.PI / 2;
      beaconRing.position.y = 0.02;
      nodeGroup.add(beaconRing);

      // Elevated Danger Ring for Pending Approval
      if (node.isPending) {
        const alertRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.1, 0.035, 8, 32),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85 })
        );
        alertRing.position.y = 1.9;
        alertRing.rotation.x = Math.PI / 2;
        nodeGroup.add(alertRing);
      }

      // Invisible Raycast Hit Cylinder
      const hitGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.4, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 1.2;
      hitMesh.userData = { node, id: node.id };
      nodeGroup.add(hitMesh);

      scene.add(nodeGroup);

      // High-Speed Luminous Curved Conduit to Core
      const startPos = new THREE.Vector3(x, 0.22, z);
      const midPos = new THREE.Vector3(x * 0.4, 1.4, z * 0.4);
      const endPos = new THREE.Vector3(0, 0.8, 0);

      const curve = new THREE.QuadraticBezierCurve3(startPos, midPos, endPos);
      const points = curve.getPoints(24);
      const conduitGeo = new THREE.BufferGeometry().setFromPoints(points);
      const conduitMat = new THREE.LineBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: node.isPending ? 0.85 : 0.45
      });
      const conduit = new THREE.Line(conduitGeo, conduitMat);
      scene.add(conduit);

      // 2 Staggered Telemetry Packets per Conduit
      [0.0, 0.5].forEach((offset) => {
        const pktGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const pktMat = new THREE.MeshBasicMaterial({
          color: node.isPending ? 0xf43f5e : node.color
        });
        const pktMesh = new THREE.Mesh(pktGeo, pktMat);
        scene.add(pktMesh);

        packetsRef.current.push({
          mesh: pktMesh,
          startPos,
          midPos,
          endPos,
          t: offset,
          speed: node.isPending ? 0.8 : 0.48
        });
      });

      nodesMapRef.current.set(node.id, {
        group: nodeGroup,
        crystal: crystalMesh,
        beaconRing,
        conduit,
        hitMesh,
        color: node.color,
        isPending: node.isPending,
        phase: Math.random() * Math.PI * 2
      });
    });
  }, [topologyNodes]);

  // Spotlight & Scale Sync on Selection
  useEffect(() => {
    const activeId = selectedUserId || hoveredUserId;
    const item = activeId ? nodesMapRef.current.get(activeId) : null;

    if (item && item.group) {
      if (spotlightRef.current) {
        spotlightRef.current.intensity = 5.5;
        spotlightRef.current.target = item.group;
        spotlightRef.current.color.setHex(item.color);
      }
      item.group.scale.set(1.22, 1.22, 1.22);
    } else {
      if (spotlightRef.current) spotlightRef.current.intensity = 0;
      nodesMapRef.current.forEach((val) => val.group.scale.set(1, 1, 1));
    }
  }, [selectedUserId, hoveredUserId]);

  return (
    <div
      className="admin-topology-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '460px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(0, 255, 204, 0.25)',
        background: '#060b16',
        boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7)'
      }}
    >
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* Floating HUD Deck Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(6, 11, 22, 0.88)',
            backdropFilter: 'blur(10px)',
            padding: '7px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 255, 204, 0.35)',
            boxShadow: '0 0 16px rgba(0, 255, 204, 0.15)'
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#00ffcc',
              boxShadow: '0 0 10px #00ffcc'
            }}
          />
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '1.2px',
              color: '#00ffcc',
              textTransform: 'uppercase'
            }}
          >
            Tactical SOC Mesh ({topologyNodes.length} Active Nodes)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button
            onClick={toggleAutoRotate}
            title={autoRotate ? 'Pause Auto-Orbit' : 'Resume Auto-Orbit'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: autoRotate ? 'rgba(0, 255, 204, 0.18)' : 'rgba(6, 11, 22, 0.88)',
              backdropFilter: 'blur(10px)',
              border: `1px solid ${autoRotate ? '#00ffcc' : 'rgba(255, 255, 255, 0.2)'}`,
              color: autoRotate ? '#00ffcc' : '#f8fafc',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            {autoRotate ? <Pause size={12} /> : <Play size={12} />}
            Orbit: {autoRotate ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={handleResetCamera}
            title="Reset Isometric Camera Angle"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(6, 11, 22, 0.88)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(0, 255, 204, 0.35)',
              color: '#f8fafc',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.74rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            <RotateCcw size={12} color="#00ffcc" />
            Reset Camera
          </button>
        </div>
      </div>

      {/* Topology Legend Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 16,
          display: 'flex',
          gap: 16,
          background: 'rgba(6, 11, 22, 0.82)',
          backdropFilter: 'blur(8px)',
          padding: '6px 14px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '0.72rem',
          color: '#cbd5e1',
          pointerEvents: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#00ffcc', boxShadow: '0 0 8px #00ffcc' }} />
          <span>SOC Fortress Core</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981' }} />
          <span>Verified Shiki-kan</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f59e0b' }} />
          <span>Pending Approval</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#38bdf8' }} />
          <span>Infra / Operator Node</span>
        </div>
      </div>

      {/* Floating 3D Node Glass Tooltip */}
      {tooltip.visible && tooltip.node && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 16, (mountRef.current?.clientWidth || 900) - 240),
            top: Math.max(12, tooltip.y - 85),
            pointerEvents: 'none',
            background: 'rgba(10, 20, 38, 0.94)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${tooltip.node.isPending ? '#f59e0b' : tooltip.node.isShikikan ? '#10b981' : '#00ffcc'}`,
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.8)',
            minWidth: '220px',
            zIndex: 40
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f8fafc' }}>
              {tooltip.node.name}
            </span>
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '4px',
                background: tooltip.node.isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(100, 116, 139, 0.25)',
                color: tooltip.node.isOnline ? '#10b981' : '#94a3b8'
              }}
            >
              {tooltip.node.isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {tooltip.node.email && (
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 6, fontFamily: 'monospace' }}>
              {tooltip.node.email}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem' }}>
            <span style={{ color: '#64748b' }}>Role:</span>
            <span
              style={{
                color: tooltip.node.isShikikan
                  ? '#10b981'
                  : tooltip.node.isPending
                  ? '#f59e0b'
                  : '#38bdf8',
                fontWeight: 700
              }}
            >
              {tooltip.node.roleText}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTopology3D;

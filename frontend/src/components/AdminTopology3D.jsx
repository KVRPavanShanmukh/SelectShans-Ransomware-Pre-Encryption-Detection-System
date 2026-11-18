import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  RotateCcw,
  Compass,
  Crosshair,
  AlertTriangle,
  Play,
  Pause,
  Layers,
  Radio,
  Zap,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

/**
 * Studio-Grade Interactive 3D Isometric SOC & Endpoint Cyber-Topology
 * Modeled after Active Theory and Cloudflare Radar network visualizations.
 * Built with procedural Three.js architecture, UnrealBloomPass post-processing,
 * CatmullRom curved 3D fiber-optic conduits, projected 2D HUD tags, and camera fly-to.
 */
const AdminTopology3D = ({
  users = [],
  selectedUserId = null,
  hoveredUserId = null,
  flyToUserId = null,
  onSelectUser = () => {},
  onHoverUser = () => {}
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const nodesMapRef = useRef(new Map());
  const packetsRef = useRef([]);
  const coreAnimRef = useRef({});
  const radarWaveRef = useRef(null);
  const spotlightRef = useRef(null);
  const dustParticlesRef = useRef(null);
  const flyToTargetRef = useRef(null);
  const autoRotateRef = useRef(true);

  const [autoRotate, setAutoRotate] = useState(true);
  const [activePreset, setActivePreset] = useState('iso');
  const [projectedLabels, setProjectedLabels] = useState([]);
  const [hoveredNodeData, setHoveredNodeData] = useState(null);

  // Build a rich, balanced 3D topology dataset
  const topologyNodes = React.useMemo(() => {
    const list = [];

    // Real registered user endpoints
    users.forEach((u) => {
      list.push({
        id: u.id,
        name: u.username || `User-${u.id}`,
        email: u.email,
        type: 'endpoint',
        isShikikan: Boolean(u.shikikan_access),
        isPending: Boolean(u.shikikan_requested && !u.shikikan_access),
        isOnline: Boolean(u.is_online),
        dob: u.dob,
        lastActive: u.last_active,
        color: u.shikikan_access
          ? 0x00ffcc
          : u.shikikan_requested
          ? 0xff3b5c
          : 0x38bdf8,
        rawUser: u
      });
    });

    // If total endpoints is small, complement with Enterprise SOC Sentinel Nodes
    if (list.length < 5) {
      const standbys = [
        {
          id: 'infra-gateway',
          name: 'Gateway Sentinel Alpha',
          type: 'sentinel',
          roleText: 'Deep-Packet Filter',
          color: 0x38bdf8,
          isOnline: true
        },
        {
          id: 'infra-entropy',
          name: 'Entropy Surge Analyzer',
          type: 'sentinel',
          roleText: 'Pre-Encryption Engine',
          color: 0x00ffcc,
          isOnline: true
        },
        {
          id: 'infra-canary',
          name: 'Canary Array Prime',
          type: 'sentinel',
          roleText: 'Zero-Tamper Decoys',
          color: 0x10b981,
          isOnline: true
        },
        {
          id: 'infra-threat',
          name: 'Threat Oracle Delta',
          type: 'sentinel',
          roleText: 'Behavioral Risk ML',
          color: 0x818cf8,
          isOnline: true
        }
      ];

      standbys.slice(0, 5 - list.length).forEach((sb) => list.push(sb));
    }

    return list;
  }, [users]);

  // Smooth Camera Fly-To Trigger
  const triggerCameraFlyTo = useCallback((targetPosition, targetLookAt = new THREE.Vector3(0, 1.2, 0)) => {
    if (!controlsRef.current || !cameraRef.current) return;
    controlsRef.current.autoRotate = false;
    setAutoRotate(false);
    autoRotateRef.current = false;

    flyToTargetRef.current = {
      camPos: targetPosition.clone(),
      lookAt: targetLookAt.clone(),
      progress: 0
    };
  }, []);

  // Camera Preset Views
  const applyPresetView = (presetKey) => {
    setActivePreset(presetKey);
    if (!cameraRef.current || !controlsRef.current) return;

    if (presetKey === 'iso') {
      triggerCameraFlyTo(new THREE.Vector3(20, 18, 20), new THREE.Vector3(0, 1.2, 0));
    } else if (presetKey === 'radar') {
      triggerCameraFlyTo(new THREE.Vector3(0.01, 30, 0), new THREE.Vector3(0, 0, 0));
    } else if (presetKey === 'pending') {
      const pendingNode = topologyNodes.find((n) => n.isPending);
      if (pendingNode && nodesMapRef.current.has(pendingNode.id)) {
        const item = nodesMapRef.current.get(pendingNode.id);
        const nodePos = item.group.position;
        triggerCameraFlyTo(
          new THREE.Vector3(nodePos.x * 1.5, nodePos.y + 7, nodePos.z * 1.5),
          new THREE.Vector3(nodePos.x, nodePos.y + 1, nodePos.z)
        );
        onSelectUser(pendingNode.id);
      } else {
        triggerCameraFlyTo(new THREE.Vector3(18, 16, 18), new THREE.Vector3(0, 1, 0));
      }
    }
  };

  const toggleOrbitMode = () => {
    setAutoRotate((prev) => {
      const next = !prev;
      autoRotateRef.current = next;
      if (controlsRef.current) controlsRef.current.autoRotate = next;
      return next;
    });
  };

  // Listen to external fly-to requests from parent table
  useEffect(() => {
    if (flyToUserId && nodesMapRef.current.has(flyToUserId)) {
      const item = nodesMapRef.current.get(flyToUserId);
      const pos = item.group.position;
      triggerCameraFlyTo(
        new THREE.Vector3(pos.x * 1.45, pos.y + 6.5, pos.z * 1.45),
        new THREE.Vector3(pos.x, pos.y + 1.2, pos.z)
      );
    }
  }, [flyToUserId, triggerCameraFlyTo]);

  // Main Three.js Setup & Post-Processing Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 460;

    // 1. Scene & Deep Space Environment
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x04070f);
    scene.fog = new THREE.FogExp2(0x04070f, 0.022);

    // 2. Camera Setup (Perspective Isometric)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 600);
    camera.position.set(20, 18, 20);
    cameraRef.current = camera;

    // 3. WebGLRenderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false
    });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. UnrealBloomPass Studio Glow Post-Processing
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.85, // Bloom Strength
      0.45, // Bloom Radius
      0.22  // Bloom Threshold
    );
    composer.addPass(bloomPass);

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 0.6;
    controls.minDistance = 12;
    controls.maxDistance = 42;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 1.2, 0);

    controls.addEventListener('start', () => {
      // Pause auto-rotation when user actively grabs the scene
      controls.autoRotate = false;
      setAutoRotate(false);
      autoRotateRef.current = false;
    });

    // 6. Three-Point Cyber Lighting Rig
    const ambLight = new THREE.HemisphereLight(0x0d253f, 0x04070f, 2.0);
    scene.add(ambLight);

    const dirRim = new THREE.DirectionalLight(0x4338ca, 1.4);
    dirRim.position.set(-25, 20, -25);
    scene.add(dirRim);

    const dirKey = new THREE.DirectionalLight(0x00ffcc, 1.8);
    dirKey.position.set(25, 35, 25);
    dirKey.castShadow = true;
    dirKey.shadow.mapSize.width = 1024;
    dirKey.shadow.mapSize.height = 1024;
    scene.add(dirKey);

    const coreLight = new THREE.PointLight(0x00ffcc, 4.5, 30, 1.4);
    coreLight.position.set(0, 2.6, 0);
    scene.add(coreLight);
    coreAnimRef.current.coreLight = coreLight;

    const spot = new THREE.SpotLight(0x00ffcc, 0, 35, Math.PI / 4, 0.4, 1);
    spot.position.set(0, 18, 0);
    scene.add(spot);
    spotlightRef.current = spot;

    // 7. Multi-Layered Cyber Floor
    const primaryGrid = new THREE.GridHelper(48, 36, 0x00ffcc, 0x0d253f);
    primaryGrid.position.y = -0.01;
    scene.add(primaryGrid);

    // Static Concentric Range Rings
    [6.5, 12, 17.5].forEach((r, i) => {
      const ringGeo = new THREE.RingGeometry(r - 0.04, r + 0.04, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ffcc : i === 1 ? 0x38bdf8 : 0x0d253f,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: i === 0 ? 0.45 : i === 1 ? 0.35 : 0.22
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.012;
      scene.add(ring);
    });

    // Expanding Pulsing Radar Range Ring
    const radarGeo = new THREE.RingGeometry(0.5, 0.7, 64);
    const radarMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const radarWave = new THREE.Mesh(radarGeo, radarMat);
    radarWave.rotation.x = Math.PI / 2;
    radarWave.position.y = 0.016;
    scene.add(radarWave);
    radarWaveRef.current = radarWave;

    // 8. 600 Floating Ambient Data-Dust Particles
    const dustCount = 600;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount * 3; i += 3) {
      dustPos[i] = (Math.random() - 0.5) * 50;
      dustPos[i + 1] = Math.random() * 16;
      dustPos[i + 2] = (Math.random() - 0.5) * 50;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0x00ffcc,
      size: 0.16,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    dustParticlesRef.current = dust;

    // 9. Central SelectShans SOC Core Architectural Monument
    const coreGroup = new THREE.Group();

    // Dark-titanium base plinth with glowing cyan trim
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x081320,
      metalness: 0.92,
      roughness: 0.14,
      emissive: 0x011b2b,
      emissiveIntensity: 0.7
    });
    const baseCylinder = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.5, 8), plinthMat);
    baseCylinder.position.y = 0.25;
    coreGroup.add(baseCylinder);

    // Glowing cyan trim disc on base
    const trimDisc = new THREE.Mesh(
      new THREE.RingGeometry(3.6, 3.8, 48),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide })
    );
    trimDisc.rotation.x = Math.PI / 2;
    trimDisc.position.y = 0.51;
    coreGroup.add(trimDisc);

    // Mid-tier server battery ring with 8 server pillars
    for (let p = 0; p < 8; p++) {
      const ang = (p / 8) * Math.PI * 2;
      const px = Math.cos(ang) * 2.55;
      const pz = Math.sin(ang) * 2.55;
      const bladeGeo = new THREE.BoxGeometry(0.35, 1.15, 0.35);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x0f1d30,
        metalness: 0.88,
        roughness: 0.2,
        emissive: 0x00ffcc,
        emissiveIntensity: 0.35
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(px, 0.85, pz);
      coreGroup.add(blade);

      // Blinking status beacon LED on each pillar
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc })
      );
      led.position.set(px, 1.48, pz);
      coreGroup.add(led);
    }

    // Levitating central rotating crystal core
    const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x00ffcc,
      emissive: 0x00ffcc,
      emissiveIntensity: 0.98,
      metalness: 0.95,
      roughness: 0.05
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 2.45;
    coreGroup.add(crystal);
    coreAnimRef.current.crystal = crystal;

    // Counter-rotating outer wireframe cage
    const cageGeo = new THREE.IcosahedronGeometry(1.85, 0);
    const cageMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });
    const cage = new THREE.Mesh(cageGeo, cageMat);
    cage.position.y = 2.45;
    coreGroup.add(cage);
    coreAnimRef.current.cage = cage;

    // Three tilted orbital gyroscope scanner rings
    const ring1 = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.045, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.85 })
    );
    ring1.rotation.x = Math.PI / 3;
    ring1.position.y = 2.45;
    coreGroup.add(ring1);
    coreAnimRef.current.ring1 = ring1;

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.04, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 })
    );
    ring2.rotation.y = Math.PI / 4;
    ring2.position.y = 2.45;
    coreGroup.add(ring2);
    coreAnimRef.current.ring2 = ring2;

    const ring3 = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.035, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.7 })
    );
    ring3.rotation.z = Math.PI / 2.5;
    ring3.position.y = 2.45;
    coreGroup.add(ring3);
    coreAnimRef.current.ring3 = ring3;

    // Vertical holographic light beam column
    const beamGeo = new THREE.CylinderGeometry(0.14, 0.35, 8.5, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 5.8;
    coreGroup.add(beam);
    coreAnimRef.current.beam = beam;

    scene.add(coreGroup);

    // 10. Raycasting & Interaction Events
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e) => {
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
        const hitData = intersects[0].object.userData?.node;
        if (hitData) {
          container.style.cursor = 'pointer';
          setHoveredNodeData(hitData);
          onHoverUser(hitData.id);
          return;
        }
      } else {
        container.style.cursor = 'default';
        setHoveredNodeData(null);
        onHoverUser(null);
      }
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
        const hitData = intersects[0].object.userData?.node;
        if (hitData) {
          const item = nodesMapRef.current.get(hitData.id);
          if (item) {
            const p = item.group.position;
            triggerCameraFlyTo(
              new THREE.Vector3(p.x * 1.45, p.y + 6.5, p.z * 1.45),
              new THREE.Vector3(p.x, p.y + 1.2, p.z)
            );
          }
          onSelectUser(hitData.id);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('click', onClick);

    // Responsive Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera || !composer) return;
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 11. 60FPS Studio Render Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Camera Fly-To Smooth Interpolation
      if (flyToTargetRef.current) {
        const ft = flyToTargetRef.current;
        ft.progress += delta * 1.8;
        const alpha = Math.min(1.0, ft.progress);
        camera.position.lerp(ft.camPos, 0.08);
        controls.target.lerp(ft.lookAt, 0.08);
        if (alpha >= 1.0 && camera.position.distanceTo(ft.camPos) < 0.2) {
          flyToTargetRef.current = null;
        }
      }

      controls.update();

      // Core Citadel Animations
      const { crystal: c, cage: cg, ring1: r1, ring2: r2, ring3: r3, beam: bm, coreLight: cl } = coreAnimRef.current;
      if (c) {
        c.rotation.y += delta * 1.2;
        c.rotation.x = Math.sin(elapsed * 1.8) * 0.22;
      }
      if (cg) {
        cg.rotation.y -= delta * 0.7;
        cg.rotation.z = Math.cos(elapsed * 1.4) * 0.2;
      }
      if (r1) r1.rotation.z += delta * 0.9;
      if (r2) r2.rotation.z -= delta * 1.1;
      if (r3) r3.rotation.x += delta * 0.8;
      if (bm) bm.material.opacity = 0.25 + Math.sin(elapsed * 3.2) * 0.12;
      if (cl) cl.intensity = 4.2 + Math.sin(elapsed * 4.0) * 0.8;

      // Radar Range Wave Pulsing (every 4 seconds)
      if (radarWaveRef.current) {
        const radarCycle = (elapsed % 4.0) / 4.0;
        const currentRadius = 1.0 + radarCycle * 21.0;
        radarWaveRef.current.scale.set(currentRadius, currentRadius, 1);
        radarWaveRef.current.material.opacity = (1.0 - radarCycle) * 0.65;
      }

      // Animate Nodes & Crystals
      nodesMapRef.current.forEach((item) => {
        const { crystal: cr, haloRing, warningSpire, isPending } = item;
        if (cr) {
          cr.rotation.y += delta * (isPending ? 2.8 : 1.2);
          cr.position.y = 1.2 + Math.sin(elapsed * 3.0 + item.phase) * 0.14;
        }
        if (haloRing) {
          const factor = isPending ? 7.0 : 2.5;
          const amp = isPending ? 0.4 : 0.16;
          const scale = 1.0 + Math.abs(Math.sin(elapsed * factor + item.phase)) * amp;
          haloRing.scale.set(scale, scale, 1);
        }
        if (warningSpire) {
          warningSpire.material.opacity = 0.4 + Math.abs(Math.sin(elapsed * 6.0)) * 0.55;
        }
      });

      // Animate Luminous Telemetry Packets along Catmull-Rom Curvature
      packetsRef.current.forEach((pkt) => {
        pkt.t += delta * pkt.speed;
        if (pkt.t > 1) pkt.t = 0;
        const pos = pkt.curve.getPointAt(pkt.t);
        pkt.mesh.position.copy(pos);
      });

      // Atmospheric Data-Dust Particle Drift
      if (dustParticlesRef.current) {
        const arr = dustParticlesRef.current.geometry.attributes.position.array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] += delta * 0.4;
          if (arr[i] > 16) arr[i] = 0.1;
        }
        dustParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Project 3D Node Positions onto 2D Overlay Tags
      const screenCoords = [];
      const halfW = width / 2;
      const halfH = height / 2;
      const tempVec = new THREE.Vector3();

      nodesMapRef.current.forEach((item, id) => {
        tempVec.setFromMatrixPosition(item.group.matrixWorld);
        tempVec.y += 2.4; // Position tag directly above the tower top
        tempVec.project(camera);

        // Check if node is in front of the camera
        if (tempVec.z < 1.0) {
          const sx = tempVec.x * halfW + halfW;
          const sy = -(tempVec.y * halfH) + halfH;
          screenCoords.push({
            id,
            x: sx,
            y: sy,
            node: item.node,
            isHovered: hoveredUserId === id,
            isSelected: selectedUserId === id
          });
        }
      });
      setProjectedLabels(screenCoords);

      // Render with Studio Glow Post-Processing
      composer.render();
    };

    animate();

    // Full WebGL Resource Disposal on Component Unmount
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('click', onClick);

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      controls.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Synchronize 3D Endpoint Nodes & Fiber-Optic Arc Conduits
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous nodes and packets
    nodesMapRef.current.forEach((item) => {
      scene.remove(item.group);
      if (item.conduitTube) scene.remove(item.conduitTube);
    });
    nodesMapRef.current.clear();

    packetsRef.current.forEach((pkt) => scene.remove(pkt.mesh));
    packetsRef.current = [];

    const total = topologyNodes.length;
    const baseRadius = 12.5;

    topologyNodes.forEach((node, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 4;
      const radius = baseRadius + (idx % 2 === 1 ? 1.8 : -0.8);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(x, 0, z);

      // 1. Dark Metallic Pedestal Base
      const baseGeo = new THREE.CylinderGeometry(0.9, 1.2, 0.4, 6);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x081320,
        metalness: 0.9,
        roughness: 0.2,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 0.75 : 0.28
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.2;
      nodeGroup.add(baseMesh);

      // 2. Server Monolith Tower
      const towerGeo = new THREE.BoxGeometry(0.72, 1.35, 0.72);
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0x0c1b2f,
        metalness: 0.88,
        roughness: 0.16,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 0.6 : 0.25
      });
      const towerMesh = new THREE.Mesh(towerGeo, towerMat);
      towerMesh.position.y = 0.9;
      nodeGroup.add(towerMesh);

      // 3. Status Beacon Crystal hovering on top
      let crystalGeo;
      if (node.isPending) {
        crystalGeo = new THREE.ConeGeometry(0.42, 0.85, 4);
      } else if (node.isShikikan) {
        crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
      } else {
        crystalGeo = new THREE.DodecahedronGeometry(0.42, 0);
      }

      const crystalMat = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 1.0 : 0.8,
        metalness: 0.92,
        roughness: 0.08
      });
      const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
      crystalMesh.position.y = 1.95;
      nodeGroup.add(crystalMesh);

      // 4. Hovering Holographic Halo Ring
      const haloGeo = new THREE.RingGeometry(1.25, 1.45, 36);
      const haloMat = new THREE.MeshBasicMaterial({
        color: node.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: node.isPending ? 0.95 : 0.5
      });
      const haloRing = new THREE.Mesh(haloGeo, haloMat);
      haloRing.rotation.x = Math.PI / 2;
      haloRing.position.y = 0.02;
      nodeGroup.add(haloRing);

      // 5. High-Alert Warning Spire for Pending Approval
      let warningSpire = null;
      if (node.isPending) {
        const spireGeo = new THREE.CylinderGeometry(0.04, 0.12, 4.5, 8);
        const spireMat = new THREE.MeshBasicMaterial({
          color: 0xff3b5c,
          transparent: true,
          opacity: 0.85
        });
        warningSpire = new THREE.Mesh(spireGeo, spireMat);
        warningSpire.position.y = 4.2;
        nodeGroup.add(warningSpire);
      }

      // 6. Invisible Raycast Hit Cylinder
      const hitGeo = new THREE.CylinderGeometry(1.5, 1.5, 3.2, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.y = 1.6;
      hitMesh.userData = { node, id: node.id };
      nodeGroup.add(hitMesh);

      scene.add(nodeGroup);

      // 7. Sweeping 3D Arc Fiber-Optic Conduit (CatmullRomCurve3 + TubeGeometry)
      const pStart = new THREE.Vector3(x, 0.35, z);
      const pMid = new THREE.Vector3(x * 0.45, 1.8, z * 0.45);
      const pEnd = new THREE.Vector3(0, 0.75, 0);

      const conduitCurve = new THREE.CatmullRomCurve3([pStart, pMid, pEnd]);
      const tubeGeo = new THREE.TubeGeometry(conduitCurve, 32, 0.05, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.isPending ? 0.95 : 0.45,
        transparent: true,
        opacity: node.isPending ? 0.9 : 0.5
      });
      const conduitTube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(conduitTube);

      // 8. Luminous Energy Spheres (Telemetry Packets)
      [0.0, 0.5].forEach((offset) => {
        const pktGeo = new THREE.SphereGeometry(0.18, 8, 8);
        const pktMat = new THREE.MeshBasicMaterial({
          color: node.isPending ? 0xff3b5c : node.color
        });
        const pktMesh = new THREE.Mesh(pktGeo, pktMat);
        scene.add(pktMesh);

        packetsRef.current.push({
          mesh: pktMesh,
          curve: conduitCurve,
          t: offset,
          speed: node.isPending ? 0.75 : 0.45
        });
      });

      nodesMapRef.current.set(node.id, {
        group: nodeGroup,
        crystal: crystalMesh,
        haloRing,
        warningSpire,
        conduitTube,
        hitMesh,
        node,
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
      item.group.scale.set(1.2, 1.2, 1.2);
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
        overflow: 'hidden',
        border: '1px solid rgba(0, 255, 204, 0.22)',
        borderRadius: '14px',
        background: '#04070f',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)'
      }}
    >
      {/* 3D WebGL Canvas Stage */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', display: 'block' }} />

      {/* 3D-to-2D Projected HUD Callout Tags (Zero-Lag Projected Labels) */}
      <div
        className="topology-projected-tags-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        {projectedLabels.map((lbl) => {
          const isPending = lbl.node.isPending;
          const isShikikan = lbl.node.isShikikan;
          const isHighlighted = lbl.isHovered || lbl.isSelected;

          let badgeBorder = 'rgba(0, 255, 204, 0.35)';
          let badgeBg = 'rgba(6, 14, 28, 0.82)';
          let dotColor = '#38bdf8';
          let statusText = 'STANDARD';

          if (isPending) {
            badgeBorder = '#ff3b5c';
            badgeBg = 'rgba(38, 10, 18, 0.92)';
            dotColor = '#ff3b5c';
            statusText = 'PENDING APPROVAL';
          } else if (isShikikan) {
            badgeBorder = '#00ffcc';
            badgeBg = 'rgba(6, 24, 24, 0.88)';
            dotColor = '#00ffcc';
            statusText = 'VERIFIED';
          }

          return (
            <div
              key={lbl.id}
              style={{
                position: 'absolute',
                left: `${lbl.x}px`,
                top: `${lbl.y}px`,
                transform: `translate(-50%, -100%) scale(${isHighlighted ? 1.15 : 1.0})`,
                transition: 'transform 0.15s ease',
                pointerEvents: 'auto',
                cursor: 'pointer'
              }}
              onClick={() => onSelectUser(lbl.id)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: '16px',
                  background: badgeBg,
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${isHighlighted ? '#00ffcc' : badgeBorder}`,
                  boxShadow: isHighlighted ? '0 0 14px rgba(0, 255, 204, 0.45)' : '0 4px 12px rgba(0, 0, 0, 0.6)',
                  whiteSpace: 'nowrap'
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: `0 0 6px ${dotColor}`
                  }}
                />
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.4px' }}>
                  @{lbl.node.name}
                </span>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: dotColor, opacity: 0.9 }}>
                  • {statusText}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Glass Camera HUD Presets Deck */}
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
            background: 'rgba(6, 12, 24, 0.86)',
            backdropFilter: 'blur(12px)',
            padding: '7px 16px',
            borderRadius: '8px',
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
            Live Cyber-Topology Mesh ({topologyNodes.length} Nodes)
          </span>
        </div>

        {/* Camera Preset Controls */}
        <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>
          <button
            onClick={() => applyPresetView('iso')}
            className={`topology-hud-chip ${activePreset === 'iso' ? 'active' : ''}`}
            title="Isometric 35° Perspective"
          >
            <Compass size={12} />
            <span>Isometric</span>
          </button>

          <button
            onClick={() => applyPresetView('radar')}
            className={`topology-hud-chip ${activePreset === 'radar' ? 'active' : ''}`}
            title="Top-Down Tactical Radar"
          >
            <Crosshair size={12} />
            <span>Top Radar</span>
          </button>

          <button
            onClick={() => applyPresetView('pending')}
            className={`topology-hud-chip ${activePreset === 'pending' ? 'active' : ''}`}
            title="Focus Pending Approval Node"
          >
            <AlertTriangle size={12} color="#ff3b5c" />
            <span>Focus Pending</span>
          </button>

          <button
            onClick={toggleOrbitMode}
            className={`topology-hud-chip ${autoRotate ? 'active' : ''}`}
            title="Toggle Cinematic Auto-Rotation"
          >
            {autoRotate ? <Pause size={12} /> : <Play size={12} />}
            <span>Auto-Orbit: {autoRotate ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={handleResetCamera}
            className="topology-hud-chip"
            title="Reset Camera Orientation"
          >
            <RotateCcw size={12} color="#00ffcc" />
          </button>
        </div>
      </div>

      {/* Cyber Legend Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 16,
          display: 'flex',
          gap: 16,
          background: 'rgba(6, 12, 24, 0.82)',
          backdropFilter: 'blur(8px)',
          padding: '6px 14px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.72rem',
          color: '#94a3b8',
          pointerEvents: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#00ffcc', boxShadow: '0 0 8px #00ffcc' }} />
          <span>SOC Quantum Core</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#00ffcc' }} />
          <span>Shiki-kan Verified</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff3b5c', boxShadow: '0 0 8px #ff3b5c' }} />
          <span>Pending Approval</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#38bdf8' }} />
          <span>Standard Endpoint</span>
        </div>
      </div>
    </div>
  );
};

export default AdminTopology3D;

import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

export type HoloPoint = {id: string; x: number; z: number; height: number; color: string; selected: boolean; dim: boolean};
export type HoloLabel = {key: string; text: string; x: number; y: number; z: number; className: string};
export type HoloState = {
  mode: 'radar' | 'map';
  /** Scene units: the radar's outer ring and the map's edge both sit at about 100. */
  points: HoloPoint[];
  labels: HoloLabel[];
  /** Radians the scene is turned so that the wearer's heading points away from the camera. */
  turn: number;
  /** Mission path through the scene, in visiting order. */
  route: [number, number][];
  self: [number, number] | null;
  accent: string;
  dim: string;
  /** Sweep and orbit animate; otherwise the scene is redrawn only when it changes. */
  motion: boolean;
};

export type Hologram = {update: (state: HoloState) => void; resize: (width: number, height: number) => void; dispose: () => void};

const FRAME_MS = 1000 / 30;
const RADIUS = 100;

function circle(radius: number, segments = 96): BufferGeometry {
  const points: number[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
}

function grid(half: number, step: number): BufferGeometry {
  const points: number[] = [];
  for (let v = -half; v <= half; v += step) points.push(-half, 0, v, half, 0, v, v, 0, -half, v, 0, half);
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
}

/**
 * Draws the park as glowing wireframe geometry on a transparent (black) canvas: a tilted
 * radar disc or a slowly orbiting map, with a pillar per ride whose height is its wait.
 * Text is never drawn in WebGL; labels are DOM elements positioned over the canvas.
 */
export function createHologram(canvas: HTMLCanvasElement, labelLayer: HTMLElement): Hologram {
  const renderer = new WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1, 1, 1000);
  const world = new Group();
  scene.add(world);

  const base = new Group();
  const pillars = new Group();
  const extras = new Group();
  world.add(base, pillars, extras);

  const sweep = new Mesh(
    new CircleGeometry(RADIUS, 24, 0, 0.7).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false}),
  );
  const marker = new Mesh(
    new RingGeometry(5, 6.5, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({color: 0xffffff, side: DoubleSide}),
  );
  const box = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  let state: HoloState | null = null;
  let builtFor = '';
  let width = 1;
  let height = 1;
  let frame = 0;
  let last = 0;
  let disposed = false;
  const labelEls = new Map<string, HTMLElement>();
  const scratch = new Vector3();

  function clear(group: Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      const item = child as Mesh;
      if (item.geometry !== box && item.geometry !== sweep.geometry && item.geometry !== marker.geometry) item.geometry?.dispose();
      if (item !== sweep && item !== marker) (item.material as MeshBasicMaterial | undefined)?.dispose();
    }
  }

  function build(next: HoloState) {
    const accent = new Color(next.accent);
    const dim = new Color(next.dim);
    const signature = `${next.mode}|${next.accent}`;
    if (signature !== builtFor) {
      builtFor = signature;
      clear(base);
      if (next.mode === 'radar') {
        for (const [radius, bright] of [[RADIUS, true], [RADIUS * 0.66, false], [RADIUS * 0.33, false]] as const) {
          base.add(new LineLoop(circle(radius), new LineBasicMaterial({color: bright ? accent : dim})));
        }
        const cross = new BufferGeometry().setAttribute(
          'position',
          new Float32BufferAttribute([-RADIUS, 0, 0, RADIUS, 0, 0, 0, 0, -RADIUS, 0, 0, RADIUS], 3),
        );
        base.add(new LineSegments(cross, new LineBasicMaterial({color: dim})));
        sweep.material.color = accent;
        base.add(sweep);
      } else {
        base.add(new LineSegments(grid(120, 20), new LineBasicMaterial({color: dim, transparent: true, opacity: 0.45})));
        base.add(new LineLoop(circle(118, 4).rotateY(Math.PI / 4), new LineBasicMaterial({color: accent})));
      }
    }

    clear(pillars);
    for (const point of next.points) {
      const side = point.selected ? 5 : 3.2;
      const material = new MeshBasicMaterial({color: point.color, transparent: true, opacity: point.dim ? 0.4 : point.selected ? 1 : 0.85});
      const mesh = new Mesh(box, material);
      mesh.scale.set(side, Math.max(1.5, point.height), side);
      mesh.position.set(point.x, 0, point.z);
      pillars.add(mesh);
    }

    clear(extras);
    const chosen = next.points.find(point => point.selected);
    if (chosen) {
      marker.position.set(chosen.x, 0.3, chosen.z);
      extras.add(marker);
      const beam = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([chosen.x, 0, chosen.z, chosen.x, Math.max(chosen.height + 14, 40), chosen.z], 3),
      );
      extras.add(new Line(beam, new LineBasicMaterial({color: 0xffffff})));
    }
    if (next.route.length > 1) {
      const path: number[] = [];
      for (const [x, z] of next.route) path.push(x, 1, z);
      extras.add(new Line(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(path, 3)), new LineBasicMaterial({color: 0xffb43a})));
    }
    if (next.self) {
      const cone = new Mesh(new ConeGeometry(4, 11, 3).rotateX(-Math.PI / 2), new MeshBasicMaterial({color: 0xffffff}));
      cone.position.set(next.self[0], 2, next.self[1]);
      // In radar mode the scene turns under a fixed arrow; on the map the arrow turns instead.
      cone.rotation.y = next.mode === 'map' ? -next.turn : next.turn;
      extras.add(cone);
    }

    const wanted = new Set(next.labels.map(label => label.key));
    for (const [key, el] of labelEls) {
      if (!wanted.has(key)) {
        el.remove();
        labelEls.delete(key);
      }
    }
    for (const label of next.labels) {
      let el = labelEls.get(label.key);
      if (!el) {
        el = document.createElement('span');
        labelLayer.appendChild(el);
        labelEls.set(label.key, el);
      }
      el.className = `holo-label ${label.className}`;
      el.textContent = label.text;
    }
  }

  function draw(time: number) {
    if (!state) return;
    const seconds = time / 1000;
    if (state.mode === 'radar') {
      world.rotation.y = state.turn;
      camera.position.set(0, 172, 204);
      camera.lookAt(0, 0, 4);
      // The sweep stays put relative to the screen, not the turning scene.
      sweep.rotation.y = -state.turn - (state.motion ? seconds * 1.4 : 0.6);
    } else {
      world.rotation.y = 0;
      const orbit = state.motion ? Math.sin(seconds * 0.16) * 0.7 : 0;
      camera.position.set(Math.sin(orbit) * 232, 150, Math.cos(orbit) * 232);
      camera.lookAt(0, 4, 0);
    }
    const pulse = state.motion ? 1 + Math.sin(seconds * 5) * 0.18 : 1;
    marker.scale.set(pulse, 1, pulse);
    renderer.render(scene, camera);

    for (const label of state.labels) {
      const el = labelEls.get(label.key);
      if (!el) continue;
      scratch.set(label.x, label.y, label.z).applyMatrix4(world.matrixWorld).project(camera);
      const visible = scratch.z < 1;
      el.style.display = visible ? '' : 'none';
      el.style.transform = `translate(-50%, -100%) translate(${((scratch.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-scratch.y * 0.5 + 0.5) * height).toFixed(1)}px)`;
    }
  }

  function tick(time: number) {
    frame = 0;
    if (disposed) return;
    if (time - last >= FRAME_MS - 2) {
      last = time;
      draw(time);
    }
    if (state?.motion && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  }

  const onVisible = () => {
    if (!document.hidden) schedule();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    update(next) {
      state = next;
      build(next);
      last = 0;
      schedule();
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      last = 0;
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisible);
      clear(base);
      clear(pillars);
      clear(extras);
      for (const el of labelEls.values()) el.remove();
      box.dispose();
      sweep.geometry.dispose();
      sweep.material.dispose();
      marker.geometry.dispose();
      (marker.material as MeshBasicMaterial).dispose();
      renderer.dispose();
    },
  };
}

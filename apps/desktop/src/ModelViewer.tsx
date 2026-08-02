import {
  decodeTf2Mesh,
  parseTf2Mesh,
  parseTf2Model,
  type ModelLod,
  type Tf2Model
} from "@tpf2-mod-studio/core";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { DesktopBridge } from "./bridge";
import { useI18n } from "./i18n";

/**
 * Transport Fever 2 stores transforms as 16 numbers in column-major order,
 * which is exactly what `Matrix4.fromArray` expects.
 */
function toMatrix(transform: number[]): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  if (transform.length === 16) matrix.fromArray(transform);
  return matrix;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

interface BuiltScene {
  group: THREE.Group;
  triangles: number;
  parts: number;
  missing: string[];
}

async function buildLod(
  bridge: DesktopBridge,
  rootPath: string,
  lod: ModelLod
): Promise<BuiltScene> {
  const group = new THREE.Group();
  const missing: string[] = [];
  let triangles = 0;
  let parts = 0;

  const material = new THREE.MeshStandardMaterial({
    color: 0xb9c2cc,
    metalness: 0.05,
    roughness: 0.85,
    side: THREE.DoubleSide,
    flatShading: false
  });

  for (const part of lod.parts) {
    const meshPath = `res/models/mesh/${part.mesh}`;
    let descriptor;
    let blob;
    try {
      const [descriptorFile, blobFile] = await Promise.all([
        bridge.readModelFile(rootPath, meshPath),
        bridge.readModelFile(rootPath, `${meshPath}.blob`)
      ]);
      descriptor = descriptorFile.text;
      blob = blobFile.base64;
    } catch {
      // Meshes supplied by the base game are not inside the mod folder.
      missing.push(part.mesh);
      continue;
    }
    if (descriptor === undefined || blob === undefined) {
      missing.push(part.mesh);
      continue;
    }
    const parsed = parseTf2Mesh(descriptor);
    if (parsed === undefined) {
      missing.push(part.mesh);
      continue;
    }
    const subMeshes = decodeTf2Mesh(parsed, decodeBase64(blob));
    for (const sub of subMeshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(sub.positions, 3)
      );
      if (sub.normals !== undefined) {
        geometry.setAttribute(
          "normal",
          new THREE.BufferAttribute(sub.normals, 3)
        );
      }
      geometry.setIndex(new THREE.BufferAttribute(sub.indices, 1));
      if (sub.normals === undefined) geometry.computeVertexNormals();

      const object = new THREE.Mesh(geometry, material);
      object.applyMatrix4(toMatrix(part.transform));
      group.add(object);
      triangles += sub.indices.length / 3;
      parts += 1;
    }
  }

  return { group, triangles, parts, missing };
}

export default function ModelViewer({
  bridge,
  modelPath,
  rootPath
}: {
  bridge: DesktopBridge;
  modelPath: string;
  rootPath: string;
}) {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<Tf2Model>();
  const [lodIndex, setLodIndex] = useState(0);
  const [showCollider, setShowCollider] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [stats, setStats] = useState<{
    triangles: number;
    parts: number;
    missing: string[];
  }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setModel(undefined);
    setError(undefined);
    void bridge
      .readModelFile(rootPath, modelPath)
      .then((file) => {
        if (cancelled) return;
        const parsed =
          file.text === undefined ? undefined : parseTf2Model(file.text);
        if (parsed === undefined) {
          setError(t("modelParseFailed"));
          return;
        }
        setModel(parsed);
        setLodIndex(0);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, modelPath, rootPath, t]);

  useEffect(() => {
    const mount = mountRef.current;
    const lod = model?.lods[lodIndex];
    if (mount === null || model === undefined || lod === undefined) {
      return undefined;
    }

    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14181d);
    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / Math.max(1, mount.clientHeight),
      0.01,
      5000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 8, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x99bbff, 0.7);
    fill.position.set(-6, 3, -4);
    scene.add(fill);
    // Transport Fever 2 is Z-up; rotate so the ground plane reads correctly.
    scene.add(new THREE.GridHelper(40, 40, 0x2a3038, 0x20252b));

    let frame = 0;
    void buildLod(bridge, rootPath, lod).then((built) => {
      if (disposed) return;
      built.group.rotation.x = -Math.PI / 2;
      scene.add(built.group);
      setStats({
        triangles: built.triangles,
        parts: built.parts,
        missing: built.missing
      });

      const box = new THREE.Box3().setFromObject(built.group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z, 1);
      camera.position.set(
        center.x + extent * 1.1,
        center.y + extent * 0.8,
        center.z + extent * 1.3
      );
      controls.target.copy(center);
      controls.update();

      if (showCollider && model.collider?.halfExtents !== undefined) {
        const [hx, hy, hz] = model.collider.halfExtents;
        const helper = new THREE.Box3Helper(
          new THREE.Box3(
            new THREE.Vector3(-hx, -hz, -hy),
            new THREE.Vector3(hx, hz, hy)
          ),
          new THREE.Color(0xf5a524)
        );
        scene.add(helper);
      }
      if (showCollider && model.boundingBox !== undefined) {
        const { min, max } = model.boundingBox;
        scene.add(
          new THREE.Box3Helper(
            new THREE.Box3(
              new THREE.Vector3(min[0], min[2], min[1]),
              new THREE.Vector3(max[0], max[2], max[1])
            ),
            new THREE.Color(0x3b82f6)
          )
        );
      }
      built.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          (object.material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      });
    });

    function animate(): void {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const observer = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    observer.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [bridge, model, lodIndex, rootPath, showCollider, wireframe]);

  if (error !== undefined) {
    return <p className="model-viewer-error">{error}</p>;
  }
  if (model === undefined) {
    return <p className="model-viewer-hint">{t("modelLoading")}</p>;
  }

  return (
    <div className="model-viewer">
      <div className="model-viewer-toolbar">
        {model.lods.length > 1 ? (
          <label className="model-lod">
            <span>{t("modelLod")}</span>
            <select
              onChange={(event) => setLodIndex(Number(event.target.value))}
              value={lodIndex}
            >
              {model.lods.map((lod) => (
                <option key={lod.index} value={lod.index}>
                  {t("modelLodOption", {
                    index: lod.index,
                    count: lod.parts.length
                  })}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="check-row">
          <input
            checked={wireframe}
            onChange={(event) => setWireframe(event.target.checked)}
            type="checkbox"
          />
          <span>{t("modelWireframe")}</span>
        </label>
        <label className="check-row">
          <input
            checked={showCollider}
            onChange={(event) => setShowCollider(event.target.checked)}
            type="checkbox"
          />
          <span>{t("modelShowBounds")}</span>
        </label>
      </div>
      <div className="model-viewer-canvas" ref={mountRef} />
      <div className="model-viewer-stats">
        {stats === undefined ? (
          <span>{t("modelLoading")}</span>
        ) : (
          <>
            <span>
              {t("modelStats", {
                parts: stats.parts,
                triangles: stats.triangles.toLocaleString()
              })}
            </span>
            {model.collider === undefined ? null : (
              <span>
                {t("modelCollider", { type: model.collider.type })}
              </span>
            )}
            {stats.missing.length === 0 ? null : (
              <span className="model-missing">
                {t("modelMissingMeshes", { count: stats.missing.length })}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

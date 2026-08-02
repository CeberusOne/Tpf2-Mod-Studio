import { parseLuaData, type LuaValue } from "./lua-data.js";

/** One drawable part: a mesh reference with its transform and materials. */
export interface ModelPart {
  name: string;
  /** Mesh path relative to `res/models/mesh/`. */
  mesh: string;
  /** Material paths relative to `res/models/material/`. */
  materials: string[];
  /** Column-major 4x4 transform, as stored by Transport Fever 2. */
  transform: number[];
  /** Names of keyframe animations declared on this part. */
  animations: string[];
}

export interface ModelLod {
  index: number;
  parts: ModelPart[];
  visibleFrom?: number;
  visibleTo?: number;
}

export interface ModelCollider {
  type: string;
  halfExtents?: [number, number, number];
  radius?: number;
  transform?: number[];
}

export interface Tf2Model {
  lods: ModelLod[];
  boundingBox?: { min: [number, number, number]; max: [number, number, number] };
  collider?: ModelCollider;
  /** Raw `metadata` table, kept as parsed data for the property panel. */
  metadata?: LuaValue;
}

/** Vertex attribute slice inside the `.msh.blob` payload. */
export interface MeshAttribute {
  /** Byte offset into the blob. */
  offset: number;
  /** Length in bytes. */
  count: number;
  /** Components per vertex. */
  numComp: number;
}

export interface MeshSubMesh {
  indices: Record<string, MeshAttribute>;
}

export interface Tf2Mesh {
  vertexAttr: Record<string, MeshAttribute>;
  subMeshes: MeshSubMesh[];
}

export interface DecodedSubMesh {
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
}

function asRecord(value: LuaValue | undefined): Record<string, LuaValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, LuaValue>)
    : {};
}

function asArray(value: LuaValue | undefined): LuaValue[] {
  return Array.isArray(value) ? value : [];
}

function numbers(value: LuaValue | undefined): number[] {
  return asArray(value).filter((item): item is number => typeof item === "number");
}

function attribute(value: LuaValue | undefined): MeshAttribute | undefined {
  const record = asRecord(value);
  const offset = record["offset"];
  const count = record["count"];
  if (typeof offset !== "number" || typeof count !== "number") return undefined;
  const numComp = record["numComp"];
  return {
    offset,
    count,
    numComp: typeof numComp === "number" ? numComp : 1
  };
}

function collectParts(node: LuaValue | undefined, into: ModelPart[]): void {
  const record = asRecord(node);
  const mesh = record["mesh"];
  if (typeof mesh === "string") {
    const name = record["name"];
    into.push({
      name: typeof name === "string" ? name : mesh,
      mesh,
      materials: asArray(record["materials"]).filter(
        (item): item is string => typeof item === "string"
      ),
      transform: numbers(record["transf"]),
      animations: Object.keys(asRecord(record["animations"]))
    });
  }
  for (const child of asArray(record["children"])) {
    collectParts(child, into);
  }
}

/** Parse a `.mdl` resource into LODs, bounding box and collider. */
export function parseTf2Model(content: string): Tf2Model | undefined {
  const data = parseLuaData(content);
  if (data === undefined) return undefined;
  const root = asRecord(data);

  const lods: ModelLod[] = asArray(root["lods"]).map((entry, index) => {
    const lod = asRecord(entry);
    const parts: ModelPart[] = [];
    collectParts(lod["node"], parts);
    const from = lod["visibleFrom"];
    const to = lod["visibleTo"];
    return {
      index,
      parts,
      ...(typeof from === "number" ? { visibleFrom: from } : {}),
      ...(typeof to === "number" ? { visibleTo: to } : {})
    };
  });

  const bounding = asRecord(root["boundingInfo"]);
  const min = numbers(bounding["bbMin"]);
  const max = numbers(bounding["bbMax"]);

  const colliderRecord = asRecord(root["collider"]);
  const colliderType = colliderRecord["type"];
  const colliderParams = asRecord(colliderRecord["params"]);
  const halfExtents = numbers(colliderParams["halfExtents"]);
  const radius = colliderParams["radius"];

  return {
    lods,
    ...(min.length === 3 && max.length === 3
      ? {
          boundingBox: {
            min: [min[0]!, min[1]!, min[2]!],
            max: [max[0]!, max[1]!, max[2]!]
          }
        }
      : {}),
    ...(typeof colliderType === "string"
      ? {
          collider: {
            type: colliderType,
            ...(halfExtents.length === 3
              ? {
                  halfExtents: [
                    halfExtents[0]!,
                    halfExtents[1]!,
                    halfExtents[2]!
                  ] as [number, number, number]
                }
              : {}),
            ...(typeof radius === "number" ? { radius } : {}),
            transform: numbers(colliderRecord["transf"])
          }
        }
      : {}),
    ...(root["metadata"] === undefined ? {} : { metadata: root["metadata"] })
  };
}

/** Parse a `.msh` descriptor: attribute offsets into the companion blob. */
export function parseTf2Mesh(content: string): Tf2Mesh | undefined {
  const data = parseLuaData(content);
  if (data === undefined) return undefined;
  const root = asRecord(data);

  const vertexAttr: Record<string, MeshAttribute> = {};
  for (const [key, value] of Object.entries(asRecord(root["vertexAttr"]))) {
    const parsed = attribute(value);
    if (parsed !== undefined) vertexAttr[key] = parsed;
  }

  const subMeshes: MeshSubMesh[] = asArray(root["subMeshes"]).map((entry) => {
    const indices: Record<string, MeshAttribute> = {};
    for (const [key, value] of Object.entries(
      asRecord(asRecord(entry)["indices"])
    )) {
      const parsed = attribute(value);
      if (parsed !== undefined) indices[key] = parsed;
    }
    return { indices };
  });

  return { vertexAttr, subMeshes };
}

function readFloats(
  blob: ArrayBuffer,
  attr: MeshAttribute | undefined
): Float32Array | undefined {
  if (attr === undefined) return undefined;
  const floats = attr.count / 4;
  if (!Number.isInteger(floats) || attr.offset + attr.count > blob.byteLength) {
    return undefined;
  }
  // The blob is not guaranteed to be 4-byte aligned at every offset, so copy
  // instead of creating a view over the original buffer.
  return new Float32Array(blob.slice(attr.offset, attr.offset + attr.count));
}

function readIndices(
  blob: ArrayBuffer,
  attr: MeshAttribute | undefined
): Uint32Array | undefined {
  if (attr === undefined) return undefined;
  const values = attr.count / 4;
  if (!Number.isInteger(values) || attr.offset + attr.count > blob.byteLength) {
    return undefined;
  }
  return new Uint32Array(blob.slice(attr.offset, attr.offset + attr.count));
}

/**
 * Decode a mesh into renderable buffers.
 *
 * Offsets and counts in the `.msh` descriptor are byte based; positions,
 * normals and UVs are 32-bit floats and indices are 32-bit unsigned integers.
 * Verified against installed Workshop meshes: position and uv0 yield the same
 * vertex count, and the highest index stays inside that count.
 */
export function decodeTf2Mesh(
  mesh: Tf2Mesh,
  blob: ArrayBuffer
): DecodedSubMesh[] {
  const positions = readFloats(blob, mesh.vertexAttr["position"]);
  if (positions === undefined) return [];
  const normals = readFloats(blob, mesh.vertexAttr["normal"]);
  const uvs = readFloats(blob, mesh.vertexAttr["uv0"]);
  const vertexCount = positions.length / 3;

  const decoded: DecodedSubMesh[] = [];
  for (const subMesh of mesh.subMeshes) {
    const indices = readIndices(blob, subMesh.indices["position"]);
    if (indices === undefined || indices.length === 0) continue;
    // Reject meshes whose indices do not address the decoded vertices rather
    // than handing WebGL a buffer that renders as garbage.
    let valid = true;
    for (const index of indices) {
      if (index >= vertexCount) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    decoded.push({
      positions,
      indices,
      ...(normals !== undefined && normals.length === positions.length
        ? { normals }
        : {}),
      ...(uvs !== undefined && uvs.length / 2 === vertexCount ? { uvs } : {})
    });
  }
  return decoded;
}

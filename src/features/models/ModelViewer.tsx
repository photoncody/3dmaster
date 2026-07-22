"use client";

import { Canvas } from "@react-three/fiber";
import { Center, Environment, OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

function MeshFromGeometry({ geometry }: { geometry: THREE.BufferGeometry }) {
  const geo = useMemo(() => {
    geometry.computeVertexNormals();
    geometry.center();
    return geometry;
  }, [geometry]);

  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#2f6f55" metalness={0.15} roughness={0.45} />
    </mesh>
  );
}

function LoadedModel({ url, format }: { url: string; format: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGeometry(null);
    setError(null);

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load model data");
        const buffer = await res.arrayBuffer();
        const fmt = format.toLowerCase();

        if (fmt === "stl") {
          const loader = new STLLoader();
          const geo = loader.parse(buffer);
          if (!cancelled) setGeometry(geo);
          return;
        }

        if (fmt === "obj") {
          const text = new TextDecoder().decode(buffer);
          const loader = new OBJLoader();
          const obj = loader.parse(text);
          const geos: THREE.BufferGeometry[] = [];
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              geos.push((child as THREE.Mesh).geometry.clone());
            }
          });
          if (geos.length === 0) throw new Error("No mesh in OBJ");
          // Use first mesh for simplicity
          if (!cancelled) setGeometry(geos[0]);
          return;
        }

        if (fmt === "3mf") {
          // three.js 3MFLoader is async-module; dynamic import
          const { ThreeMFLoader } = await import(
            "three/examples/jsm/loaders/3MFLoader.js"
          );
          const loader = new ThreeMFLoader();
          const group = loader.parse(buffer) as THREE.Group;
          let found: THREE.BufferGeometry | null = null;
          group.traverse((child) => {
            if (!found && (child as THREE.Mesh).isMesh) {
              found = (child as THREE.Mesh).geometry.clone();
            }
          });
          if (!found) throw new Error("No mesh in 3MF");
          if (!cancelled) setGeometry(found);
          return;
        }

        throw new Error(`Unsupported view format: ${format}`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [url, format]);

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#b91c1c" wireframe />
      </mesh>
    );
  }

  if (!geometry) return null;
  return (
    <Center>
      <MeshFromGeometry geometry={geometry} />
    </Center>
  );
}

export function ModelViewer({
  url,
  format,
}: {
  url: string;
  format: string;
}) {
  if (!url) return null;

  return (
    <div className="viewer-frame">
      <Canvas
        camera={{ position: [80, 60, 80], fov: 45 }}
        gl={{ alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[40, 80, 30]} intensity={1.1} />
        <Suspense fallback={null}>
          <LoadedModel url={url} format={format} />
          <Environment preset="warehouse" />
        </Suspense>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

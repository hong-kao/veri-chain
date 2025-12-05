import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
    simulationVertexShader,
    simulationFragmentShader,
    renderVertexShader,
    renderFragmentShader,
} from "../lib/shaders";

export default function WaterCanvas() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const scene = new THREE.Scene();
        const simScene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        const mountTarget = containerRef.current ?? document.body;
        mountTarget.appendChild(renderer.domElement);

        const mouse = new THREE.Vector2();
        let frame = 0;

        const getWidth = () => window.innerWidth * window.devicePixelRatio;
        const getHeight = () => window.innerHeight * window.devicePixelRatio;

        let width = getWidth();
        let height = getHeight();

        const options: THREE.RenderTargetOptions = {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            stencilBuffer: false,
            depthBuffer: false,
        };
        let rtA = new THREE.WebGLRenderTarget(width, height, options);
        let rtB = new THREE.WebGLRenderTarget(width, height, options);

        const simMaterial = new THREE.ShaderMaterial({
            uniforms: {
                textureA: { value: null },
                mouse: { value: mouse },
                resolution: { value: new THREE.Vector2(width, height) },
                time: { value: 0 },
                frame: { value: 0 },
            },
            vertexShader: simulationVertexShader,
            fragmentShader: simulationFragmentShader,
        });

        const renderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                textureA: { value: null },
                textureB: { value: null },
                resolution: { value: new THREE.Vector2(width, height) },
                time: { value: 0 },
            },
            vertexShader: renderVertexShader,
            fragmentShader: renderFragmentShader,
            transparent: true,
        });

        const plane = new THREE.PlaneGeometry(2, 2);
        const simQuad = new THREE.Mesh(plane, simMaterial);
        const renderQuad = new THREE.Mesh(plane, renderMaterial);

        simScene.add(simQuad);
        scene.add(renderQuad);

        const canvas2d = document.createElement("canvas");
        canvas2d.width = width;
        canvas2d.height = height;
        const ctx = canvas2d.getContext("2d", { alpha: true });
        if (!ctx) return () => { };

        const textTexture = new THREE.CanvasTexture(canvas2d);
        textTexture.minFilter = THREE.LinearFilter;
        textTexture.magFilter = THREE.LinearFilter;
        textTexture.format = THREE.RGBAFormat;

        // Function to draw content
        const drawContent = () => {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);

            const newMainFontSize = Math.round(200 * window.devicePixelRatio);
            const newSubtitleFontSize = Math.round(24 * window.devicePixelRatio);

            ctx.fillStyle = "#ffffff";
            // Use Gavency font for main title
            ctx.font = `${newMainFontSize}px Gavency`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Main title
            ctx.fillText("VeriChain", width / 2, height / 2);

            // Subtitle
            ctx.font = `${newSubtitleFontSize}px Source Code Pro`;
            ctx.fillStyle = "#ffffff";
            ctx.fillText("Truth verified. Reputation earned.", width / 2, height / 2 + newMainFontSize * 0.4);

            textTexture.needsUpdate = true;
        };

        // Load font before drawing
        const font = new FontFace('Gavency', 'url("/Gavency Free Regular.otf")');
        font.load().then(() => {
            document.fonts.add(font);
            drawContent();
        }).catch(err => {
            console.error("Failed to load Gavency font:", err);
            // Fallback draw
            drawContent();
        });

        const onResize = () => {
            width = getWidth();
            height = getHeight();
            renderer.setSize(window.innerWidth, window.innerHeight);
            rtA.setSize(width, height);
            rtB.setSize(width, height);
            (simMaterial.uniforms.resolution.value as THREE.Vector2).set(
                width,
                height
            );

            canvas2d.width = width;
            canvas2d.height = height;

            drawContent();
        };

        const onMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX * window.devicePixelRatio;
            mouse.y = (window.innerHeight - e.clientY) * window.devicePixelRatio;
        };
        const onMouseLeave = () => {
            mouse.set(0, 0);
        };

        renderer.domElement.addEventListener("mousemove", onMouseMove);
        renderer.domElement.addEventListener("mouseleave", onMouseLeave);
        window.addEventListener("resize", onResize);

        let rafId = 0;
        const animate = () => {
            const currentTime = performance.now() / 1000;
            (simMaterial.uniforms.frame.value as number) = frame++;
            (simMaterial.uniforms.time.value as number) = currentTime;
            (renderMaterial.uniforms.time.value as number) = currentTime;

            (simMaterial.uniforms.textureA.value as THREE.Texture) = rtA.texture;
            renderer.setRenderTarget(rtB);
            renderer.render(simScene, camera);

            (renderMaterial.uniforms.textureA.value as THREE.Texture) = rtB.texture;
            (renderMaterial.uniforms.textureB.value as THREE.Texture) = textTexture;
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);

            const temp = rtA;
            rtA = rtB;
            rtB = temp;

            rafId = requestAnimationFrame(animate);
        };
        animate();

        // Trigger loaded state after a short delay for smooth animation
        setTimeout(() => setIsLoaded(true), 100);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", onResize);
            renderer.domElement.removeEventListener("mousemove", onMouseMove);
            renderer.domElement.removeEventListener("mouseleave", onMouseLeave);

            mountTarget.removeChild(renderer.domElement);

            plane.dispose();
            simMaterial.dispose();
            renderMaterial.dispose();
            textTexture.dispose();
            rtA.dispose();
            rtB.dispose();
            renderer.dispose();
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1,
                opacity: isLoaded ? 1 : 0,
                transition: 'opacity 1.5s ease-in-out'
            }}
        />
    );
}

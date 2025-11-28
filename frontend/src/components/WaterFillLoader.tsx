import { useEffect, useRef, useState } from "react";
import "./WaterFillLoader.css";

interface WaterFillLoaderProps {
    onComplete: () => void;
}

export default function WaterFillLoader({ onComplete }: WaterFillLoaderProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [percentage, setPercentage] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        ctx.scale(dpr, dpr);

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Animation parameters
        const duration = 2500; // 2.5 seconds
        const startTime = Date.now();
        let animationFrame: number;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentPercentage = Math.floor(progress * 100);

            setPercentage(currentPercentage);

            // Clear canvas
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);

            // Draw text
            const fontSize = 200;
            ctx.font = `bold ${fontSize}px Source Code Pro`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const textX = width / 2;
            const textY = height / 2;
            const text = "VeriChain";

            // Calculate water level (from bottom to top)
            const textMetrics = ctx.measureText(text);
            const textHeight = fontSize;
            const textBottom = textY + (textHeight / 2);
            const textTop = textY - (textHeight / 2);
            const waterLevel = textBottom - (progress * textHeight);

            // Create wave path
            const waveFrequency = 0.015;
            const waveAmplitude = 8;
            const waveSpeed = elapsed * 0.003;

            // Step 1: Draw text outline
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 2;
            ctx.strokeText(text, textX, textY);
            ctx.restore();

            // Step 2: Draw filled water part
            ctx.save();

            // First draw the text in white
            ctx.fillStyle = "#ffffff";
            ctx.fillText(text, textX, textY);

            // Use destination-in to clip water shape to text
            ctx.globalCompositeOperation = "destination-in";

            // Draw water fill shape
            ctx.beginPath();

            // Draw wavy top of water
            for (let x = 0; x <= width; x += 2) {
                const y = waterLevel +
                    Math.sin(x * waveFrequency + waveSpeed) * waveAmplitude +
                    Math.sin(x * waveFrequency * 2.3 + waveSpeed * 1.5) * (waveAmplitude / 2) +
                    Math.sin(x * waveFrequency * 1.7 + waveSpeed * 0.8) * (waveAmplitude / 3);

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            // Complete the water shape (fill everything below the wave)
            ctx.lineTo(width, height);
            ctx.lineTo(0, height);
            ctx.closePath();
            ctx.fillStyle = "#ffffff";
            ctx.fill();

            ctx.restore();

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                // Hold at 100% for a moment then complete
                setTimeout(() => {
                    onComplete();
                }, 1100);
            }
        };

        animate();

        return () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
        };
    }, [onComplete]);

    return (
        <div className="water-fill-loader">
            <canvas ref={canvasRef} />
            <div className="loading-percentage">loading... {percentage}%</div>
        </div>
    );
}

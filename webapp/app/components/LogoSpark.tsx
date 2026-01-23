'use client';

import { useEffect, useRef } from 'react';
import styles from './LogoSpark.module.css';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  type: 'core' | 'flame' | 'spark';
  rotation: number;
  spiralSpeed: number;
}

interface LogoSparkProps {
  isHovered: boolean;
}

export default function LogoSpark({ isHovered }: LogoSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match logo container
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width || 80;
        canvas.height = rect.height || 80;
      } else {
        canvas.width = 80;
        canvas.height = 80;
      }
    };
    resizeCanvas();
    
    // Resize on window resize
    window.addEventListener('resize', resizeCanvas);

    // Create core particle (bright yellow center) - balanced visibility
    const createCoreParticle = (x: number, y: number): Particle => {
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.25, // Moderate movement
        vy: -0.12 - Math.random() * 0.1, // Moderate upward
        life: 1,
        maxLife: 1,
        size: (2 + Math.random() * 1.5) * 0.5, // Moderate size
        type: 'core',
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.008 + Math.random() * 0.012, // Moderate spiral
      };
    };

    // Create flame particle (orange middle layer) - balanced visibility
    const createFlameParticle = (x: number, y: number): Particle => {
      const angle = (Math.random() - 0.5) * Math.PI * 0.4;
      const speed = 0.35 + Math.random() * 0.7;
      return {
        x,
        y,
        vx: Math.sin(angle) * speed * 0.2,
        vy: -Math.abs(Math.cos(angle) * speed) - 0.28,
        life: 1,
        maxLife: 0.55 + Math.random() * 0.3,
        size: (1.5 + Math.random() * 1.8) * 0.5, // Moderate size
        type: 'flame',
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.01 + Math.random() * 0.015,
      };
    };

    // Create spark particle (red embers) - balanced visibility
    const createSparkParticle = (x: number, y: number): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.45 + Math.random() * 0.7;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed * 0.25,
        vy: -Math.abs(Math.sin(angle) * speed) - 0.38,
        life: 1,
        maxLife: 0.35 + Math.random() * 0.25,
        size: (0.7 + Math.random() * 1) * 0.5, // Moderate size
        type: 'spark',
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.012 + Math.random() * 0.018,
      };
    };

    // Animation loop
    const animate = () => {
      timeRef.current += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (isHovered) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Create particles at logo center - balanced amount
        if (Math.random() > 0.4) {
          particlesRef.current.push(createCoreParticle(centerX, centerY));
        }
        if (Math.random() > 0.25) {
          const offsetX = (Math.random() - 0.5) * 9;
          particlesRef.current.push(createFlameParticle(centerX + offsetX, centerY));
        }
        if (Math.random() > 0.35) {
          const offsetX = (Math.random() - 0.5) * 11;
          particlesRef.current.push(createSparkParticle(centerX + offsetX, centerY));
        }
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Add slight upward acceleration
        p.vy -= 0.01;

        // Update rotation for spiral effect
        p.rotation += p.spiralSpeed;

        // Update life
        p.life -= 0.014; // Moderate decay

        // Draw particle
        if (p.life > 0) {
          const alpha = Math.min(p.life, 1);
          const flickerIntensity = 0.8 + Math.sin(timeRef.current * 8 + p.rotation) * 0.2;
          const size = p.size * (0.5 + p.life * 0.5) * flickerIntensity;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);

          if (p.type === 'core') {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3);
            gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.7 * flickerIntensity})`);
            gradient.addColorStop(0.4, `rgba(255, 220, 100, ${alpha * 0.55 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(255, 180, 50, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.type === 'flame') {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.5);
            gradient.addColorStop(0, `rgba(255, 180, 80, ${alpha * 0.65 * flickerIntensity})`);
            gradient.addColorStop(0.5, `rgba(255, 140, 40, ${alpha * 0.45 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(255, 100, 0, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.3, size * 2, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.type === 'spark') {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
            gradient.addColorStop(0, `rgba(255, 120, 60, ${alpha * 0.55 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size, size * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        return p.life > 0;
      });

      // Continue animation if hovered or if particles still exist
      if (isHovered || particlesRef.current.length > 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    // Start animation when hovered
    if (isHovered) {
      animate();
    } else {
      // Clear particles when not hovered
      particlesRef.current = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isHovered]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.sparkCanvas}
      style={{ opacity: isHovered ? 1 : 0 }}
    />
  );
}

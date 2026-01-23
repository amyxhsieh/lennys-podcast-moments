'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './SparkAnimation.module.css';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  type: 'core' | 'flame' | 'spark';
  turbulence: number;
  baseY: number;
  flicker: number;
  rotation: number;
  spiralSpeed: number;
  elongation: number;
}

export default function SparkAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track mouse position
    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseLeave = () => {
      mousePosRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    // Create core particle (bright yellow center)
    const createCoreParticle = (x: number, y: number): Particle => {
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.2 - Math.random() * 0.15,
        life: 1,
        maxLife: 1,
        size: (4 + Math.random() * 2) * 0.9,
        type: 'core',
        turbulence: Math.random() * 0.08,
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.01 + Math.random() * 0.015,
        elongation: 1.2 + Math.random() * 0.2,
      };
    };

    // Create flame particle (orange middle layer)
    const createFlameParticle = (x: number, y: number): Particle => {
      const angle = (Math.random() - 0.5) * Math.PI * 0.6; // Narrow upward cone
      const speed = 0.6 + Math.random() * 1.2;
      return {
        x,
        y,
        vx: Math.sin(angle) * speed * 0.3,
        vy: -Math.abs(Math.cos(angle) * speed) - 0.5,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.4,
        size: (3 + Math.random() * 3) * 0.9,
        type: 'flame',
        turbulence: Math.random() * 0.15,
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.015 + Math.random() * 0.025,
        elongation: 1.4 + Math.random() * 0.4,
      };
    };

    // Create spark particle (red embers)
    const createSparkParticle = (x: number, y: number): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.2;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed * 0.4,
        vy: -Math.abs(Math.sin(angle) * speed) - 0.7,
        life: 1,
        maxLife: 0.4 + Math.random() * 0.3,
        size: (1 + Math.random() * 1.5) * 0.9,
        type: 'spark',
        turbulence: Math.random() * 0.2,
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.02 + Math.random() * 0.03,
        elongation: 1.15 + Math.random() * 0.2,
      };
    };

    // Animation loop
    const animate = () => {
      timeRef.current += 0.016; // ~60fps
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create new particles at mouse position
      if (mousePosRef.current && isVisible) {
        const mx = mousePosRef.current.x;
        const my = mousePosRef.current.y;

        // Create core particles (bright center) - more frequent
        if (Math.random() > 0.3) {
          particlesRef.current.push(createCoreParticle(mx, my));
        }

        // Create flame particles (main body) - always create some
        for (let i = 0; i < 3; i++) {
          if (Math.random() > 0.2) {
            const offsetX = (Math.random() - 0.5) * 15;
            particlesRef.current.push(createFlameParticle(mx + offsetX, my));
          }
        }

        // Create spark particles (embers) - more frequent
        if (Math.random() > 0.3) {
          const offsetX = (Math.random() - 0.5) * 20;
          particlesRef.current.push(createSparkParticle(mx + offsetX, my));
        }
      }

      // Draw ambient glow first (soft background glow)
      if (mousePosRef.current && isVisible && particlesRef.current.length > 0) {
        const glowGradient = ctx.createRadialGradient(
          mousePosRef.current.x,
          mousePosRef.current.y,
          0,
          mousePosRef.current.x,
          mousePosRef.current.y,
          150
        );
        glowGradient.addColorStop(0, 'rgba(255, 140, 0, 0.15)');
        glowGradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.08)');
        glowGradient.addColorStop(1, 'rgba(200, 50, 0, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(mousePosRef.current.x, mousePosRef.current.y, 150, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter((p) => {
        // Apply turbulence (wobble effect)
        const wobbleX = Math.sin(timeRef.current * 3 + p.baseY * 0.01) * p.turbulence;
        const wobbleY = Math.cos(timeRef.current * 2 + p.baseY * 0.01) * p.turbulence * 0.5;

        // Add spiral motion (circular path as it rises)
        const spiralX = Math.cos(p.rotation) * (p.size * 0.3);
        const spiralY = Math.sin(p.rotation) * (p.size * 0.15);

        // Update position with turbulence and spiral
        p.x += p.vx + wobbleX + spiralX * 0.1;
        p.y += p.vy + wobbleY + spiralY * 0.05;

        // Update rotation for spiral effect
        p.rotation += p.spiralSpeed;

        // Add slight upward acceleration (like fire rising)
        p.vy -= 0.015;

        // Update life (slower decay for longer visibility)
        p.life -= 0.01;

        // Draw particle based on type
        if (p.life > 0) {
          const alpha = Math.min(p.life, 1);
          const flickerIntensity = 0.8 + Math.sin(timeRef.current * 10 + p.flicker) * 0.2;
          const size = p.size * (0.5 + p.life * 0.5) * flickerIntensity;

          if (p.type === 'core') {
            // Bright yellow core with intense glow - elongated flame shape
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 4);
            gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha * 0.9 * flickerIntensity})`);
            gradient.addColorStop(0.3, `rgba(255, 220, 100, ${alpha * 0.7 * flickerIntensity})`);
            gradient.addColorStop(0.6, `rgba(255, 180, 50, ${alpha * 0.4 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(255, 140, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 3, size * 4, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core - teardrop shape
            ctx.fillStyle = `rgba(255, 255, 200, ${alpha * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.6, size * 1, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          } else if (p.type === 'flame') {
            // Orange flame with soft glow - elongated wispy shape
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3);
            gradient.addColorStop(0, `rgba(255, 200, 100, ${alpha * 0.8 * flickerIntensity})`);
            gradient.addColorStop(0.4, `rgba(255, 150, 50, ${alpha * 0.6 * flickerIntensity})`);
            gradient.addColorStop(0.7, `rgba(255, 100, 0, ${alpha * 0.3 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(200, 50, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2.5, size * 3.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner flame - elongated
            ctx.fillStyle = `rgba(255, 180, 80, ${alpha * 0.7 * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.5, size * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          } else if (p.type === 'spark') {
            // Red spark/ember - small elongated shape with tail
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.5);
            gradient.addColorStop(0, `rgba(255, 120, 50, ${alpha * 0.9 * flickerIntensity})`);
            gradient.addColorStop(0.5, `rgba(255, 80, 0, ${alpha * 0.5 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(200, 40, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2, size * 2.8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Bright center
            ctx.fillStyle = `rgba(255, 150, 70, ${alpha * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.35, size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          }
        }

        return p.life > 0;
      });

      // Limit number of particles for performance
      if (particlesRef.current.length > 200) {
        particlesRef.current = particlesRef.current.slice(-200);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVisible]);

  // Hide sparks when user interacts with form elements
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        setIsVisible(false);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        setIsVisible(true);
      }
    };

    // Listen at document level to catch all focus events
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.sparkCanvas}
      aria-hidden="true"
    />
  );
}

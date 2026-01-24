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
  const animationFrameRef = useRef<number | undefined>(undefined);
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

    // Create core particle (bright yellow center) - more illustrative, slower
    const createCoreParticle = (x: number, y: number): Particle => {
      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.15, // Slower horizontal movement
        vy: -0.08 - Math.random() * 0.06, // Slower upward movement
        life: 1,
        maxLife: 1,
        size: (4 + Math.random() * 2) * 0.9 * 0.8, // 0.8x smaller
        type: 'core',
        turbulence: Math.random() * 0.03, // Less wobble - more gentle
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.005 + Math.random() * 0.008, // Slower spiral
        elongation: 1.3 + Math.random() * 0.3, // More elongated, illustrative shape
      };
    };

    // Create flame particle (orange middle layer) - slower, more gentle
    const createFlameParticle = (x: number, y: number): Particle => {
      const angle = (Math.random() - 0.5) * Math.PI * 0.5; // Narrower, more controlled cone
      const speed = 0.3 + Math.random() * 0.5; // Much slower speed
      return {
        x,
        y,
        vx: Math.sin(angle) * speed * 0.2, // Reduced horizontal movement
        vy: -Math.abs(Math.cos(angle) * speed) - 0.2, // Slower upward movement
        life: 1,
        maxLife: 1.2 + Math.random() * 0.6, // Longer life for gentler fade
        size: (3 + Math.random() * 3) * 0.9 * 0.8, // 0.8x smaller
        type: 'flame',
        turbulence: Math.random() * 0.05, // Much less wobble
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.006 + Math.random() * 0.01, // Slower spiral
        elongation: 1.5 + Math.random() * 0.5, // More stylized, elongated shape
      };
    };

    // Create spark particle (red embers) - slower, more gentle
    const createSparkParticle = (x: number, y: number): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.5; // Much slower
      return {
        x,
        y,
        vx: Math.cos(angle) * speed * 0.25, // Reduced movement
        vy: -Math.abs(Math.sin(angle) * speed) - 0.3, // Slower upward
        life: 1,
        maxLife: 0.8 + Math.random() * 0.5, // Longer life
        size: (1 + Math.random() * 1.5) * 0.9 * 0.8, // 0.8x smaller
        type: 'spark',
        turbulence: Math.random() * 0.06, // Less wobble
        baseY: y,
        flicker: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        spiralSpeed: 0.008 + Math.random() * 0.012, // Slower spiral
        elongation: 1.2 + Math.random() * 0.3, // More stylized
      };
    };

    // Animation loop - slower, more gentle
    const animate = () => {
      timeRef.current += 0.012; // Slower time progression for gentler animation
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create new particles at mouse position - less clustered, more spread out
      if (mousePosRef.current && isVisible) {
        const mx = mousePosRef.current.x;
        const my = mousePosRef.current.y;

        // Create core particles (bright center) - less frequent, add slight spread
        if (Math.random() > 0.55) {
          const offsetX = (Math.random() - 0.5) * 8; // Small spread for core
          const offsetY = (Math.random() - 0.5) * 4; // Small vertical spread
          particlesRef.current.push(createCoreParticle(mx + offsetX, my + offsetY));
        }

        // Create flame particles (main body) - fewer particles, more spread
        for (let i = 0; i < 2; i++) {
          if (Math.random() > 0.45) {
            const offsetX = (Math.random() - 0.5) * 20; // Increased spread
            const offsetY = (Math.random() - 0.5) * 8; // Vertical spread
            particlesRef.current.push(createFlameParticle(mx + offsetX, my + offsetY));
          }
        }

        // Create spark particles (embers) - less frequent, more spread
        if (Math.random() > 0.55) {
          const offsetX = (Math.random() - 0.5) * 24; // Increased spread
          const offsetY = (Math.random() - 0.5) * 10; // Vertical spread
          particlesRef.current.push(createSparkParticle(mx + offsetX, my + offsetY));
        }
      }

      // Draw ambient glow first (softer, more gentle glow) - 0.8x smaller
      if (mousePosRef.current && isVisible && particlesRef.current.length > 0) {
        const glowRadius = 120 * 0.8; // 0.8x smaller
        const glowGradient = ctx.createRadialGradient(
          mousePosRef.current.x,
          mousePosRef.current.y,
          0,
          mousePosRef.current.x,
          mousePosRef.current.y,
          glowRadius
        );
        glowGradient.addColorStop(0, 'rgba(255, 160, 80, 0.08)'); // Softer, less intense
        glowGradient.addColorStop(0.5, 'rgba(255, 140, 60, 0.04)');
        glowGradient.addColorStop(1, 'rgba(200, 80, 40, 0)');
        
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(mousePosRef.current.x, mousePosRef.current.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Update and draw particles - smoother, more gentle movement
      particlesRef.current = particlesRef.current.filter((p) => {
        // Apply gentle turbulence (subtle wobble effect)
        const wobbleX = Math.sin(timeRef.current * 1.5 + p.baseY * 0.005) * p.turbulence; // Slower wobble
        const wobbleY = Math.cos(timeRef.current * 1.2 + p.baseY * 0.005) * p.turbulence * 0.3; // Gentler vertical wobble

        // Add gentle spiral motion (subtle circular path)
        const spiralX = Math.cos(p.rotation) * (p.size * 0.2); // Smaller spiral
        const spiralY = Math.sin(p.rotation) * (p.size * 0.1);

        // Update position with gentle turbulence and spiral
        p.x += p.vx + wobbleX + spiralX * 0.05; // Reduced spiral influence
        p.y += p.vy + wobbleY + spiralY * 0.02;

        // Update rotation for gentle spiral effect
        p.rotation += p.spiralSpeed;

        // Add very slight upward acceleration (gentler rise)
        p.vy -= 0.006; // Reduced acceleration

        // Update life (slower decay for longer, gentler fade)
        p.life -= 0.006; // Slower fade

        // Draw particle based on type - less flicker, more illustrative
        if (p.life > 0) {
          const alpha = Math.min(p.life, 1);
          const flickerIntensity = 0.9 + Math.sin(timeRef.current * 4 + p.flicker) * 0.1; // Less flicker, slower
          const size = p.size * (0.6 + p.life * 0.4) * flickerIntensity; // More stable size

          if (p.type === 'core') {
            // Bright yellow core - more illustrative, stylized flame shape
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            // Softer, more illustrative gradient
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.5);
            gradient.addColorStop(0, `rgba(255, 240, 180, ${alpha * 0.85 * flickerIntensity})`);
            gradient.addColorStop(0.4, `rgba(255, 200, 80, ${alpha * 0.6 * flickerIntensity})`);
            gradient.addColorStop(0.7, `rgba(255, 160, 40, ${alpha * 0.3 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(255, 120, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2.5, size * 3.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core - more stylized
            ctx.fillStyle = `rgba(255, 250, 200, ${alpha * 0.9 * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.7, size * 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          } else if (p.type === 'flame') {
            // Orange flame - more illustrative, stylized shape
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            // Softer, more illustrative gradient
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.8);
            gradient.addColorStop(0, `rgba(255, 180, 80, ${alpha * 0.75 * flickerIntensity})`);
            gradient.addColorStop(0.5, `rgba(255, 140, 40, ${alpha * 0.5 * flickerIntensity})`);
            gradient.addColorStop(0.8, `rgba(255, 100, 20, ${alpha * 0.25 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(220, 60, 0, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 2.2, size * 3, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner flame - more stylized
            ctx.fillStyle = `rgba(255, 200, 100, ${alpha * 0.65 * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.6, size * 0.9, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          } else if (p.type === 'spark') {
            // Red spark/ember - more illustrative, stylized shape
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.scale(1, p.elongation);
            
            // Softer, more illustrative gradient
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
            gradient.addColorStop(0, `rgba(255, 140, 60, ${alpha * 0.8 * flickerIntensity})`);
            gradient.addColorStop(0.6, `rgba(255, 100, 30, ${alpha * 0.4 * flickerIntensity})`);
            gradient.addColorStop(1, `rgba(220, 60, 10, 0)`);

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.8, size * 2.4, 0, 0, Math.PI * 2);
            ctx.fill();

            // Bright center - more stylized
            ctx.fillStyle = `rgba(255, 170, 80, ${alpha * 0.9 * flickerIntensity})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 0.4, size * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
          }
        }

        return p.life > 0;
      });

      // Limit number of particles for performance - fewer particles for gentler effect
      if (particlesRef.current.length > 120) {
        particlesRef.current = particlesRef.current.slice(-120);
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

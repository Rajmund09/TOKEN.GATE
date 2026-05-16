/**
 * TOKEN.GATE Professional Background: "The Executive Precision"
 * A high-end, minimalist technical grid with subtle kinetic signal pulses.
 */

const initCrazyBackground = () => {
    const canvas = document.getElementById('jelly-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width, height;
    let signals = [];
    const mouse = { x: -1000, y: -1000, active: false };
    
    const settings = {
        gridSize: 60,
        signalCount: 15,
        baseOpacity: 0.05
    };

    class DataSignal {
        constructor() {
            this.init();
        }

        init() {
            // Signals move along grid lines
            this.isVertical = Math.random() > 0.5;
            this.pos = Math.floor(Math.random() * (this.isVertical ? width / settings.gridSize : height / settings.gridSize)) * settings.gridSize;
            this.coord = Math.random() * (this.isVertical ? height : width);
            this.speed = (Math.random() + 0.5) * 2;
            this.length = 40 + Math.random() * 60;
            this.opacity = 0;
        }

        update() {
            this.coord += this.speed;
            
            // Fade in and out
            if (this.coord < 200 || this.coord > (this.isVertical ? height : width) - 200) {
                this.opacity *= 0.9;
            } else {
                this.opacity += (0.4 - this.opacity) * 0.1;
            }

            if (this.coord > (this.isVertical ? height : width)) {
                this.init();
            }
        }

        draw() {
            ctx.beginPath();
            const isDark = document.body.classList.contains('dark-mode');
            const color = isDark ? `rgba(0, 255, 255, ${this.opacity})` : `rgba(0, 80, 255, ${this.opacity})`;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            if (this.isVertical) {
                ctx.moveTo(this.pos, this.coord - this.length);
                ctx.lineTo(this.pos, this.coord);
            } else {
                ctx.moveTo(this.coord - this.length, this.pos);
                ctx.lineTo(this.coord, this.pos);
            }
            ctx.stroke();
        }
    }

    const drawGrid = () => {
        const isDark = document.body.classList.contains('dark-mode');
        ctx.beginPath();
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = isDark ? `rgba(255, 255, 255, ${settings.baseOpacity})` : `rgba(0, 0, 0, ${settings.baseOpacity})`;
        
        for (let x = 0; x <= width; x += settings.gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += settings.gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Mouse Highlight
        if (mouse.active) {
            const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 300);
            gradient.addColorStop(0, isDark ? 'rgba(0, 255, 255, 0.05)' : 'rgba(0, 80, 255, 0.03)');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }
    };

    const resize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        signals = [];
        for (let i = 0; i < settings.signalCount; i++) {
            signals.push(new DataSignal());
        }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;
    });

    const animate = () => {
        const isDark = document.body.contains(document.querySelector('.dark-mode')) || document.body.classList.contains('dark-mode');
        ctx.fillStyle = isDark ? '#08080a' : '#fafaf8';
        ctx.fillRect(0, 0, width, height);

        drawGrid();
        
        signals.forEach(s => {
            s.update();
            s.draw();
        });

        requestAnimationFrame(animate);
    };

    resize();
    animate();
};

document.addEventListener('DOMContentLoaded', initCrazyBackground);

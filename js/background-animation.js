'use strict';

/**
 * TriangularMeshBackground
 * Animated triangular mesh background for Praxis San Diego website
 */
class TriangularMeshBackground {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        if (!this.canvas) {
            console.warn('Background canvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.time = 0;
        this.contentWidth = 900; // Max width of content
        this.contentPadding = 50; // Extra padding around content
        this.isAnimating = true;
        this.isPaused = false; // Track user's pause preference
        this.isVisible = true; // Track page visibility

        this.init();
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.init());

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            this.updateAnimationState();
        });

        // Handle animation toggle
        const toggleBtn = document.getElementById('animationToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.isPaused = !this.isPaused;
                this.updateAnimationState();
                toggleBtn.textContent = '♻︎';
                toggleBtn.classList.toggle('paused', this.isPaused);
            });
        }
    }

    updateAnimationState() {
        // Only animate if page is visible AND user hasn't paused
        this.isAnimating = this.isVisible && !this.isPaused;
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Clear existing nodes
        this.nodes = [];

        // Calculate content area to avoid
        const contentLeft = (this.canvas.width - this.contentWidth) / 2 - this.contentPadding;
        const contentRight = (this.canvas.width + this.contentWidth) / 2 + this.contentPadding;

        // Create irregular triangular grid with more randomness
        const baseSpacing = 60; // Base distance between nodes
        const rows = Math.ceil(this.canvas.height / (baseSpacing * 0.866)) + 2;
        const cols = Math.ceil(this.canvas.width / baseSpacing) + 2;

        for (let row = -1; row < rows; row++) {
            for (let col = -1; col < cols; col++) {
                // Add significant randomness to positions
                const randomOffsetX = (Math.random() - 0.5) * baseSpacing * 0.6;
                const randomOffsetY = (Math.random() - 0.5) * baseSpacing * 0.6;

                const x = col * baseSpacing + (row % 2) * (baseSpacing / 2) + randomOffsetX;
                const y = row * baseSpacing * 0.866 + randomOffsetY;

                // Only add nodes that are outside the content area
                if (x < contentLeft || x > contentRight) {
                    this.nodes.push({
                        x: x,
                        y: y,
                        baseX: x,
                        baseY: y,
                        offsetX: Math.random() * 15 - 7.5,
                        offsetY: Math.random() * 15 - 7.5,
                        phase: Math.random() * Math.PI * 2,
                        amplitude: 8 + Math.random() * 12,
                        speed: 0.8 + Math.random() * 0.4
                    });
                }
            }
        }

        // Store content boundaries for connection drawing
        this.contentLeft = contentLeft;
        this.contentRight = contentRight;
        this.spacing = baseSpacing;
    }

    drawConnections() {
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 1;

        // Draw connections between nearby nodes
        for (let i = 0; i < this.nodes.length; i++) {
            const node1 = this.nodes[i];

            for (let j = i + 1; j < this.nodes.length; j++) {
                const node2 = this.nodes[j];
                const dist = Math.sqrt(
                    Math.pow(node2.x - node1.x, 2) +
                    Math.pow(node2.y - node1.y, 2)
                );

                // Connect nodes that are close
                if (dist < this.spacing * 1.5) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(node1.x, node1.y);
                    this.ctx.lineTo(node2.x, node2.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update node positions only if animating
        if (this.isAnimating) {
            this.time += 0.015;
        }

        this.nodes.forEach(node => {
            if (this.isAnimating) {
                node.x = node.baseX + node.offsetX +
                       Math.sin(this.time * node.speed + node.phase) * node.amplitude;
                node.y = node.baseY + node.offsetY +
                       Math.cos(this.time * node.speed * 0.7 + node.phase) * node.amplitude * 0.7;
            }
        });

        // Draw connections first
        this.drawConnections();

        // Draw nodes in black
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.nodes.forEach(node => {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Initialize background when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TriangularMeshBackground();
});

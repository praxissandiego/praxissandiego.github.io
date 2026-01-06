'use strict';

/**
 * TriangularMeshBackground
 * Animated triangular mesh background for Praxis San Diego website
 * With smooth node transitions when menu opens/closes
 */
class TriangularMeshBackground {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        if (!this.canvas) {
            console.warn('Background canvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.allNodes = []; // All potential nodes (including those in content area)
        this.time = 0;
        this.contentWidth = 900; // Max width of content
        this.contentPadding = 50; // Extra padding around content
        this.isAnimating = true;
        this.isPaused = false; // Track user's pause preference
        this.isVisible = true; // Track page visibility
        this.menuWidth = 0; // Current menu width (0 when closed)
        this.transitionDuration = 300; // Match CSS menu transition (ms)

        this.init();
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            this.updateAnimationState();
        });

        // Handle menu state changes
        window.addEventListener('menuStateChange', (e) => {
            this.handleMenuStateChange(e.detail.isOpen, e.detail.menuWidth);
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

    handleResize() {
        // On resize, reinitialize all nodes
        this.init();
    }

    handleMenuStateChange(isOpen, menuWidth) {
        const targetMenuWidth = isOpen ? menuWidth : 0;
        
        if (this.menuWidth === targetMenuWidth) return;
        
        this.menuWidth = targetMenuWidth;
        this.updateContentBounds();
        this.animateNodeVisibility();
    }

    /**
     * Calculate content boundaries accounting for menu offset
     */
    updateContentBounds() {
        // When menu is open, body gets padding-right which shifts content left
        // The available width becomes canvas.width - menuWidth
        // Content centers in available width
        const availableWidth = this.canvas.width - this.menuWidth;
        const contentCenter = availableWidth / 2;
        
        this.contentLeft = contentCenter - this.contentWidth / 2 - this.contentPadding;
        this.contentRight = contentCenter + this.contentWidth / 2 + this.contentPadding;
    }

    /**
     * Check if a node should be visible based on current content bounds
     */
    shouldNodeBeVisible(node) {
        return node.baseX < this.contentLeft || node.baseX > this.contentRight;
    }

    /**
     * Animate nodes fading in/out based on their new visibility state
     * Animation sweeps from right to left
     */
    animateNodeVisibility() {
        const now = performance.now();
        const maxX = this.canvas.width;
        
        this.allNodes.forEach(node => {
            const shouldBeVisible = this.shouldNodeBeVisible(node);
            const targetOpacity = shouldBeVisible ? 1 : 0;
            
            // Only animate if the target changed
            if (node.targetOpacity !== targetOpacity) {
                // Calculate delay based on x position for right-to-left sweep
                // Nodes on the right start first (smaller delay)
                const normalizedX = node.baseX / maxX; // 0 = left, 1 = right
                const delay = (1 - normalizedX) * this.transitionDuration * 0.6;
                
                node.transitionStartTime = now + delay;
                node.transitionEndTime = now + delay + this.transitionDuration * 0.5;
                node.startOpacity = node.opacity;
                node.targetOpacity = targetOpacity;
            }
        });
    }

    /**
     * Initialize the mesh with all potential nodes
     */
    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Clear existing nodes
        this.allNodes = [];

        // Calculate initial content bounds
        this.updateContentBounds();

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

                const node = {
                    x: x,
                    y: y,
                    baseX: x,
                    baseY: y,
                    offsetX: Math.random() * 15 - 7.5,
                    offsetY: Math.random() * 15 - 7.5,
                    phase: Math.random() * Math.PI * 2,
                    amplitude: 8 + Math.random() * 12,
                    speed: 0.8 + Math.random() * 0.4,
                    // Opacity properties for transitions
                    opacity: 0,
                    targetOpacity: 0,
                    startOpacity: 0,
                    transitionStartTime: undefined,
                    transitionEndTime: undefined
                };

                // Set initial opacity based on position
                const shouldBeVisible = this.shouldNodeBeVisible(node);
                node.opacity = shouldBeVisible ? 1 : 0;
                node.targetOpacity = node.opacity;

                this.allNodes.push(node);
            }
        }

        this.spacing = baseSpacing;
    }

    /**
     * Update node opacities based on transitions
     */
    updateNodeOpacities() {
        const now = performance.now();
        
        this.allNodes.forEach(node => {
            if (node.transitionStartTime !== undefined) {
                if (now < node.transitionStartTime) {
                    // Transition hasn't started yet
                    return;
                }
                
                if (now >= node.transitionEndTime) {
                    // Transition complete
                    node.opacity = node.targetOpacity;
                    node.transitionStartTime = undefined;
                    node.transitionEndTime = undefined;
                } else {
                    // Transition in progress - use easeInOut
                    const duration = node.transitionEndTime - node.transitionStartTime;
                    const elapsed = now - node.transitionStartTime;
                    const progress = elapsed / duration;
                    
                    // Ease in-out cubic
                    const eased = progress < 0.5 
                        ? 4 * progress * progress * progress 
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                    
                    node.opacity = node.startOpacity + (node.targetOpacity - node.startOpacity) * eased;
                }
            }
        });
    }

    /**
     * Draw connections between visible nearby nodes
     */
    drawConnections() {
        // Only draw connections between nodes that have some opacity
        const visibleNodes = this.allNodes.filter(node => node.opacity > 0.01);
        
        for (let i = 0; i < visibleNodes.length; i++) {
            const node1 = visibleNodes[i];

            for (let j = i + 1; j < visibleNodes.length; j++) {
                const node2 = visibleNodes[j];
                const dist = Math.sqrt(
                    Math.pow(node2.x - node1.x, 2) +
                    Math.pow(node2.y - node1.y, 2)
                );

                // Connect nodes that are close
                if (dist < this.spacing * 1.5) {
                    // Connection opacity is the minimum of both node opacities
                    const connectionOpacity = Math.min(node1.opacity, node2.opacity) * 0.2;
                    this.ctx.strokeStyle = `rgba(0, 0, 0, ${connectionOpacity})`;
                    this.ctx.lineWidth = 1;
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

        // Update node opacities for transitions
        this.updateNodeOpacities();

        // Update node positions only if animating
        if (this.isAnimating) {
            this.time += 0.015;
        }

        this.allNodes.forEach(node => {
            if (this.isAnimating) {
                node.x = node.baseX + node.offsetX +
                       Math.sin(this.time * node.speed + node.phase) * node.amplitude;
                node.y = node.baseY + node.offsetY +
                       Math.cos(this.time * node.speed * 0.7 + node.phase) * node.amplitude * 0.7;
            }
        });

        // Draw connections first
        this.drawConnections();

        // Draw nodes with their individual opacity
        this.allNodes.forEach(node => {
            if (node.opacity > 0.01) {
                this.ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * node.opacity})`;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Initialize background when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TriangularMeshBackground();
});

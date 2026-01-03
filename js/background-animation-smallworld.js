'use strict';

/**
 * SmallWorldMeshBackground
 * Animated small-world network background for Praxis San Diego website
 *
 * Local edges: drawn dynamically based on spatial distance
 * Shortcut edges: long-range connections that stochastically swap over time
 *
 * Uses Poisson distribution to determine how many shortcuts swap each check period.
 * Most checks result in 0 swaps, occasionally 1-2, rarely more.
 *
 * Long-distance shortcuts (spanning large vertical distances) are limited to 1-2 per side
 * for better aesthetics.
 */
class SmallWorldMeshBackground {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        if (!this.canvas) {
            console.warn('Background canvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.shortcuts = []; // Active shortcut edges
        this.time = 0;
        this.frameCount = 0;
        this.contentWidth = 900;
        this.contentPadding = 50;
        this.isAnimating = true;
        this.isPaused = false;
        this.isVisible = true;

        // Small-world parameters
        this.shortcutDensity = 0.08;
        this.minShortcutDistance = 3; // Minimum distance for any shortcut (in spacing units)

        // Distance categorization thresholds (in spacing units)
        this.longDistanceThreshold = 6; // Shortcuts >= this are "long"
        this.maxLongShortcutsPerSide = 2; // Maximum long shortcuts per side
        this.minLongShortcutsPerSide = 1; // Minimum long shortcuts per side

        // Stochastic rewiring parameters
        this.rewireCheckInterval = 60; // Check every N frames (~1 second at 60fps)
        this.poissonLambda = 0.3; // Average swaps per check (low = mostly 0s)
        this.shortcutFadeDuration = 45; // Frames to fade in/out

        this.init();
        this.animate();

        window.addEventListener('resize', () => this.init());

        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            this.updateAnimationState();
        });

        const toggleBtn = document.getElementById('animationToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.isPaused = !this.isPaused;
                this.updateAnimationState();
                toggleBtn.textContent = '⏻︎';
                toggleBtn.classList.toggle('paused', this.isPaused);
            });
        }
    }

    updateAnimationState() {
        this.isAnimating = this.isVisible && !this.isPaused;
    }

    /**
     * Generate a Poisson-distributed random number
     * Uses Knuth's algorithm - perfect for small lambda values
     */
    poissonRandom(lambda) {
        const L = Math.exp(-lambda);
        let k = 0;
        let p = 1;

        do {
            k++;
            p *= Math.random();
        } while (p > L);

        return k - 1;
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.nodes = [];
        this.shortcuts = [];
        this.frameCount = 0;

        const contentLeft = (this.canvas.width - this.contentWidth) / 2 - this.contentPadding;
        const contentRight = (this.canvas.width + this.contentWidth) / 2 + this.contentPadding;

        const baseSpacing = 60;
        const rows = Math.ceil(this.canvas.height / (baseSpacing * 0.866)) + 2;
        const cols = Math.ceil(this.canvas.width / baseSpacing) + 2;

        let nodeId = 0;
        for (let row = -1; row < rows; row++) {
            for (let col = -1; col < cols; col++) {
                const randomOffsetX = (Math.random() - 0.5) * baseSpacing * 0.6;
                const randomOffsetY = (Math.random() - 0.5) * baseSpacing * 0.6;

                const x = col * baseSpacing + (row % 2) * (baseSpacing / 2) + randomOffsetX;
                const y = row * baseSpacing * 0.866 + randomOffsetY;

                if (x < contentLeft || x > contentRight) {
                    this.nodes.push({
                        id: nodeId++,
                        x: x,
                        y: y,
                        baseX: x,
                        baseY: y,
                        offsetX: Math.random() * 15 - 7.5,
                        offsetY: Math.random() * 15 - 7.5,
                        phase: Math.random() * Math.PI * 2,
                        amplitude: 8 + Math.random() * 12,
                        speed: 0.8 + Math.random() * 0.4,
                        side: x < contentLeft ? 'left' : 'right'
                    });
                }
            }
        }

        this.contentLeft = contentLeft;
        this.contentRight = contentRight;
        this.spacing = baseSpacing;

        // Build initial shortcuts
        this.buildInitialShortcuts();
    }

    getBaseDistance(node1, node2) {
        return Math.sqrt(
            Math.pow(node2.baseX - node1.baseX, 2) +
            Math.pow(node2.baseY - node1.baseY, 2)
        );
    }

    getCurrentDistance(node1, node2) {
        return Math.sqrt(
            Math.pow(node2.x - node1.x, 2) +
            Math.pow(node2.y - node1.y, 2)
        );
    }

    /**
     * Check if a distance qualifies as "long"
     */
    isLongDistance(distance) {
        return distance >= this.spacing * this.longDistanceThreshold;
    }

    /**
     * Count active long shortcuts for a given side
     */
    countLongShortcutsForSide(side) {
        return this.shortcuts.filter(s =>
            s.side === side &&
            !s.fadingOut &&
            s.isLong
        ).length;
    }

    /**
     * Get the key for a node pair (order-independent)
     */
    getEdgeKey(id1, id2) {
        return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
    }

    /**
     * Build the initial set of shortcuts
     */
    buildInitialShortcuts() {
        const leftNodes = this.nodes.filter(n => n.side === 'left');
        const rightNodes = this.nodes.filter(n => n.side === 'right');

        this.createShortcutsForSide(leftNodes, 'left');
        this.createShortcutsForSide(rightNodes, 'right');
    }

    createShortcutsForSide(sideNodes, side) {
        if (sideNodes.length < 2) return;

        const numShortcuts = Math.max(1, Math.floor(sideNodes.length * this.shortcutDensity));
        const existingKeys = new Set(this.shortcuts.map(s => this.getEdgeKey(s.sourceId, s.targetId)));
        const minDist = this.spacing * this.minShortcutDistance;
        const longDist = this.spacing * this.longDistanceThreshold;

        let attempts = 0;
        let created = 0;
        let longCreated = 0;

        // First, ensure we have the minimum number of long shortcuts
        while (longCreated < this.minLongShortcutsPerSide && attempts < 100) {
            attempts++;

            const sourceIdx = Math.floor(Math.random() * sideNodes.length);
            const targetIdx = Math.floor(Math.random() * sideNodes.length);

            if (sourceIdx === targetIdx) continue;

            const source = sideNodes[sourceIdx];
            const target = sideNodes[targetIdx];

            const dist = this.getBaseDistance(source, target);
            if (dist < longDist) continue; // Must be long

            const key = this.getEdgeKey(source.id, target.id);
            if (existingKeys.has(key)) continue;

            existingKeys.add(key);
            this.shortcuts.push({
                sourceId: source.id,
                targetId: target.id,
                side: side,
                opacity: 1,
                fadingOut: false,
                fadingIn: false,
                isLong: true,
                distance: dist
            });
            created++;
            longCreated++;
        }

        // Now create the rest, preferring medium distance
        attempts = 0;
        while (created < numShortcuts && attempts < numShortcuts * 10) {
            attempts++;

            const sourceIdx = Math.floor(Math.random() * sideNodes.length);
            const targetIdx = Math.floor(Math.random() * sideNodes.length);

            if (sourceIdx === targetIdx) continue;

            const source = sideNodes[sourceIdx];
            const target = sideNodes[targetIdx];

            const dist = this.getBaseDistance(source, target);
            if (dist < minDist) continue;

            const isLong = dist >= longDist;

            // Skip if this would exceed max long shortcuts
            if (isLong && longCreated >= this.maxLongShortcutsPerSide) continue;

            const key = this.getEdgeKey(source.id, target.id);
            if (existingKeys.has(key)) continue;

            existingKeys.add(key);
            this.shortcuts.push({
                sourceId: source.id,
                targetId: target.id,
                side: side,
                opacity: 1,
                fadingOut: false,
                fadingIn: false,
                isLong: isLong,
                distance: dist
            });
            created++;
            if (isLong) longCreated++;
        }
    }

    /**
     * Create a single new shortcut for a given side, respecting long-distance limits
     * @param {string} side - 'left' or 'right'
     * @param {boolean|null} preferLong - true to prefer long, false to prefer medium, null for either
     */
    createSingleShortcut(side, preferLong = null) {
        const sideNodes = this.nodes.filter(n => n.side === side);
        if (sideNodes.length < 2) return null;

        const existingKeys = new Set(this.shortcuts.map(s => this.getEdgeKey(s.sourceId, s.targetId)));
        const minDist = this.spacing * this.minShortcutDistance;
        const longDist = this.spacing * this.longDistanceThreshold;

        const currentLongCount = this.countLongShortcutsForSide(side);
        const canAddLong = currentLongCount < this.maxLongShortcutsPerSide;
        const needsLong = currentLongCount < this.minLongShortcutsPerSide;

        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            attempts++;

            const sourceIdx = Math.floor(Math.random() * sideNodes.length);
            const targetIdx = Math.floor(Math.random() * sideNodes.length);

            if (sourceIdx === targetIdx) continue;

            const source = sideNodes[sourceIdx];
            const target = sideNodes[targetIdx];

            const dist = this.getBaseDistance(source, target);
            if (dist < minDist) continue;

            const isLong = dist >= longDist;

            // Enforce long-distance constraints
            if (isLong && !canAddLong) continue; // Can't add more long ones
            if (needsLong && !isLong) continue; // Need a long one, skip medium

            // If we have a preference, try to match it (but don't fail if we can't)
            if (preferLong === true && !isLong && attempts < maxAttempts / 2) continue;
            if (preferLong === false && isLong && attempts < maxAttempts / 2) continue;

            const key = this.getEdgeKey(source.id, target.id);
            if (existingKeys.has(key)) continue;

            return {
                sourceId: source.id,
                targetId: target.id,
                side: side,
                opacity: 0,
                fadingOut: false,
                fadingIn: true,
                isLong: isLong,
                distance: dist
            };
        }

        return null;
    }

    /**
     * Perform stochastic shortcut swapping
     * Called every rewireCheckInterval frames
     */
    checkAndSwapShortcuts() {
        // Get number of swaps from Poisson distribution
        const numSwaps = this.poissonRandom(this.poissonLambda);

        if (numSwaps === 0) return;

        // Get active shortcuts (not currently fading out)
        const activeShortcuts = this.shortcuts.filter(s => !s.fadingOut);

        // Can't swap more than we have
        const actualSwaps = Math.min(numSwaps, activeShortcuts.length);

        if (actualSwaps === 0) return;

        // Separate by side and type for smarter swapping
        const leftShortcuts = activeShortcuts.filter(s => s.side === 'left');
        const rightShortcuts = activeShortcuts.filter(s => s.side === 'right');

        // Randomly select shortcuts to swap out, but protect minimum long shortcuts
        const selectSwappable = (shortcuts, side) => {
            const longOnes = shortcuts.filter(s => s.isLong);
            const mediumOnes = shortcuts.filter(s => !s.isLong);

            // If we only have the minimum long shortcuts, prefer swapping medium ones
            if (longOnes.length <= this.minLongShortcutsPerSide && mediumOnes.length > 0) {
                return mediumOnes;
            }
            return shortcuts;
        };

        const swappableLeft = selectSwappable(leftShortcuts, 'left');
        const swappableRight = selectSwappable(rightShortcuts, 'right');
        const allSwappable = [...swappableLeft, ...swappableRight];

        if (allSwappable.length === 0) return;

        const shuffled = [...allSwappable].sort(() => Math.random() - 0.5);
        const toRemove = shuffled.slice(0, Math.min(actualSwaps, allSwappable.length));

        // Mark selected shortcuts to fade out and create replacements
        for (const shortcut of toRemove) {
            shortcut.fadingOut = true;

            // Try to replace with same type (long/medium), but allow flexibility
            const newShortcut = this.createSingleShortcut(shortcut.side, shortcut.isLong);
            if (newShortcut) {
                this.shortcuts.push(newShortcut);
            }
        }
    }

    /**
     * Update fade transitions for shortcuts
     */
    updateShortcutFades() {
        const fadeStep = 1 / this.shortcutFadeDuration;

        for (let i = this.shortcuts.length - 1; i >= 0; i--) {
            const shortcut = this.shortcuts[i];

            if (shortcut.fadingOut) {
                shortcut.opacity -= fadeStep;
                if (shortcut.opacity <= 0) {
                    // Remove fully faded out shortcut
                    this.shortcuts.splice(i, 1);
                }
            } else if (shortcut.fadingIn) {
                shortcut.opacity += fadeStep;
                if (shortcut.opacity >= 1) {
                    shortcut.opacity = 1;
                    shortcut.fadingIn = false;
                }
            }
        }
    }

    findNearestNeighbor(node) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const other of this.nodes) {
            if (other.id === node.id) continue;
            const dist = this.getCurrentDistance(node, other);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = other;
            }
        }

        return nearest;
    }

    drawConnections() {
        const localConnectionThreshold = this.spacing * 1.5;
        const connectedNodes = new Set();

        // Draw local edges based on current distance
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.lineWidth = 1;

        for (let i = 0; i < this.nodes.length; i++) {
            const node1 = this.nodes[i];

            for (let j = i + 1; j < this.nodes.length; j++) {
                const node2 = this.nodes[j];
                const dist = this.getCurrentDistance(node1, node2);

                if (dist < localConnectionThreshold) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(node1.x, node1.y);
                    this.ctx.lineTo(node2.x, node2.y);
                    this.ctx.stroke();

                    connectedNodes.add(node1.id);
                    connectedNodes.add(node2.id);
                }
            }
        }

        // Draw shortcut edges with individual opacities
        this.ctx.lineWidth = 1;

        for (const shortcut of this.shortcuts) {
            const source = this.nodes[shortcut.sourceId];
            const target = this.nodes[shortcut.targetId];

            this.ctx.strokeStyle = `rgba(0, 0, 0, ${0.2 * shortcut.opacity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(source.x, source.y);
            this.ctx.lineTo(target.x, target.y);
            this.ctx.stroke();

            if (shortcut.opacity > 0.5) {
                connectedNodes.add(shortcut.sourceId);
                connectedNodes.add(shortcut.targetId);
            }
        }

        this.ctx.setLineDash([]);

        // Ensure every node has at least one connection
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';

        for (const node of this.nodes) {
            if (!connectedNodes.has(node.id)) {
                const nearest = this.findNearestNeighbor(node);
                if (nearest) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(node.x, node.y);
                    this.ctx.lineTo(nearest.x, nearest.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.isAnimating) {
            this.time += 0.015;
            this.frameCount++;

            // Check for stochastic shortcut swapping
            if (this.frameCount % this.rewireCheckInterval === 0) {
                this.checkAndSwapShortcuts();
            }

            // Update fade transitions
            this.updateShortcutFades();
        }

        this.nodes.forEach(node => {
            if (this.isAnimating) {
                node.x = node.baseX + node.offsetX +
                       Math.sin(this.time * node.speed + node.phase) * node.amplitude;
                node.y = node.baseY + node.offsetY +
                       Math.cos(this.time * node.speed * 0.7 + node.phase) * node.amplitude * 0.7;
            }
        });

        this.drawConnections();

        // Draw nodes
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
    new SmallWorldMeshBackground();
});

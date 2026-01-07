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
 *
 * Menu transition: nodes appear/disappear gradually with a sweeping effect
 * synchronized with the menu opening/closing animation.
 */
class SmallWorldMeshBackground {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        if (!this.canvas) {
            console.warn('Background canvas element not found');
            return;
        }

        // Check if on mobile device - don't run animation on mobile
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) {
            // Hide the canvas on mobile
            this.canvas.style.display = 'none';
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
        this.animationFrameId = null;

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

        // Menu state tracking - must be initialized before init()
        this.menuOpen = false;
        this.menuWidth = 0;
        this.contentOffset = 0; // How much the content is shifted left

        // Boundary animation parameters - must be initialized before init()
        // so init() can set proper values that don't get overwritten
        this.boundaryTransitionDuration = 300; // ms, matches CSS transition
        this.boundaryTransitionStart = null;
        this.currentContentLeft = 0;
        this.currentContentRight = 0;
        this.targetContentLeft = 0;
        this.targetContentRight = 0;
        this.previousContentLeft = 0;
        this.previousContentRight = 0;
        this.isTransitioning = false;

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

        // Listen for menu state changes
        window.addEventListener('menuStateChange', (e) => {
            this.handleMenuStateChange(e.detail);
        });
    }

    handleMenuStateChange(detail) {
        this.menuOpen = detail.isOpen;
        this.menuWidth = detail.menuWidth;

        // Start animated transition to new boundaries
        this.startBoundaryTransition();
    }

    /**
     * Start animating the content boundaries to their new target positions
     */
    startBoundaryTransition() {
        // Calculate target boundaries based on menu state
        const availableWidth = this.menuOpen
            ? this.canvas.width - this.menuWidth
            : this.canvas.width;

        const center = availableWidth / 2;

        this.targetContentLeft = Math.max(0, center - this.contentWidth / 2 - this.contentPadding);
        this.targetContentRight = center + this.contentWidth / 2 + this.contentPadding;

        // Store previous positions for animation
        this.previousContentLeft = this.currentContentLeft;
        this.previousContentRight = this.currentContentRight;

        // Start transition
        this.boundaryTransitionStart = performance.now();
        this.isTransitioning = true;
    }

    /**
     * Update boundary animation (called each frame)
     */
    updateBoundaryTransition() {
        if (!this.isTransitioning) return;

        const now = performance.now();
        const elapsed = now - this.boundaryTransitionStart;
        let progress = Math.min(1, elapsed / this.boundaryTransitionDuration);

        // Ease-out function to match CSS ease timing
        progress = 1 - Math.pow(1 - progress, 3);

        // Interpolate boundaries
        this.currentContentLeft = this.previousContentLeft +
            (this.targetContentLeft - this.previousContentLeft) * progress;
        this.currentContentRight = this.previousContentRight +
            (this.targetContentRight - this.previousContentRight) * progress;

        // Update the actual boundaries used for visibility checks
        this.contentLeft = this.currentContentLeft;
        this.contentRight = this.currentContentRight;

        if (progress >= 1) {
            this.isTransitioning = false;
        }
    }

    /**
     * Get node opacity based on its position during a boundary transition
     * Creates a sweeping effect synchronized with menu animation
     *
     * When menu OPENS (boundaries move left):
     * - Left side: nodes disappear from right to left (rightmost disappear first)
     * - Right side: nodes appear from right to left (rightmost appear first)
     *
     * When menu CLOSES (boundaries move right):
     * - Left side: nodes appear from left to right (leftmost appear first)
     * - Right side: nodes disappear from left to right (leftmost disappear first)
     */
    getNodeTransitionOpacity(node) {
        if (!this.isTransitioning) return 1;

        const now = performance.now();
        const elapsed = now - this.boundaryTransitionStart;
        const rawProgress = Math.min(1, elapsed / this.boundaryTransitionDuration);

        // Ease-out to match CSS
        const progress = 1 - Math.pow(1 - rawProgress, 3);

        const fadeWidth = 80; // Width of fade zone in pixels

        const x = node.baseX;
        const prevLeft = this.previousContentLeft;
        const prevRight = this.previousContentRight;
        const targLeft = this.targetContentLeft;
        const targRight = this.targetContentRight;

        // Determine if this node is on the left side or right side of content
        // Use the midpoint between old and new content area
        const contentCenter = (prevLeft + prevRight + targLeft + targRight) / 4;
        const isLeftSide = x < contentCenter;

        if (isLeftSide) {
            // LEFT SIDE LOGIC
            const boundaryMovingLeft = targLeft < prevLeft; // Menu opening

            // Current animated boundary position
            const currentBoundary = prevLeft + (targLeft - prevLeft) * progress;

            if (boundaryMovingLeft) {
                // Menu opening: left boundary moves left, zone shrinks
                // Nodes near the old boundary (rightmost) disappear first
                // The "disappear sweep" moves from old boundary toward new boundary

                if (x < targLeft) {
                    // Node will remain visible after transition
                    return 1;
                } else if (x >= targLeft && x < currentBoundary) {
                    // Node is in the zone being "eaten" by content, fading out
                    // Closer to currentBoundary = more faded
                    const distFromBoundary = currentBoundary - x;
                    return Math.max(0, Math.min(1, distFromBoundary / fadeWidth));
                } else {
                    // Node has been passed by the sweep, should be hidden
                    return 0;
                }
            } else {
                // Menu closing: left boundary moves right, zone grows
                // Nodes near the old boundary (leftmost of new area) appear first

                if (x < prevLeft) {
                    // Node was already visible
                    return 1;
                } else if (x >= prevLeft && x < currentBoundary) {
                    // Node is in the zone being revealed, fading in
                    const distFromOldBoundary = x - prevLeft;
                    const revealedDistance = currentBoundary - prevLeft;
                    if (revealedDistance > 0) {
                        const fadeIn = distFromOldBoundary / Math.min(fadeWidth, revealedDistance);
                        return Math.min(1, fadeIn);
                    }
                    return 0;
                } else {
                    // Node not yet revealed
                    return 0;
                }
            }
        } else {
            // RIGHT SIDE LOGIC
            const boundaryMovingLeft = targRight < prevRight; // Menu opening

            // Current animated boundary position
            const currentBoundary = prevRight + (targRight - prevRight) * progress;

            if (boundaryMovingLeft) {
                // Menu opening: right boundary moves left, zone grows
                // New nodes appear from the old boundary outward (right to left in screen coords)
                // The "appear sweep" moves from old boundary toward new boundary

                if (x > prevRight) {
                    // Node was already visible
                    return 1;
                } else if (x > currentBoundary && x <= prevRight) {
                    // Node is in the zone being revealed, fading in
                    // Rightmost nodes (closer to prevRight) appear first
                    const distFromOldBoundary = prevRight - x;
                    const revealedDistance = prevRight - currentBoundary;
                    if (revealedDistance > 0) {
                        const fadeIn = distFromOldBoundary / Math.min(fadeWidth, revealedDistance);
                        return Math.min(1, fadeIn);
                    }
                    return 0;
                } else {
                    // Node not yet revealed
                    return 0;
                }
            } else {
                // Menu closing: right boundary moves right, zone shrinks
                // Nodes near the old boundary (leftmost) disappear first

                if (x > targRight) {
                    // Node will remain visible after transition
                    return 1;
                } else if (x > currentBoundary && x <= targRight) {
                    // Node is in the zone being "eaten" by content, fading out
                    const distFromBoundary = x - currentBoundary;
                    return Math.max(0, Math.min(1, distFromBoundary / fadeWidth));
                } else {
                    // Node has been passed by the sweep, should be hidden
                    return 0;
                }
            }
        }
    }

    updateContentBoundaries() {
        // When menu is open, content re-centers within (window - menu) space
        // Both boundaries shift left together
        const availableWidth = this.menuOpen
            ? this.canvas.width - this.menuWidth
            : this.canvas.width;

        const center = availableWidth / 2;

        this.contentLeft = center - this.contentWidth / 2 - this.contentPadding;
        this.contentRight = center + this.contentWidth / 2 + this.contentPadding;

        // Ensure contentLeft doesn't go negative (narrow viewport case)
        if (this.contentLeft < 0) {
            this.contentLeft = 0;
        }

        // Also update current values for non-animated state
        this.currentContentLeft = this.contentLeft;
        this.currentContentRight = this.contentRight;
        this.targetContentLeft = this.contentLeft;
        this.targetContentRight = this.contentRight;
    }

    updateAnimationState() {
        const shouldAnimate = this.isVisible && !this.isPaused;

        if (shouldAnimate && !this.isAnimating) {
            // Resuming animation
            this.isAnimating = true;
            this.animate(); // Restart the loop
        } else if (!shouldAnimate && this.isAnimating) {
            // Stopping animation
            this.isAnimating = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
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

        // Calculate current content boundaries based on menu state
        // When menu is open, content re-centers in (window - menu) space
        const availableWidth = this.menuOpen
            ? this.canvas.width - this.menuWidth
            : this.canvas.width;

        const center = availableWidth / 2;

        this.contentLeft = Math.max(0, center - this.contentWidth / 2 - this.contentPadding);
        this.contentRight = center + this.contentWidth / 2 + this.contentPadding;

        // Initialize animation boundaries
        this.currentContentLeft = this.contentLeft;
        this.currentContentRight = this.contentRight;
        this.targetContentLeft = this.contentLeft;
        this.targetContentRight = this.contentRight;
        this.previousContentLeft = this.contentLeft;
        this.previousContentRight = this.contentRight;

        // Store base boundaries (menu closed state) for node side classification
        const baseCenter = this.canvas.width / 2;
        const baseContentLeft = baseCenter - this.contentWidth / 2 - this.contentPadding;
        const baseContentRight = baseCenter + this.contentWidth / 2 + this.contentPadding;

        const baseSpacing = 60;
        const rows = Math.ceil(this.canvas.height / (baseSpacing * 0.866)) + 2;
        const cols = Math.ceil(this.canvas.width / baseSpacing) + 2;

        // Create nodes across the ENTIRE canvas
        // We'll filter which ones to draw based on current boundaries
        let nodeId = 0;
        for (let row = -1; row < rows; row++) {
            for (let col = -1; col < cols; col++) {
                const randomOffsetX = (Math.random() - 0.5) * baseSpacing * 0.6;
                const randomOffsetY = (Math.random() - 0.5) * baseSpacing * 0.6;

                const x = col * baseSpacing + (row % 2) * (baseSpacing / 2) + randomOffsetX;
                const y = row * baseSpacing * 0.866 + randomOffsetY;

                // Create ALL nodes, but mark their "home" side based on base boundaries
                // Nodes in the content area are created but will be filtered during drawing
                let side = 'content'; // default - in content area
                if (x < baseContentLeft) {
                    side = 'left';
                } else if (x > baseContentRight) {
                    side = 'right';
                }

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
                    side: side
                });
            }
        }

        this.spacing = baseSpacing;

        // Build initial shortcuts (only for visible nodes)
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

    /**
     * Check if a node is currently visible (outside content boundaries)
     */
    isNodeVisible(node) {
        return node.baseX < this.contentLeft || node.baseX > this.contentRight;
    }

    /**
     * Check if a node should be drawn during transition (with potential opacity)
     * Returns opacity value (0-1) or 0 if completely hidden
     */
    getNodeDrawOpacity(node) {
        // During transition, calculate opacity based on sweep position
        if (this.isTransitioning) {
            return this.getNodeTransitionOpacity(node);
        }

        // No transition, simple visibility check
        return this.isNodeVisible(node) ? 1 : 0;
    }

    findNearestNeighbor(node) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const other of this.nodes) {
            if (other.id === node.id) continue;
            if (this.getNodeDrawOpacity(other) === 0) continue; // Only consider drawable nodes
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

        // Get drawable nodes (those with opacity > 0)
        const drawableNodes = this.nodes.filter(n => this.getNodeDrawOpacity(n) > 0);

        // Draw local edges based on current distance
        for (let i = 0; i < drawableNodes.length; i++) {
            const node1 = drawableNodes[i];
            const node1Opacity = this.getNodeDrawOpacity(node1);

            for (let j = i + 1; j < drawableNodes.length; j++) {
                const node2 = drawableNodes[j];
                const dist = this.getCurrentDistance(node1, node2);

                if (dist < localConnectionThreshold) {
                    const node2Opacity = this.getNodeDrawOpacity(node2);
                    // Edge opacity is the minimum of both nodes' opacities
                    const edgeOpacity = Math.min(node1Opacity, node2Opacity) * 0.2;

                    this.ctx.strokeStyle = `rgba(0, 0, 0, ${edgeOpacity})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(node1.x, node1.y);
                    this.ctx.lineTo(node2.x, node2.y);
                    this.ctx.stroke();

                    if (edgeOpacity > 0.1) {
                        connectedNodes.add(node1.id);
                        connectedNodes.add(node2.id);
                    }
                }
            }
        }

        // Draw shortcut edges with individual opacities (only if both nodes drawable)
        this.ctx.lineWidth = 1;

        for (const shortcut of this.shortcuts) {
            const source = this.nodes[shortcut.sourceId];
            const target = this.nodes[shortcut.targetId];

            const sourceOpacity = this.getNodeDrawOpacity(source);
            const targetOpacity = this.getNodeDrawOpacity(target);

            // Only draw if both endpoints have some opacity
            if (sourceOpacity === 0 || targetOpacity === 0) continue;

            const edgeOpacity = Math.min(sourceOpacity, targetOpacity) * 0.2 * shortcut.opacity;
            this.ctx.strokeStyle = `rgba(0, 0, 0, ${edgeOpacity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(source.x, source.y);
            this.ctx.lineTo(target.x, target.y);
            this.ctx.stroke();

            if (edgeOpacity > 0.05) {
                connectedNodes.add(shortcut.sourceId);
                connectedNodes.add(shortcut.targetId);
            }
        }

        this.ctx.setLineDash([]);

        // Ensure every drawable node has at least one connection
        for (const node of drawableNodes) {
            const nodeOpacity = this.getNodeDrawOpacity(node);
            if (!connectedNodes.has(node.id) && nodeOpacity > 0.3) {
                const nearest = this.findNearestNeighbor(node);
                if (nearest) {
                    const nearestOpacity = this.getNodeDrawOpacity(nearest);
                    const edgeOpacity = Math.min(nodeOpacity, nearestOpacity) * 0.2;

                    this.ctx.strokeStyle = `rgba(0, 0, 0, ${edgeOpacity})`;
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

        // Update boundary transition (runs even when paused for responsiveness)
        this.updateBoundaryTransition();

        this.nodes.forEach(node => {
            if (this.isAnimating) {
                node.x = node.baseX + node.offsetX +
                       Math.sin(this.time * node.speed + node.phase) * node.amplitude;
                node.y = node.baseY + node.offsetY +
                       Math.cos(this.time * node.speed * 0.7 + node.phase) * node.amplitude * 0.7;
            }
        });

        this.drawConnections();

        // Draw nodes with their appropriate opacity
        this.nodes.forEach(node => {
            const opacity = this.getNodeDrawOpacity(node);
            if (opacity > 0) {
                this.ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * opacity})`;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        if (this.isAnimating || this.isTransitioning) {
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        }
    }
}

// Initialize background when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SmallWorldMeshBackground();
});

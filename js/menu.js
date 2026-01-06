'use strict';

/**
 * Navigation Menu for Praxis San Diego
 * Hamburger menu with expandable submenus loaded dynamically from JSON
 */

class NavigationMenu {
    constructor() {
        this.isOpen = false;
        this.menuData = {
            main: [
                { name: 'Home', href: '/index.html', hasSubmenu: false },
                { name: 'Community University', href: '/university.html', hasSubmenu: true, submenuId: 'university' },
                { name: 'Class Archive', href: '/classes/archive.html', hasSubmenu: true, submenuId: 'archive' }
            ],
            terms: {
                current: {
                    name: 'Winter 2026',
                    path: '/data/terms/winter2026.json',
                    linkPrefix: '/classes/winter2026/'
                },
                archived: [
                    {
                        name: 'Fall 2025',
                        path: '/data/terms/fall2025.json',
                        linkPrefix: '/classes/fall2025/'
                    }
                ]
            }
        };
        this.classData = {};
        this.init();
    }

    async init() {
        this.createMenuElements();
        this.attachEventListeners();
        await this.loadClassData();
    }

    createMenuElements() {
        // Create menu toggle button
        const menuToggle = document.createElement('button');
        menuToggle.id = 'menuToggle';
        menuToggle.className = 'menu-toggle';
        menuToggle.setAttribute('aria-label', 'Toggle navigation menu');
        menuToggle.innerHTML = `
            <span class="menu-line"></span>
            <span class="menu-line"></span>
            <span class="menu-line"></span>
        `;
        document.body.appendChild(menuToggle);

        // Create menu overlay
        const menuOverlay = document.createElement('div');
        menuOverlay.id = 'menuOverlay';
        menuOverlay.className = 'menu-overlay';
        document.body.appendChild(menuOverlay);

        // Create menu panel
        const menuPanel = document.createElement('nav');
        menuPanel.id = 'menuPanel';
        menuPanel.className = 'menu-panel';
        menuPanel.innerHTML = `
            <div class="menu-content">
                <ul class="menu-list">
                    ${this.menuData.main.map(item => this.createMenuItem(item)).join('')}
                </ul>
            </div>
        `;
        document.body.appendChild(menuPanel);
    }

    createMenuItem(item) {
        if (item.hasSubmenu) {
            return `
                <li class="menu-item has-submenu">
                    <div class="menu-item-header">
                        <a href="${item.href}">${item.name}</a>
                        <button class="submenu-toggle" data-submenu="${item.submenuId}" aria-label="Toggle ${item.name} submenu">
                            <span class="submenu-arrow">\u203A</span>
                        </button>
                    </div>
                    <ul class="submenu" id="submenu-${item.submenuId}">
                        <li class="submenu-loading">Loading classes...</li>
                    </ul>
                </li>
            `;
        }
        return `
            <li class="menu-item">
                <a href="${item.href}">${item.name}</a>
            </li>
        `;
    }

    attachEventListeners() {
        const menuToggle = document.getElementById('menuToggle');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuPanel = document.getElementById('menuPanel');

        // Toggle menu on button click
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Close menu when clicking overlay
        menuOverlay.addEventListener('click', () => {
            this.closeMenu();
        });

        // Submenu toggles
        document.querySelectorAll('.submenu-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const submenuId = toggle.dataset.submenu;
                this.toggleSubmenu(submenuId, toggle);
            });
        });

        // Close menu on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeMenu();
            }
        });
    }

    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        this.isOpen = true;
        document.getElementById('menuToggle').classList.add('active');
        document.getElementById('menuOverlay').classList.add('active');
        document.getElementById('menuPanel').classList.add('active');
        document.body.classList.add('menu-open');
        
        // Dispatch event for background animation to adjust
        window.dispatchEvent(new CustomEvent('menuStateChange', { 
            detail: { isOpen: true, menuWidth: this.getMenuWidth() }
        }));
    }

    getMenuWidth() {
        // Get the computed menu width from CSS custom property
        const menuPanel = document.getElementById('menuPanel');
        if (menuPanel) {
            return menuPanel.offsetWidth;
        }
        return 320; // fallback
    }

    closeMenu() {
        this.isOpen = false;
        document.getElementById('menuToggle').classList.remove('active');
        document.getElementById('menuOverlay').classList.remove('active');
        document.getElementById('menuPanel').classList.remove('active');
        document.body.classList.remove('menu-open');
        
        // Dispatch event for background animation to adjust
        window.dispatchEvent(new CustomEvent('menuStateChange', { 
            detail: { isOpen: false, menuWidth: 0 }
        }));
    }

    toggleSubmenu(submenuId, toggleButton) {
        const submenu = document.getElementById(`submenu-${submenuId}`);
        const arrow = toggleButton.querySelector('.submenu-arrow');
        const isExpanded = submenu.classList.contains('expanded');

        if (isExpanded) {
            submenu.classList.remove('expanded');
            arrow.classList.remove('rotated');
        } else {
            submenu.classList.add('expanded');
            arrow.classList.add('rotated');
        }
    }

    async loadClassData() {
        // Load current term classes for university submenu
        try {
            const currentTermResponse = await fetch(this.menuData.terms.current.path);
            if (currentTermResponse.ok) {
                const currentClasses = await currentTermResponse.json();
                this.classData.university = currentClasses.map(c => ({
                    name: c.name,
                    // Don't modify absolute URLs (external links)
                    href: c.link.startsWith('http://') || c.link.startsWith('https://')
                        ? c.link
                        : this.menuData.terms.current.linkPrefix + c.link.split('/').pop()
                }));
                this.populateSubmenu('university', this.classData.university);
            }
        } catch (error) {
            console.error('Error loading current term classes:', error);
            this.populateSubmenuError('university');
        }

        // Load archived term classes for archive submenu
        try {
            const allArchiveClasses = [];
            for (const term of this.menuData.terms.archived) {
                const response = await fetch(term.path);
                if (response.ok) {
                    const classes = await response.json();
                    classes.forEach(c => {
                        allArchiveClasses.push({
                            name: c.name,
                            // Don't modify absolute URLs (external links)
                            href: c.link.startsWith('http://') || c.link.startsWith('https://')
                                ? c.link
                                : term.linkPrefix + c.link.split('/').pop(),
                            term: term.name
                        });
                    });
                }
            }
            this.classData.archive = allArchiveClasses;
            this.populateSubmenu('archive', this.classData.archive, true);
        } catch (error) {
            console.error('Error loading archive classes:', error);
            this.populateSubmenuError('archive');
        }
    }

    populateSubmenu(submenuId, classes, showTerm = false) {
        const submenu = document.getElementById(`submenu-${submenuId}`);
        if (!submenu) return;

        if (classes.length === 0) {
            submenu.innerHTML = '<li class="submenu-item empty">No classes available</li>';
            return;
        }

        submenu.innerHTML = classes.map(c => `
            <li class="submenu-item">
                <a href="${c.href}">${c.name}${showTerm && c.term ? ` <span class="term-badge">${c.term}</span>` : ''}</a>
            </li>
        `).join('');
    }

    populateSubmenuError(submenuId) {
        const submenu = document.getElementById(`submenu-${submenuId}`);
        if (submenu) {
            submenu.innerHTML = '<li class="submenu-item error">Failed to load classes</li>';
        }
    }
}

// Initialize menu when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new NavigationMenu();
});

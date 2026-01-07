'use strict';

/**
 * Table Utilities for Praxis San Diego
 * Provides sorting, filtering, and data population for class tables
 */

// Store data globally for filtering/sorting operations
let allData = [];
let filteredData = [];
let isArchivePage = false; // Flag to determine which populate function to use
let defaultSortField = null; // Field to sort by when no column is selected
let defaultSortAscending = true; // Default sort direction

/**
 * Initialize a sortable table
 * @param {string} tableId - The ID of the table element
 */
function initTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.warn(`Table with ID "${tableId}" not found`);
        return;
    }
    
    const tbody = table.querySelector('tbody');
    const headers = table.querySelectorAll('th');

    // Sorting functionality
    headers.forEach(header => {
        header.addEventListener('click', function() {
            const column = parseInt(this.dataset.column);
            const isAsc = this.classList.contains('sort-asc');
            const rows = Array.from(tbody.querySelectorAll('tr'));

            // Remove sort classes from all headers
            headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

            // Add appropriate class to clicked header
            this.classList.add(isAsc ? 'sort-desc' : 'sort-asc');

            // Sort rows
            const sortedRows = rows.sort((a, b) => {
                const aText = a.cells[column].textContent.trim();
                const bText = b.cells[column].textContent.trim();

                // Check if values are dates
                const aDate = Date.parse(aText);
                const bDate = Date.parse(bText);

                if (!isNaN(aDate) && !isNaN(bDate)) {
                    return isAsc ? bDate - aDate : aDate - bDate;
                }

                // Regular string comparison
                if (isAsc) {
                    return bText.localeCompare(aText);
                } else {
                    return aText.localeCompare(bText);
                }
            });

            // Re-append sorted rows
            sortedRows.forEach(row => tbody.appendChild(row));
        });
    });
}

/**
 * Initialize controls for searchable/sortable data table
 * Used by university.html and archive.html
 */
function initializeControls() {
    const searchInput = document.getElementById('searchInput');
    const headers = document.querySelectorAll('th');

    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', filterTable);
    }

    // Sorting functionality
    headers.forEach(header => {
        header.sortState = 'none'; // Track sort state: none, asc, desc

        header.addEventListener('click', function() {
            const column = parseInt(this.dataset.column);

            // Cycle through states: none -> asc -> desc -> none
            if (this.sortState === 'none') {
                this.sortState = 'asc';
            } else if (this.sortState === 'asc') {
                this.sortState = 'desc';
            } else {
                this.sortState = 'none';
            }

            // Remove sort classes from all headers
            headers.forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
                if (h !== this) h.sortState = 'none'; // Reset other columns
            });

            // Apply appropriate class
            if (this.sortState === 'asc') {
                this.classList.add('sort-asc');
            } else if (this.sortState === 'desc') {
                this.classList.add('sort-desc');
            }

            // Sort data
            if (this.sortState === 'none') {
                // Return to original/default order
                filteredData = [...allData];
                // Apply any search filters first
                const searchInput = document.getElementById('searchInput');
                const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
                if (searchTerm) {
                    filteredData = filteredData.filter(item => {
                        return item.name.toLowerCase().includes(searchTerm) ||
                            item.description.toLowerCase().includes(searchTerm) ||
                            item.instructor.toLowerCase().includes(searchTerm) ||
                            item.when.toLowerCase().includes(searchTerm) ||
                            (item.where && item.where.toLowerCase().includes(searchTerm)) ||
                            (item.term && item.term.toLowerCase().includes(searchTerm));
                    });
                }
                // Apply default sort if specified
                if (defaultSortField) {
                    applyDefaultSort();
                }
                // Re-populate the table
                if (isArchivePage) {
                    populateArchiveTable(filteredData);
                } else {
                    populateTable(filteredData);
                }
            } else {
                sortData(column, this.sortState === 'asc');
            }
        });
    });
}

/**
 * Filter table based on search input
 */
function filterTable() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    filteredData = allData.filter(item => {
        const matchesSearch =
            item.name.toLowerCase().includes(searchTerm) ||
            item.description.toLowerCase().includes(searchTerm) ||
            item.instructor.toLowerCase().includes(searchTerm) ||
            item.when.toLowerCase().includes(searchTerm) ||
            (item.where && item.where.toLowerCase().includes(searchTerm)) ||
            (item.term && item.term.toLowerCase().includes(searchTerm));

        return matchesSearch;
    });

    // Apply default sort if specified and no column is actively sorted
    if (defaultSortField) {
        const headers = document.querySelectorAll('th');
        const anyColumnSorted = Array.from(headers).some(h => h.sortState && h.sortState !== 'none');
        if (!anyColumnSorted) {
            applyDefaultSort();
        }
    }

    // Use the appropriate populate function
    if (isArchivePage) {
        populateArchiveTable(filteredData);
    } else {
        populateTable(filteredData);
    }
}

/**
 * Apply default sort to filteredData
 */
function applyDefaultSort() {
    if (!defaultSortField) return;
    
    filteredData.sort((a, b) => {
        let aVal = a[defaultSortField] || '';
        let bVal = b[defaultSortField] || '';

        // Convert to lowercase for string comparison
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (defaultSortAscending) {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

/**
 * Sort data by column
 * @param {number} column - Column index
 * @param {boolean} ascending - Sort direction
 */
function sortData(column, ascending) {
    // Use 'term' for column 3 on archive page, 'where' otherwise
    const col3Field = isArchivePage ? 'term' : 'where';
    const fields = ['name', 'instructor', 'whenSort1', col3Field];
    const displayFields = ['name', 'instructor', 'when', col3Field];

    let field = fields[column];
    let displayField = displayFields[column];

    filteredData.sort((a, b) => {
        // Use whenSort1 for sorting but display when
        let aVal = field === 'whenSort1' ? (a[field] || a.when) : a[displayField];
        let bVal = field === 'whenSort1' ? (b[field] || b.when) : b[displayField];

        // Convert to lowercase for string comparison
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (ascending) {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    // Use the appropriate populate function
    if (isArchivePage) {
        populateArchiveTable(filteredData);
    } else {
        populateTable(filteredData);
    }
}

/**
 * Populate table with data (standard format with location column)
 * @param {Array} data - Array of class objects
 */
function populateTable(data) {
    const tbody = document.getElementById('archiveTableBody');
    if (!tbody) {
        console.warn('Table body element not found');
        return;
    }
    
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');

        row.id = item.id || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        row.innerHTML = `
            <td>
                <div class="class-name"><a href="${item.link}">${item.name}</a></div>
                <div class="class-description">${item.description}</div>
            </td>
            <td>${item.instructor}</td>
            <td>${item.when}</td>
            <td>${item.where || item.term || ''}</td>
        `;
        tbody.appendChild(row);
    });

    // Update visible count if element exists
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) {
        visibleCount.textContent = data.length;
    }
    
    // Create/update mobile class navigation
    createMobileClassNav(data, 'archiveTable');
}

/**
 * Populate archive table with term column instead of location
 * @param {Array} data - Array of class objects with term info
 */
function populateArchiveTable(data) {
    const tbody = document.getElementById('archiveTableBody');
    if (!tbody) {
        console.warn('Archive table body element not found');
        return;
    }
    
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');

        row.id = item.id || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        row.innerHTML = `
            <td>
                <div class="class-name"><a href="${item.link}">${item.name}</a></div>
                <div class="class-description">${item.description}</div>
            </td>
            <td>${item.instructor}</td>
            <td>${item.when}</td>
            <td>${item.term}</td>
        `;
        tbody.appendChild(row);
    });

    // Update visible count if element exists
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) {
        visibleCount.textContent = data.length;
    }
    
    // Create/update mobile class navigation
    createMobileClassNav(data, 'archiveTable');
}

/**
 * Load class data from a JSON file
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Promise<Array>} - Promise resolving to array of class data
 */
async function loadClassData(jsonPath) {
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading class data:', error);
        return [];
    }
}

/**
 * Load multiple term JSON files and combine them
 * @param {Array<Object>} terms - Array of {path, name} objects
 * @returns {Promise<Array>} - Combined array of class data with term info
 */
async function loadAllTerms(terms) {
    const allClasses = [];
    
    for (const term of terms) {
        try {
            const data = await loadClassData(term.path);
            // Add term info to each class
            data.forEach(classItem => {
                classItem.term = term.name;
                // Adjust link path for archive context if needed
                // Don't modify absolute URLs (external links)
                if (term.linkPrefix && !classItem.link.startsWith('http://') && !classItem.link.startsWith('https://')) {
                    classItem.link = term.linkPrefix + classItem.link;
                }
            });
            allClasses.push(...data);
        } catch (error) {
            console.error(`Error loading term ${term.name}:`, error);
        }
    }
    
    return allClasses;
}

/**
 * Create or update the mobile class filter (multi-select)
 * @param {Array} data - Array of class objects
 * @param {string} tableId - ID of the table to insert filter before
 */
function createMobileClassNav(data, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tableWrapper = table.closest('.table-wrapper');
    if (!tableWrapper) return;
    
    // Generate unique nav ID based on table ID
    const navId = 'mobileClassNav-' + tableId;
    
    // Check if filter already exists
    let navContainer = document.getElementById(navId);
    
    if (!navContainer) {
        // Create the filter container
        navContainer = document.createElement('div');
        navContainer.id = navId;
        navContainer.className = 'mobile-class-nav';
        
        // Create header with label and toggle button
        const header = document.createElement('div');
        header.className = 'mobile-filter-header';
        
        const label = document.createElement('span');
        label.className = 'mobile-filter-label';
        label.textContent = 'Filter classes:';
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'mobile-filter-toggle';
        toggleBtn.textContent = 'Show all ▼';
        toggleBtn.setAttribute('aria-expanded', 'false');
        
        header.appendChild(label);
        header.appendChild(toggleBtn);
        
        // Create the checkbox list container (hidden by default)
        const checkboxList = document.createElement('div');
        checkboxList.className = 'mobile-filter-list';
        checkboxList.setAttribute('aria-hidden', 'true');
        
        // Create "Select All / Clear All" buttons
        const actionRow = document.createElement('div');
        actionRow.className = 'mobile-filter-actions';
        
        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'mobile-filter-action-btn';
        selectAllBtn.textContent = 'Select all';
        selectAllBtn.type = 'button';
        
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'mobile-filter-action-btn';
        clearAllBtn.textContent = 'Clear all';
        clearAllBtn.type = 'button';
        
        actionRow.appendChild(selectAllBtn);
        actionRow.appendChild(clearAllBtn);
        checkboxList.appendChild(actionRow);
        
        // Create checkbox container
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'mobile-filter-checkboxes';
        checkboxList.appendChild(checkboxContainer);
        
        navContainer.appendChild(header);
        navContainer.appendChild(checkboxList);
        
        // Insert before the table wrapper
        tableWrapper.parentNode.insertBefore(navContainer, tableWrapper);
        
        // Toggle dropdown visibility
        toggleBtn.addEventListener('click', function() {
            const isExpanded = checkboxList.classList.toggle('expanded');
            this.setAttribute('aria-expanded', isExpanded);
            checkboxList.setAttribute('aria-hidden', !isExpanded);
            this.textContent = isExpanded ? 'Show all ▲' : 'Show all ▼';
        });
        
        // Select All button
        selectAllBtn.addEventListener('click', function() {
            const checkboxes = checkboxContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = true);
            applyClassFilter(tableId, checkboxContainer, toggleBtn);
        });
        
        // Clear All button
        clearAllBtn.addEventListener('click', function() {
            const checkboxes = checkboxContainer.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
            applyClassFilter(tableId, checkboxContainer, toggleBtn);
        });
    }
    
    // Get the checkbox container
    const checkboxContainer = navContainer.querySelector('.mobile-filter-checkboxes');
    const toggleBtn = navContainer.querySelector('.mobile-filter-toggle');
    checkboxContainer.innerHTML = '';
    
    // Create checkboxes for each class
    data.forEach(item => {
        const itemId = item.id || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        const checkboxWrapper = document.createElement('label');
        checkboxWrapper.className = 'mobile-filter-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = itemId;
        checkbox.checked = false; // Start unchecked (show all)
        
        // Strip HTML from name
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = item.name;
        const className = tempDiv.textContent || tempDiv.innerText;
        
        const labelText = document.createElement('span');
        labelText.textContent = className;
        
        checkboxWrapper.appendChild(checkbox);
        checkboxWrapper.appendChild(labelText);
        checkboxContainer.appendChild(checkboxWrapper);
        
        // Add change listener
        checkbox.addEventListener('change', function() {
            applyClassFilter(tableId, checkboxContainer, toggleBtn);
        });
    });
    
    // Update button text to show initial state
    toggleBtn.textContent = 'Show all ▼';
}

/**
 * Apply the class filter based on checked checkboxes
 * @param {string} tableId - ID of the table
 * @param {HTMLElement} checkboxContainer - Container with checkboxes
 * @param {HTMLElement} toggleBtn - The toggle button to update text
 */
function applyClassFilter(tableId, checkboxContainer, toggleBtn) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const checkboxes = checkboxContainer.querySelectorAll('input[type="checkbox"]');
    const checkedValues = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    const rows = tbody.querySelectorAll('tr');
    
    // If nothing is checked, show all
    const showAll = checkedValues.length === 0;
    
    rows.forEach(row => {
        if (showAll || checkedValues.includes(row.id)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update button text
    if (showAll) {
        toggleBtn.textContent = toggleBtn.getAttribute('aria-expanded') === 'true' 
            ? 'Show all ▲' 
            : 'Show all ▼';
    } else {
        const arrow = toggleBtn.getAttribute('aria-expanded') === 'true' ? '▲' : '▼';
        toggleBtn.textContent = `${checkedValues.length} selected ${arrow}`;
    }
    
    // Update visible count if element exists
    const visibleCount = document.getElementById('visibleCount');
    if (visibleCount) {
        const visibleRows = tbody.querySelectorAll('tr:not([style*="display: none"])').length;
        visibleCount.textContent = visibleRows;
    }
}

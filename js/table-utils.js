'use strict';

/**
 * Table Utilities for Praxis San Diego
 * Provides sorting, filtering, and data population for class tables
 */

// Store data globally for filtering/sorting operations
let allData = [];
let filteredData = [];

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
                // Return to original order
                filteredData = [...allData];
                filterTable(); // Re-apply any active filters
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

    populateTable(filteredData);
}

/**
 * Sort data by column
 * @param {number} column - Column index
 * @param {boolean} ascending - Sort direction
 */
function sortData(column, ascending) {
    const fields = ['name', 'instructor', 'whenSort1', 'where'];
    const displayFields = ['name', 'instructor', 'when', 'where'];

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

    populateTable(filteredData);
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
                if (term.linkPrefix) {
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

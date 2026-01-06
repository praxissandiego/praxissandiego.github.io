'use strict';

/**
 * Class Page Utilities for Praxis Community University
 * Handles loading class data and populating page elements
 */

// Current term - classes from this term link to university.html
// Archived terms link to archive.html
const CURRENT_TERM = 'Winter 2026';

/**
 * Load class data from JSON and populate page elements
 * @param {string} className - The name of the class to find
 * @param {string} term - The term name (e.g., "Fall 2025")
 * @param {string} jsonPath - Path to the JSON data file
 */
async function loadAndPopulateClassPage(className, term, jsonPath) {
    try {
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const allClasses = await response.json();

        // Find the specific class
        const classData = allClasses.find(c => c.name === className);

        if (classData) {
            // Populate the page with data from JSON
            const backLink = document.getElementById('backLink');
            if (backLink) {
                // Archived terms link to archive, current term links to university
                if (term === CURRENT_TERM) {
                    backLink.textContent = "← to " + term + " Classes";
                    backLink.href = "/university.html#" + classData.id;
                } else {
                    backLink.textContent = "← to Class Archive";
                    backLink.href = "/classes/archive.html#" + classData.id;
                }
            }

            const classNameElement = document.getElementById('className');
            if (classNameElement) {
                classNameElement.textContent = classData.name;
            }

            // Only update 'when' if it still says "Loading..."
            const whenElement = document.getElementById('when');
            if (whenElement && whenElement.textContent === 'Loading...') {
                whenElement.innerHTML = classData.when.replace(/<br>/g, '<br>');
            }

            // Only update 'where' if it still says "Loading..."
            const whereElement = document.getElementById('where');
            if (whereElement && whereElement.textContent === 'Loading...') {
                whereElement.innerHTML = classData.where.replace(/<br>/g, '<br>');
            }

        } else {
            console.error('Class not found in JSON:', className);
            const classNameElement = document.getElementById('className');
            if (classNameElement) {
                classNameElement.textContent = 'Class Not Found';
            }
        }
    } catch (error) {
        console.error('Error loading class data:', error);
    }
}

/**
 * Handle iframe loading message
 */
function initFormHandler() {
    const iframe = document.querySelector('#formContainer iframe');
    const loadingMessage = document.querySelector('.loading-message');

    if (iframe) {
        iframe.addEventListener('load', function() {
            if (loadingMessage) {
                loadingMessage.style.display = 'none';
            }
        });
    }
}

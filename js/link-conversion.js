'use strict';

/**
 * Link Conversion Utility
 * Converts obfuscated email links to actual mailto links
 * This helps prevent spam bots from harvesting email addresses
 */
document.addEventListener('DOMContentLoaded', function() {
    const linkElements = document.querySelectorAll('#link-conversion, [id^="link-conversion"]');
    
    linkElements.forEach(a => {
        if (a && a.getAttribute('href')) {
            a.setAttribute('href', a.getAttribute('href')
                .replaceAll('-', '')
                .replaceAll(':', '')
                .replace('/', '.')
                .replace('_', '@')
                .replace('to', 'mailto:')
            );
        }
    });
});

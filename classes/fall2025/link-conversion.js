'use strict';

document.addEventListener('DOMContentLoaded', function ()
{
	const a = document.getElementById('link-conversion');

	a.setAttribute('href', a.getAttribute('href')
		.replaceAll('-', '')
		.replaceAll(':', '')
		.replace('/', '.')
		.replace('_', '@')
		.replace('to', 'mailto:')
	);
});

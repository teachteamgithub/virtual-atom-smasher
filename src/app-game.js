
/**
 * Configure application
 */
requirejs.config({

	//By default load any module IDs from js/lib
	'baseUrl': 'modules',

	// Import external packages
	'packages': [
		'extern',
		'core',
		'vas',
		{
			'name': 'tootr',
			'location': 'tootr/js'
		}
	],

	map: {
		'*': {
			'less': 'extern/require-less/js/less'
		}
	}

});

/**
 * Start application
 */
requirejs(['require', 'extern', 'core', 'vas', 'tootr'], 
	function (require, Extern, Core, VAS, Tootr) {

		require(
			[
				// Core components required by bootstrap
				"jquery",
				"vas/core",
				// Game modules
				"vas/basic",
				"vas/3d/main",
			], 
			function($, main) {

				$(function() {
					// Initialize VAS 
					main.initialize(function() {
						// Wait until VAS is ready and run it
						main.run();
					});
				});

			}
		);
		
	}
);

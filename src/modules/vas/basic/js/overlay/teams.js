define(

	// Dependencies
	[
		"jquery", 
		"core/ui/tabs",
		"core/ui/table",
		"vas/core/base/components/overlays", 
		"vas/core/registry", 
		"vas/core/user",
		"text!vas/basic/tpl/overlay/teams.html"
	],

	/**
	 * Basic version of the teams screen
	 *
	 * @exports vas-basic/screen/teams
	 */
	function ($, Tabs, Table, C, R, User, tpl) {

		function dateFromTs(ts) {
    		var date = new Date(ts*1000);
    		return (
    			('0'+date.getDate()).substr(-2) + '/' +
    			('0'+date.getMonth()).substr(-2) + '/' +
    				 date.getFullYear() + ' ' +
    			('0'+date.getHours()).substr(-2) + ':' +
    			('0'+date.getMinutes()).substr(-2) + ':' +
    			('0'+date.getSeconds()).substr(-2)
    		);
		}

		/**
		 * @class
		 * @classdesc The basic teams screen overlay
         * @augments module:vas-core/base/components/overlays~TeamsOverlay
         * @template vas/basic/tpl/overlay/teams.html
         * @registry overlay.teams
		 */
		var DefaultTeamsOverlay = function (hostDOM) {
			C.TeamsOverlay.call(this, hostDOM);

			// Load view template and plutins
			hostDOM.addClass("teams");
			this.loadTemplate(tpl);
            this.renderView();

            // Init tabs controller
            this.tabsController = new Tabs(
            		this.select(".tab-body"), this.select(".tab-bar > ul")
            	);

            // Init table
            this.tableResources = new Table(
            		this.select(".table-resources")
            	);

            this.tableResources.addColumn( "", "Status", 1,
            	function(id, data){ 
            		if (data['jobs_failed'] >= data['jobs_succeed']) {
	            		return $('<img src="modules/vas/basic/img/icons/bullet_error.png" />');
            		} else {
	            		return $('<img src="modules/vas/basic/img/icons/bullet_green.png" />');
            		} });
            this.tableResources.addColumn( "uuid", "ID", 4, 
            	function(id, data){ return $('<a target="_blank"></a>')
            		.attr("href","https://www.google.com/maps?q="+data['latlng'])
            		.text( String(id).split("/")[1] ); });
            this.tableResources.addColumn( "lastActivity", "Last Activity", 3,
            	function(ts){ return $('<span></span>').text( dateFromTs(ts) ); });
            this.tableResources.addColumn( "jobs_sent", "Jobs", 1 );
            this.tableResources.addColumn( "jobs_succeed", "Good", 1 );
            this.tableResources.addColumn( "jobs_failed", "Bad", 1 );
            this.tableResources.addColumn( "slots", "Slots", 1 );

			///////////////////////////////
			// View Control
			///////////////////////////////

		}

		DefaultTeamsOverlay.prototype = Object.create(C.TeamsOverlay.prototype);

		//////////////////////////////////////////////////////////////
		// Helper functions
		//////////////////////////////////////////////////////////////

		/**
		 * Update details of all windows
		 */
		DefaultTeamsOverlay.prototype.updateDetails = function(cb) {

			// Completed countdown
			var left = 2,
				cb_countdown = function() {
					if (--left == 0) cb();
				};

			// Perform parallel requests
			User.getTeamResources((function(data) {

				// Update resources
				console.log("Resources:",data);
				this.tableResources.set( data );

				cb_countdown();
			}).bind(this));
			User.getTeamDetails((function(data) {

				// Update details
				console.log("Details:",data);

				cb_countdown();
			}).bind(this));

		}

		//////////////////////////////////////////////////////////////
		// Base Callback Handlers 
		//////////////////////////////////////////////////////////////

		/**
		 * Populate the interface before showing it
		 *
		 * @param {function} cb - The callback to fire when the website is loaded
		 */
		DefaultTeamsOverlay.prototype.onWillShow = function(cb) {
			this.updateDetails(cb);
		}

		// Register login screen
		R.registerComponent("overlay.teams", DefaultTeamsOverlay, 1);

	}
);

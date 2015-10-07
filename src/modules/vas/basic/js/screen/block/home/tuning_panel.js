define(

	// Dependencies
	["jquery", "vas/core/registry", "vas/core/ui", "vas/core/base/components/tuning" ], 

	/**
	 * This is the default tunable widget component for the base interface.
	 *
 	 * @exports vas-basic/screen/block/home/tuning_panel
	 */
	function($, R, UI, TC) {

		/**
		 * A pop-up tuning panel.
		 *
		 * @class
		 * @registry screen.block.tuning_panel
		 */
		var DefaultTuningPanel = function(hostDOM) {

			// Initialize widget
			TC.TuningPanel.call(this, hostDOM);

			// Prepare DOM
			hostDOM.addClass("tuning-panel hidden");
			this.headerElm = $('<div class="header">Test</div>').appendTo(hostDOM);
			this.tunablesElm = $('<div class="tunables"></div>').appendTo(hostDOM);

			// Map of tunables
			this.tunablesMap = {};
			this.valuesMap = {};
			this.firstTunable = false;

			// Dimentions of the panel
			this.panelSize = {
				'width': 0,
				'height': 0
			};

		};

		// Subclass from TuningPanel
		DefaultTuningPanel.prototype = Object.create( TC.TuningPanel.prototype );

		////////////////////////////////////////////////////////////
		//                    Helper Functions                    //
		////////////////////////////////////////////////////////////

		/**
		 * Register a new tunable widget
		 */
		DefaultTuningPanel.prototype.defineAndRegister = function(metadata) {
			var container = $('<div></div>').appendTo(this.tunablesElm),
				com = R.instanceComponent("widget.tunable_slider", container);
			if (!com) return;

			// Register first tunable
			if (this.firstTunable) {
				this.firstTunable = false;
				R.registerVisualAid( 'tuning.firsttunable', com );				
			}

			// Initialize tunable
			com.onMetaUpdate(metadata);

			// Forward visual events to the component
			this.forwardVisualEvents(com);

			// Adopt all events from the tunables
			this.adoptEvents( com );

			// Bind events
			com.on('valueChanged', (function(newValue) {
				// Update value on valuesMap
				this.valuesMap[metadata['name']] = newValue;
				// Trigger change
				this.trigger('change', this.valuesMap);
			}).bind(this));

			// Listen for mouse events on the container
			container.mouseenter((function() {
				this.trigger('hover', name);
			}).bind(this));

			// Update component value
			com.onUpdate( this.valuesMap[metadata['name']] );

			// Resize to update DOM information
			com.onResize( com.width, com.height );

			// Store component tunables map
			this.tunablesMap[metadata['name']] = com;

			// Return component
			return com;
		}

		////////////////////////////////////////////////////////////
		//           Implementation of the TuningWidget           //
		////////////////////////////////////////////////////////////

		/**
		 * This event is fired when the tunables of this panel should be defined
		 */
		DefaultTuningPanel.prototype.onTuningValuesDefined = function( currentValues ) {

			// Keep a reference of the values map
			this.valuesMap = currentValues;

			// Update all markers
			for (k in currentValues) {
				if (this.tunablesMap[k]) {
					this.tunablesMap[k].onUpdate( this.valuesMap[k] );
				}
			}

		}

		/**
		 * This event is fired when the saved slot values are updated
		 */
		DefaultTuningPanel.prototype.onTuningMarkersDefined = function( markersMap ) {
			// Update all markers
			for (k in markersMap) {
				if (this.tunablesMap[k]) {
					this.tunablesMap[k].onMarkersDefined( markersMap[k] );
				}
			}
		}

		/**
		 * This event is fired when the tunables of this panel should be defined
		 */
		DefaultTuningPanel.prototype.onTuningPanelDefined = function(title, tunables) {

			// Reset everything
			this.firstTunable = true;
			this.tunablesElm.empty();

			// If we don't have tunables, display an error page
			if (!tunables) {
				this.headerElm.text("Locked");
				this.tunablesElm.addClass("empty");
				$('<div class="empty-placeholder">No tunable parameters in this machine part</div>').appendTo(this.tunablesElm);
				this.width = 200;
				this.height = 100;
				return;
			} else {
				this.tunablesElm.removeClass("empty");
				this.headerElm.text(title);
			}

			// Prepare panel dimentions according to the number of tunables
			var row_height = 58, row_width = 250,
				grid_w = 0, grid_h = 0;
			if (tunables.length <= 5) {
				grid_h = row_height * tunables.length + 8;
				grid_w = row_width + 10;
				this.tunablesElm.removeClass("col-2");
			} else {
				var max_rows = Math.floor(tunables.length / 2);
				grid_h = max_rows * row_height + 8;
				grid_w = 2 * row_width + 10;
				this.tunablesElm.addClass("col-2");
			}

			// Resize container element
			this.tunablesElm.css({
				'width': grid_w,
				'height': grid_h
			});

			// Define the dimentions
			this.width = grid_w;
			this.height = 21 + grid_h;

			// Regenerate tunables
			for (var i=0; i<tunables.length; i++) {
				var t = tunables[i];
				this.defineAndRegister(t);
			}
		}

		/**
		 * This event is fired when the view is scrolled/resized and it
		 * specifies the height coordinates of the bottom side of the screen.
		 */
		DefaultTuningPanel.prototype.onResize = function(width, height) {

			// Update size variables
			this.width = width;
			this.height = height;

			// Define the dimentions
			var win_t = 'translate(-' + Math.round(width/2) + 'px, -' + Math.round(height/2) + 'px)'
			this.hostDOM.css({
				// Width/height
				'width': width,
				'height': height,
				// Centering
				'left': width/2,
				'top': height/2,
				'transform': win_t,
				'oTransform': win_t,
				'msTransform': win_t,
				'webkitTransform': win_t,
				'mozTransform': win_t,
			});

		}

		/**
		 * Update a particular parameter
		 */
		DefaultTuningPanel.prototype.onParameterChanged = function(parameter, value) {
			if (!this.tunablesMap[parameter]) return;
			this.tunablesMap[parameter].onUpdate( value, true );
		}

		// Store tuning widget component on registry
		R.registerComponent( 'screen.block.tuning_panel', DefaultTuningPanel, 1 );

	}

);
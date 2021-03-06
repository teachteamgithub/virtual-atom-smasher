
define(["jquery", "vas/config", "vas/core/registry", "vas/core/db", "vas/media", "vas/core/base/components", "vas/core/user", "ccl-tracker", "vas/core/sequencer"], 
	function($, config, R, DB, Media, Components, User, Analytics, Sequencer) {

		///////////////////////////////////////////////////////////////
		//                    ANALYTICS FUNCTIONS                    //
		///////////////////////////////////////////////////////////////

		/**
		 * Fire a blur event
		 */
		$('window').blur((function(e) {
			Analytics.fireEvent("blur");
		}).bind(this));

		/**
		 * Fire a focus event
		 */
		$('window').focus((function(e) {
			Analytics.fireEvent("focus");
		}).bind(this));

		/**
		 * Try to identify bad clicks
		 */
		var badClicks = 0,
			badClicksStart = 0,
			badClicksTimer = 0,
			badClickLocations = [];

		$('body').click(function(e) {
			var target = $(e.target),
				valid_selectors = "button,a,input,.navbtn-large,.tab";

			// UI Elements (or parent elements) are good
			if (target.is(valid_selectors) ||
			   (target.parent(valid_selectors).length != 0))
				return;

			// Other known UI classes
			if (
				(target.parent(".tunable").length != 0) ||
				(target.parent(".r-machine-overlay").length != 0)
			) return;

			// Everything else is invalid click

			// Count bad clicks
			badClicks += 1;

			// Collect locations
			badClickLocations.push([ e.pageX, e.pageY ]);

			// Clear previous timer
			if (badClicksTimer)
				clearTimeout(badClicksTimer);

			// Set a bad click timeout
			badClicksTimer = setTimeout(function() {
				var delta = Date.now() - badClicksStart;

				// Average x,y locations
				var x = 0, y = 0;
				for (var i=0; i<badClickLocations.length; i++) {
					x += badClickLocations[i][0];
					y += badClickLocations[i][1];
				}
				x /= badClickLocations.length;
				y /= badClickLocations.length;

				// Fire analytics 
				Analytics.fireEvent('ui.bad_clicks', {
					'id' 		: 'interface',
					'number' 	: badClicks,
					'time' 		: delta,
					"locations" : badClickLocations,
					"x" 		: x,
					"y" 		: y,
				});

				// Reset counters
				badClicks = 0;
				badClicksStart = 0;
				badClicksTimer = 0;
				badClickLocations = [];

			}, 1000);

			// Mark first time we had a bad click
			if (!badClicksStart) {
				badClicksStart = Date.now();
			}


		});

		///////////////////////////////////////////////////////////////
		//                     HELPER FUNCTIONS                      //
		///////////////////////////////////////////////////////////////

		/**
		 * Find vendor suffix
		 */
		function get_vendor_suffix() {
			var styles = window.getComputedStyle(document.documentElement, ''),
				pre = (Array.prototype.slice
				.call(styles)
				.join('') 
				.match(/-(moz|webkit|ms)-/) || (styles.OLink === '' && ['', 'o'])
				)[1]
			return pre;				
		}

		/**
		 * Append vendor suffix on the given string
		 */
		function with_vendor_suffix(txt) {
			var suff = get_vendor_suffix();
			if (!suff) return txt;
			return suff + txt[0].toUpperCase() + txt.substr(1);
		}

		/**
		 * Functions to makage a 4-segment black masks that can be used to hide/show
		 * any arbitrary object on the UI, just by it's coorinates
		 */
		var overlayMasks = [];

		// Prepare the 4 masks
		function overlaymasks_prepare( host ) {
			
			// Put 4 masks
			for (var i=0; i<4; i++) {
				var elm = $('<div class="mask-part">');
				host.append(elm);
				overlayMasks.push(elm);
			}

			// And the mask ring
			var elm = $('<div class="mask-ring"></div>');
			host.append(elm);
			overlayMasks.push(elm);

		}

		// Reposition masks to keep the specified rect clean
		function overlaymasks_apply( x,y,w,h ) {
			var rhb = 3; // Ring half-border
			if ((x === false) || (x === undefined)) {
				overlayMasks[0].addClass("fullscreen").attr('style', '');
				overlayMasks[1].hide();
				overlayMasks[2].hide();
				overlayMasks[3].hide();
				overlayMasks[4].hide();
			} else {
				overlayMasks[0].removeClass("fullscreen").css({
					'left': 0, 'top': 0,
					'width': x, 'bottom': 0
				});
				overlayMasks[1].show().css({
					'left': x+w, 'top': 0,
					'right': 0, 'bottom': 0
				});
				overlayMasks[2].show().css({
					'left': x, 'top': 0,
					'width': w, 'height': y
				});
				overlayMasks[3].show().css({
					'left': x, 'top': y+h,
					'width': w, 'bottom': 0
				});
				overlayMasks[4].show().css({
					'left': x-rhb, 'top': y-rhb,
					'width': w-rhb, 'height': h-rhb
				});
			}
		}

		// The same as above but accepts an element as first argument
		function overlaymasks_apply_element(e) {
			if (!e) {
				overlaymasks_apply( false );
			} else {
				var e = $(e),
					offset = e.offset(),
					w = e.outerWidth(),
					h = e.outerHeight();

				// Bugfix in corner cases
				if (e.parents("svg").length > 0) {

					// SVG:CIRCLE
					if (e[0].tagName == "circle") {
						w = h = parseInt(e.attr("r"))*2;
					}
					// SVG:IMAGE
					else if (e[0].tagName == "image") {
						w = parseInt(e.attr("width"));
						h = parseInt(e.attr("height"));
					}

				}

				overlaymasks_apply( offset.left, offset.top, w, h );
			}
		}

		/**
		 * Local properties for visual aids
		 */
		var visualAidCurrent = false,
			visualAidTimer = 0,
			visualAidWasVisible = false,
			visualAidMeta = {},
			visualAidClasses = "",
			tutorialOriginalScreen = "",
			tutorialCompleteListener = false,
			tutorialActive = false,
			tutorialSequence = "",
			pendingOverlays = [],
			popupWidget = false;

		///////////////////////////////////////////////////////////////
		//                       IMPLEMENTATION                      //
		///////////////////////////////////////////////////////////////

		/**
		 * This module provides the basic user interface functionality 
		 * to the Virtual Atom Smasher.
		 *
		 * @exports vas-core/ui
		 */
		var UI = {};

		/**
		 * Vendor suffix, for calculating events & CSS properties
		 *
		 * @type {string}
		 */
		UI.vendorSuffix = get_vendor_suffix();

		/**
		 * The name of the currently active screen
		 *
		 * @type {string}
		 */
		UI.activeScreen = "";

		/**
		 * The mini-nav component
		 *
		 * @type {MiniNavComponent}
		 */
		UI.mininav = "";

		/**
		 * The ID of the previous screen
		 * (Used by the selectPreviousScreen)
		 *
		 * @type {string}
		 */
		UI.previousScreen = "";

		/**
		 * The currently registered screens
		 *
		 * @type {Object}
		 */
		UI.screens = {};

		/**
		 * The currently registered popup widgets
		 *
		 * @type {Object}
		 */
		UI.popupWidgets = {};

		/**
		 * List of visible first-time aids
		 *
		 * @type {Array}
		 */
		UI.firstTimeAids = [];

		/**
		 * List of pending first-time aids for display
		 *
		 * @type {Array}
		 */
		UI.firstTimeAidsPending = [];

		/**
		 * First-time aids already shown
		 *
		 * @type {Object}
		 */
		UI.firstTimeAidsShown = {};

		/**
		 * Stack of growl elements in the screen
		 * 
		 * @type {Array}
		 */
		UI.growlStack = [];

		/**
		 * UI Lockdown flag
		 *
		 * When this is set to true, no interface operations are allowed
		 *
		 * @type {Boolean}
		 */
		UI.lockdown = false;

		/**
		 * Screen transitions
		 *
		 */
		UI.Transitions = {
			ZOOM_IN  		: [ 'pt-page-scaleDown', 	'pt-page-scaleUpDown pt-page-delay300' ],
			ZOOM_OUT 		: [ 'pt-page-scaleDownUp', 'pt-page-scaleUp pt-page-delay300' ],
			
			DIFF_RIGHT 		: [ 'pt-page-moveToLeftEasing pt-page-ontop', 'pt-page-moveFromRight' ],
			DIFF_LEFT 		: [ 'pt-page-moveToRightEasing pt-page-ontop', 'pt-page-moveFromLeft' ],
			DIFF_BOTTOM		: [ 'pt-page-moveToTopEasing pt-page-ontop', 'pt-page-moveFromBottom' ],
			DIFF_TOP		: [ 'pt-page-moveToBottomEasing pt-page-ontop', 'pt-page-moveFromTop' ],
			
			FLIP_RIGHT		: [ 'pt-page-flipOutRight', 'pt-page-flipInLeft pt-page-delay500' ],
			FLIP_LEFT		: [ 'pt-page-flipOutLeft', 'pt-page-flipInRight pt-page-delay500' ],
			FLIP_TOP		: [ 'pt-page-flipOutTop', 'pt-page-flipInBottom pt-page-delay500' ],
			FLIP_BOTTOM		: [ 'pt-page-flipOutBottom', 'pt-page-flipInTop pt-page-delay500' ],

			PULL_RIGHT		: [ 'pt-page-rotatePushLeft', 'pt-page-rotatePullRight pt-page-delay180' ],
			PULL_LEFT		: [ 'pt-page-rotatePushRight', 'pt-page-rotatePullLeft pt-page-delay180' ],
			PULL_BOTTOM		: [ 'pt-page-rotatePushTop', 'pt-page-rotatePullBottom pt-page-delay180' ],
			PULL_TOP		: [ 'pt-page-rotatePushBottom', 'pt-page-rotatePullTop pt-page-delay180' ],

			FADE_LEFT		: [ 'pt-page-fade', 'pt-page-moveFromRight pt-page-ontop' ],
			FADE_RIGHT		: [ 'pt-page-fade', 'pt-page-moveFromLeft pt-page-ontop' ],
			FADE_BOTTOM		: [ 'pt-page-fade', 'pt-page-moveFromBottom pt-page-ontop' ],
			FADE_TOP		: [ 'pt-page-fade', 'pt-page-moveFromTop pt-page-ontop' ],

			MOVE_LEFT		: [ 'pt-page-moveToRight', 'pt-page-moveFromLeft' ],
			MOVE_RIGHT		: [ 'pt-page-moveToLeft', 'pt-page-moveFromRight' ],
			MOVE_BOTTOM		: [ 'pt-page-moveToTop', 'pt-page-moveFromBottom' ],
			MOVE_TOP		: [ 'pt-page-moveToBottom', 'pt-page-moveFromTop' ],

			SCALEDOWN_LEFT	: [ 'pt-page-scaleDown', 'pt-page-moveFromRight pt-page-ontop' ],
			SCALEDOWN_RIGHT	: [ 'pt-page-scaleDown', 'pt-page-moveFromLeft pt-page-ontop' ],
			SCALEDOWN_BOTTOM: [ 'pt-page-scaleDown', 'pt-page-moveFromBottom pt-page-ontop' ],
			SCALEDOWN_TOP	: [ 'pt-page-scaleDown', 'pt-page-moveFromTop pt-page-ontop' ],

			SCALEUP_LEFT	: [ 'pt-page-moveToLeft pt-page-ontop', 'pt-page-scaleUp' ],
			SCALEUP_RIGHT	: [ 'pt-page-moveToRight pt-page-ontop', 'pt-page-scaleUp' ],
			SCALEUP_BOTTOM 	: [ 'pt-page-moveToTop pt-page-ontop', 'pt-page-scaleUp' ],
			SCALEUP_TOP		: [ 'pt-page-moveToBottom pt-page-ontop', 'pt-page-scaleUp' ],

		};

		/**
		 * Overridable function
		 */
		UI.logError = function(text, critical) {
			if (critical) {
				console.error("Critical Error: ",text);
			} else {
				console.warn("Critical Error: ",text);
			}
		}

		/**
		 * Initialize & Register the specified screen by it's name
		 */
		UI.initAndPlaceScreen = function(name, validateSubclass) {

			// Create host DOM for the component
			var comDOM = $('<div class="'+config.css['screen']+'"></div>');
			UI.host.append(comDOM);

			// Create screen instance
			var s = R.instanceComponent(name, comDOM), valid = true;
			if (s !== undefined) {

				// Check if we are requested to do a subclass validation
				if (validateSubclass !== undefined) {
					if (!(s instanceof validateSubclass)) {
						// Mark DOM as invalid
						comDOM.empty();
						comDOM.addClass(config.css['error-screen']);
						comDOM.html("Could not validate <strong>"+name+"</strong>");
						valid = false;
					}
				}

				if (valid) {
					// Fire reisze right after it's placed on DOM
					s.onResize(comDOM.width(), comDOM.height());
					// Store it on screens if it's valid
					UI.screens[name] = s;
				}

			} else {

				// Otherwise mark it as an invalid screen
				comDOM.addClass(config.css['error-screen']);
				comDOM.html("Could load <strong>"+name+"</strong>");

			}

			// Perserve the original classes
			comDOM.data("originalClasses", comDOM.attr("class"));

			// Activate first screen
			if (!UI.activeScreen) {
				UI.activeScreen = name;
				// Fire the onShown event
				s.onShown();
				// Make it current
				comDOM.addClass("pt-current");
				comDOM.addClass("pt-page-ontop");
			} else {
				// Otherwise hide it
				//comDOM.hide();
			}


			// Return instance
			return s;
	
		}

		/**
		 * Initialize the user interface for the game
		 *
		 * This function **MUST** be called in order to initialize the game layout.
		 */
		UI.initialize = function() {

			// Initialize Virtual Atom Smasher Interface
			UI.gameFrame = $(config['dom-host']);

			// Prepare host
			UI.host = $('<div></div>').appendTo(UI.gameFrame);
			UI.host.addClass("fullscreen host-main pt-main pt-perspective");

			// Prepare overlay host
			UI.activeOverlayComponent = null;
			UI.hostOverlay = $('<div></div>').appendTo(UI.gameFrame);
			UI.hostOverlay.addClass("fullscreen host-overlay");
			UI.hostOverlay.hide();
			UI.hostOverlay.click(function(e) {

				// Stop propagation
				e.preventDefault();
				e.stopPropagation();

				// Dispose active component
				var lastActiveComponent = UI.activeOverlayComponent;

				// Reset overlay stack and hide
				UI.hideOverlay();

				// Trigger dispose to the previously active component
				if (lastActiveComponent)
					lastActiveComponent.trigger('dispose');

			});

			// Prepare host overlay navbar (on top)
			UI.hostOverlayNavbar = $('<div class="host-overlay-navbar"></div>').appendTo(UI.hostOverlay);

			// Prepare overlay window
			UI.hostOverlayWindow = $('<div class="pt-main pt-perspective"></div>').appendTo(UI.hostOverlay);
			UI.hostOverlayWindow.addClass('overlay-window');
			UI.hostOverlayWindow.click(function(e) {
				e.stopPropagation();
			});

			// Prepare dummy blank screen for the overlay
			UI.blankOverlayScreen = $('<div class="pt-current pt-page-ontop"></div>').appendTo(UI.hostOverlayWindow);
			UI.blankOverlayScreen.addClass(config.css['screen']);
			UI.blankOverlayScreen.data("originalClasses", config.css['screen']);

			// Place an overlay DOM
			UI.overlayDOM = $('<div class="'+config.css['overlay']+'"></div>');
			UI.overlayDOM.hide();
			UI.gameFrame.append(UI.overlayDOM);
			overlaymasks_prepare( UI.overlayDOM );
			overlaymasks_apply( false );

			// Initialize the main visual agent for the tutorials
			UI.visualAgentDOM = $('<div class="visual-agent"></div>');
			UI.visualAgentDOM.hide();
			UI.overlayDOM.append(UI.visualAgentDOM);
			UI.visualAgent = R.instanceComponent( 'tutorial.agent', UI.visualAgentDOM );
			if (!UI.visualAgent)
				console.warn("UI: Could not initialize tutorial agent!");

			// Create a DOM Element for on-screen popups
			UI.popupDOM = $('<div class="fullscreen popups"></div>');
			UI.host.append(UI.popupDOM);

			// Initialize visual agent
			UI.visualAgent.onResize( UI.host.width(), UI.host.height() );

			// Bind visual agent events
			UI.visualAgent.on('focusVisualAid', function(target, duration, classes) {
				UI.focusVisualAid(target, duration, classes);
			});
			UI.visualAgent.on('blurVisualAid', function() {
				UI.blurVisualAid();
			});
			UI.visualAgent.on('completed', function() {
				UI.hideTutorial();
				if (tutorialCompleteListener)
					tutorialCompleteListener();
			});

			// Bind on window events
			$(window).resize(function() {

				// Update body classes
				$("body").removeClass("layout-compact layout-wide layout-vertical layout-mobile");
				var w = $(window).width(), h = $(window).height();
				if (w > h) {
					if (w <= 1024) {
						$("body").addClass("layout-compact");
					} else {
						$("body").addClass("layout-wide");
					}
				} else {
					$("body").addClass("layout-vertical");
				}

				// Get active screen
				var scr = UI.screens[UI.activeScreen];
				if (scr == undefined)
					return;

				// Resize it
				var w = scr.hostDOM.width(),
					h = scr.hostDOM.height();
				scr.onResize( w, h );

				// Resize a possible active popup
				if (popupWidget)
					popupWidget.onResize(w,h);

				// Also resize some helper elements
				UI.visualAgent.onResize( w, h );
				overlaymasks_apply_element(visualAidCurrent);

			});
			$(window).resize();

			// Always listen for ESC key, and hide the active UI Element
			$(window).keydown(function(e) {
				if (e.keyCode == 27) {

					// Hide tutorial
					if (tutorialActive) {
						e.preventDefault();
						e.stopPropagation();
						UI.hideTutorial();
					}

					// Hide overlay
					if (UI.activeOverlayComponent) {
						e.preventDefault();
						e.stopPropagation();
						Sequencer.reset();
						UI.hideOverlay();
					}

				}
			});

			window.ui = UI;

		}

		/**
		 * Enable CSS transitions on the specified element host
		 */
		UI.enablePageTransitions = function(elmHost) {
			elmHost.addClass("pt-perspective");
			elmHost.children().each(function(i,e) {
				$(e).data("originalClasses", $(e).attr("class"));
				if (i == 0) $(e).addClass("pt-current pt-page-ontop");
			});
		}

		/**
		 * CSS Transition helper between two DOM Elements
		 */
		UI.pageTransition = function(elmPrev, elmNext, transition, cb) {

			// Find the event name for the 'animation completed' event
			var animEndEventNames = {
					'webkitAnimation' : 'webkitAnimationEnd',
					'oAnimation' : 'oAnimationEnd',
					'msAnimation' : 'MSAnimationEnd',
					'animation' : 'animationend',
					'mozAnimation': 'mozAnimation'
				},
				animEndEventName = animEndEventNames[ with_vendor_suffix('animation') ];

			// Add page-transitions for moving out
			elmPrev.addClass( transition[0] );
			elmNext.addClass( transition[1] + " pt-page-ontop pt-current");

			// Local function to finalize animation
			var finalizeAnimation = function() {

				// Remove all the page transition classes from both pages
				elmNext.attr("class", elmNext.data("originalClasses") + " pt-current" );
				elmPrev.attr("class", elmPrev.data("originalClasses") );

				// Fire callback
				if (cb) cb();

			}

			// Callbacks as functions
			var prevOk = false, nextOk = false,
				fnPrevComplete = function() {
					if (prevOk) return; prevOk = true;
					if (++vc == 2) finalizeAnimation();
				},
				fnNextComplete = function() {
					if (nextOk) return; nextOk = true;
					if (++vc == 2) finalizeAnimation();
				};

			// Listen for CSS 'animation completed' events
			var vc = 0; 
			elmPrev.one( animEndEventName, fnPrevComplete );
			elmNext.one( animEndEventName, fnNextComplete );

			// Fire failover callbacks with timeouts
			//setTimeout( fnPrevComplete, 800 );
			//setTimeout( fnNextComplete, 800 );

		}

		/**
		 * Slide an overlay module as screen.
		 *
		 * @param {string} name - The name of the module to focus.
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_ready - The callback to fire when the screen has changed
		 * @param {boolean} blur_back - Blur background
		 *
		 */
		UI.showOverlay = function(name, v_transition, v_cb_ready, v_blur_back ) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Check for missing arguments
			var args = [v_transition, v_cb_ready, v_blur_back],
				transition = UI.Transitions.ZOOM_IN,
				cb_ready = null,
				blur_back = true;

			// Auto-arrange arguments
			for (var i=0; i<args.length; i++) {
				if (typeof(args[i]) == 'function') {
					cb_ready = args[i];
				} else if (typeof(args[i]) == 'object') {
					transition = args[i];
				} else if (typeof(args[i]) == 'boolean') {
					blur_back = args[i];
				}
			}

			// Prepare request
			var req = [name, transition, cb_ready, blur_back];

			// If we have an active element place request on queue
			if (UI.activeOverlayComponent) {
				console.log("Overlay: Queued", req);
				pendingOverlays.push(req);
				return;
			}

			// Check for a next pending overlay request
			var doCheckNextOverlay = function() {
				if (pendingOverlays.length == 0) return;
				var item = pendingOverlays.shift();

				// Show item
				console.log("Overlay: Processing", item);
				doShowOverlay(item[0], item[1], item[2], item[3]);
			}

			// Delay-execute showOverlay if required
			var doShowOverlay = function(name, transition, cb_ready, blur_back) {

				// Create host DOM for the component
				var comDOM = $('<div class="'+config.css['screen']+' screen-overlay"></div>');
				UI.hostOverlayWindow.append(comDOM);
				UI.hostOverlayWindow.css("visibility", "hidden");

				// Reset navbar
				UI.hostOverlayNavbar.empty().hide();

				// Add 'close' button
				var btnClose = $('<div class="navbtn-large navbtn-upper navbtn-close"><span class="glyphicon glyphicon-remove"></span></div>').appendTo(UI.hostOverlayNavbar);
				btnClose.click((function(e) {
					UI.hideOverlay(doCheckNextOverlay);
				}).bind(this));

				// Create screen instance
				var s = R.instanceComponent(name, comDOM);
				if (!s) {
					console.error("[Overlay] Unable to load overlay '"+name+"'");
					comDOM.remove();
					return;
				}

				// Perserve the original classes
				comDOM.data("originalClasses", comDOM.attr("class"));

				// Select active overlay
				UI.activeOverlayComponent = s;

				// Fire ready callback to initialize component
				if (cb_ready) cb_ready(s);

				// Blur background & show overlay
				if (blur_back) UI.host.addClass("fx-blur");
				UI.hostOverlay.show();

				// Transition between blank screen and current
				setTimeout(function() {
					s.onWillShow(function() {
						UI.hostOverlayNavbar.fadeIn();
						UI.hostOverlayWindow.css("visibility", "visible");
						UI.pageTransition( UI.blankOverlayScreen, comDOM, transition, function() {
							s.onShown();
						});
					});
				},100);

				// Listen for close events of this component
				s.onOnce('close', function() {
					// Hide overlay
					UI.hideOverlay(doCheckNextOverlay);
				});

			};

			// Block sequencer to prohibit interactions
			//Sequencer.block();

			// Hide previous and show this
			doShowOverlay( name, transition, cb_ready, blur_back );

		}


		/**
		 * Schedule the display of an overlay screen when possible
		 *
		 * @param {string} name - The name of the module to focus.
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_ready - The callback to fire when the screen has changed
		 * @param {boolean} blur_back - Blur background
		 *
		 */
		UI.scheduleOverlay = function(name, v_transition, v_cb_ready, v_blur_back) {

			// Check for missing arguments
			var args = [v_transition, v_cb_ready, v_blur_back],
				transition = UI.Transitions.ZOOM_IN,
				cb_ready = null,
				blur_back = true;

			// Auto-arrange arguments
			for (var i=0; i<args.length; i++) {
				if (typeof(args[i]) == 'function') {
					cb_ready = args[i];
				} else if (typeof(args[i]) == 'object') {
					transition = args[i];
				} else if (typeof(args[i]) == 'boolean') {
					blur_back = args[i];
				}
			}

			// Put on sqeuencer
			Sequencer.schedule((function( cb_next ) {
				this.showOverlay(name, transition, blur_back, function(component) {
					component.onOnce('close', function() { cb_next(); });
					component.onOnce('dispose', function() { cb_next(); });
					if (cb_ready) cb_ready(component);
				});
			}).bind(this));

		}

		/**
		 * Schedule a showFlash execution
		 *
		 * This function will fire a showFlash in a manner that won't block
		 * the current UI state. 
		 *
		 * @param {string} title - The name of the module to focus.
		 * @param {string} text - The text in the window.
		 * @param {string} icon - The icon message
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the message is dismissed
		 *
		 */
		UI.scheduleFlash = function(title, text, icon, transition, cb_close) {

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_close = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_IN;
			}

			// Put on sqeuencer
			Sequencer.schedule((function( cb_next ) {
				this.showFlash(title, text, icon, transition, function() {
					cb_next();
					if (cb_close) cb_close();
				});
			}).bind(this));

		}

		/**
		 * Show a flash message
		 *
		 * @param {string} title - The name of the module to focus.
		 * @param {string} text - The text in the window.
		 * @param {string} icon - The icon message
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the message is dismissed
		 *
		 */
		UI.showFlash = function(title, text, icon, transition, cb_close) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_close = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_IN;
			}

			// Return component instance
			return UI.showOverlay("overlay.flash", transition, function(com) {

				// Define message
				com.onMessageDefined( icon, title, text );

				// Listen for close events of this component
				var close_handler = function() {
					com.off('close', close_handler);
					// Fire callback if we have it
					if (cb_close) cb_close(com);
				};
				com.on('close', close_handler);

			});

		}

		/**
		 * Schedule a showFlashPrompt execution
		 *
		 * This function will fire a showFlashPrompt in a manner that won't block
		 * the current UI state. 
		 *
		 * @param {string} title - The name of the module to focus.
		 * @param {string} text - The text in the window.
		 * @param {string} options - The options to display, as an array of [{label:"", callback:function()}]
		 * @param {string} icon - The icon message
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the message is dismissed
		 *
		 */
		UI.scheduleFlashPrompt = function(title, text, options, icon, transition, cb_close) {

			// Put on sqeuencer
			Sequencer.schedule((function( cb_next ) {
				this.showFlashPrompt(title, text, options, icon, transition, function() {
					cb_next();
					if (cb_close) cb_close();
				});
			}).bind(this));

		}

		/**
		 * Show a flash prompt message
		 *
		 * @param {string} title - The name of the module to focus.
		 * @param {string} text - The text in the window.
		 * @param {string} options - The options to display, as an array of [{label:"", callback:function()}]
		 * @param {string} icon - The icon message
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the message is dismissed
		 *
		 */
		UI.showFlashPrompt = function(title, text, options, icon, transition, cb_close) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_close = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_IN;
			}

			// Return component instance
			return UI.showOverlay("overlay.flash", transition, function(com) {

				// Build body
				var bodyDOM = $('<div></div>').append( $('<div></div>').html(text) ),
					optDOM = $('<div></diV>').appendTo( bodyDOM );

				// Build options
				for (var i=0; i<options.length; i++) {
					var btnClass = options[i]['class'] || "btn-teal",
						btn = $('<button class="btn-shaded '+btnClass+'"></button>').text(options[i].label);
					btn.click(options[i].callback);
					btn.appendTo( optDOM );
				}

				// Define message
				com.onMessageDefined( icon, title, bodyDOM );

				// Listen for close events of this component
				var close_handler = function() {
					com.off('close', close_handler);
					// Fire callback if we have it
					if (cb_close) cb_close(com);
				};
				com.on('close', close_handler);

			});

		}

		/**
		 * Hide the overlay module from screen
		 */
		UI.hideOverlay = function( transition, cb_ready ) {

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_ready = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_OUT;
			}

			// If we are already hidden don't do anything
			if (!UI.activeOverlayComponent) {
				if (cb_ready) cb_ready();
				// Unblock sequencer
				//Sequencer.unblock();
				return;
			}

			// Unblur background
			UI.host.removeClass("fx-blur");

			// Transition current screen and blank
			UI.activeOverlayComponent.onWillHide(function() {

				// Fadeout nav bar
				UI.hostOverlayNavbar.fadeOut();

				// Transition
				UI.pageTransition( UI.activeOverlayComponent.hostDOM, UI.blankOverlayScreen, transition, function() {

					// Trigger hidden
					if (UI.activeOverlayComponent)
						UI.activeOverlayComponent.onHidden();
 
					// Reset overlay
					if (UI.activeOverlayComponent) {
						UI.activeOverlayComponent.hostDOM.remove();
						UI.activeOverlayComponent = null;
					}
					UI.hostOverlay.hide();

					// Fire callback
					if (cb_ready) setTimeout(cb_ready, 100);;

					// Unblock sequencer
					//Sequencer.unblock();

				});
			});



		}

		/**
		 * Hide all the first-time aids.
		 */
		UI.hideAllfirstTimeAids = function() {
			for (var i=0; i<UI.firstTimeAids.length; i++) {
				// Fade out & remove element
				UI.firstTimeAids[i].fadeOut((function(aid) {
					return function() { aid.remove(); }
				})(UI.firstTimeAids[i]));
			}

			// Remove non-visible aids
			for (var i=0; i<UI.firstTimeAidsPending.length; i++) {
				UI.firstTimeAidsPending[i].remove();
			}

			// Empty first time aids
			UI.firstTimeAids = [];
			UI.firstTimeAidsPending = [];
		}

		/**
		 * Check colliding first-time aids and display if they are good to be shown.
		 */
		UI.testCollidingFirstTimeAids = function(aid_id) {
			function check_collision(x1,y1,w1,h1,x2,y2,w2,h2) {
				return  ( ((x1 >= x2) && (x1 <= x2+w2)  && (y1 >= y2) && (y1 <= y2+h2)) || 
						  ((x1+w1 >= x2) && (x1+w1 <= x2+w2)  && (y1 >= y2) && (y1 <= y2+h2)) || 
						  ((x1 >= x2) && (x1 <= x2+w2)  && (y1+h1 >= y2) && (y1+h1 <= y2+h2)) || 
						  ((x1+w1 >= x2) && (x1+w1 <= x2+w2)  && (y1+h1 >= y2) && (y1+h1 <= y2+h2)) 
						);
			}

			for (var i=0; i<UI.firstTimeAidsPending.length; i++) {
				var aPending = UI.firstTimeAidsPending[i],
					collides = false;

				for (var j=0; j<UI.firstTimeAids.length; j++) {
					var aVisible = UI.firstTimeAids[j],
						// Get pending rect
						w1 = aPending.width(),
						h1 = aPending.height(),
						x1 = parseInt(aPending.css("left")),
						y1 = parseInt(aPending.css("top")),
						// Get visible rect
						w2 = aVisible.width(),
						h2 = aVisible.height(),
						x2 = parseInt(aVisible.css("left")),
						y2 = parseInt(aVisible.css("top"));

					// Check if we a collision
					if ( check_collision(x1,y1,w1,h1,x2,y2,w2,h2) || check_collision(x2,y2,w2,h2,x1,y1,w1,h1) ) {
						collides = true;
						break;
					}
				}

				// If we don't collide, show
				if (!collides) {

					// Show first time aid
					UI.firstTimeAids.push( aPending );
					setTimeout(function() {
						aPending.fadeIn();
					}, 1000 * Math.random());

					// Mark as shown
					var aid_id = aPending.prop("aid_id");
					UI.firstTimeAidsShown[aid_id] = true;

					// Remove first time aid and rewind
					UI.firstTimeAidsPending.splice(i,1);
					i = 0;

				}

			}
		}

		/**
		 * Show all first-time visual aids on the specified prefix
		 *
		 * @param {string} aid_prefix - The visual aid ID prefix.
		 * @param {function} checkFn - A function to use for checking to show or not an element
		 *
		 */
		UI.showAllFirstTimeAids = function(aid_prefix, checkFn) {

			// Default check function
			if (!checkFn) {
				var checkFn = function(meta, name) {
					var elm = $(meta['element']);
					// If ":visible" is not resolvable,
					// check for "display" and "visibility" css attribute
					if (elm.css("display") == "none") return false;
					if (elm.css("visibility") == "hidden") return false;
					if (parseInt(elm.css("opacity")) == 0) return false;
					// Then check for size
					if (elm.width() <= 0) return false;
					if (elm.height() <= 0) return false;
					// Otherwise we are good
					return true;
				};
			}

			// Iterate over visual aids
			for (var k in R.visualAids) {
				if (k.substr(0,aid_prefix.length) == aid_prefix) {

					// Check if we should show this aid
					var visualAid = R.getVisualAidMeta(k);
					if (checkFn(visualAid, k)) {
						UI.showFirstTimeAid(k);
					}
					
				}
			}

		}

		/**
		 * Show first-time pop-up on a visual aid.
		 *
		 * @param {string} aid_id - The visual aid to pop-up something upon.
		 *
		 */
		UI.showFirstTimeAid = function(aid_id) {
			var popup = $('<div class="newitem-popup"></div>'),
				visualAid = R.getVisualAidMeta(aid_id),
				userAids = User.getFirstTimeDetails();

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Callback to actually display the aid
			var __showAid = (function() {

				// Skip missing visual aid definitions
				if (!visualAid) return;
				if (!userAids[aid_id]) return;
				if (userAids[aid_id].shown) return;
				if ((visualAid.screen != "") && (visualAid.screen != UI.activeScreen)) return;

				// Show first-time aids only once
				if (UI.firstTimeAidsShown[aid_id]) return;

				// We got everything, prepare display
				var popup = $('<div class="newitem-popup"></div>'),
					popupBody = $('<div class="text"></div>').appendTo(popup);
				UI.host.append(popup);

				// Get element coordinates
				var elm = $(visualAid.element),
					pos = elm.offset(), 
					w = parseInt(elm.attr("width")) || elm.width(), 
					h = parseInt(elm.attr("height")) || elm.height(), 
					x = pos.left + w*2/3 + 5,
					y = pos.top + h/2 - popup.height();

				// Check flipping
				if (x + popup.width() > UI.host.width()) {
					x = pos.left + w/3 - popup.width() - 5;
					popup.addClass("flip-x");
				}
				if (y < 0) {
					y = pos.top + h/2;
					popup.addClass("flip-y");
				}

				// Update content
				popupBody.html( userAids[aid_id].text );
				popup.css({
					'left': x,
					'top': y
				});

				// Dismiss function
				var dismissed = false,
					fnDismiss = function() {
						
						// Dismiss once
						if (dismissed) return;
						dismissed = true;

						// Fadeout and remove aid
						popup.fadeOut(function() {
							popup.remove();
						});

						// Remove from firstTimeAids
						var i = UI.firstTimeAids.indexOf(popup);
						UI.firstTimeAids.splice(i,1);

						// Mark as seen
						User.markFirstTimeAsSeen( aid_id );

						// Update collided aids
						UI.testCollidingFirstTimeAids();

					};

				// Dismiss when clicking the popup
				popup.click(function() { fnDismiss(); });

				// Dismiss when clicking the target
				elm.click(function() { fnDismiss(); });

				// Fade-in with a random delay
				popup.hide();

				// Store on pending & show the ones not colliding
				popup.prop("aid_id", aid_id);
				UI.firstTimeAidsPending.push( popup );
				UI.testCollidingFirstTimeAids();

			}).bind(this);
			
			// Show visual aid after an adbitrary timeout
			setTimeout(__showAid, Math.random() * 100);

		}

		/**
		 * Fire this callback only once in the user session
		 *
		 * @param {string} once_id - The index to trigger only once.
		 * @param {function} callback - The function to call
		 *
		 */
		UI.showOnce = function(once_id, callback) {
			// If first time aid was not seen, fire callback
			if (!User.isFirstTimeSeen(once_id)) {
				// Fire callback & Register a second depth callback
				if (callback) callback(function() {
					// Mark as seen
					User.markFirstTimeAsSeen( once_id );
				});
			}
		}


		/**
		 * Display a pop-up widget on the specified point on screen.
		 * 
		 * This function has a multi-call signature.
		 *
		 * @example <caption>Simple pop-up for an element</caption>
		 * var targetElm = $('#hover-me');
		 * targetElm.mouseOver(function() {
		 *
	     *    // Prepare the DOM element first
	     *    var bodyDom = $('<div class="fancy-body">Some fancy text!</div>');
	     *    
	     *    // Pop-up the component 'popup.generic' next to
	     *    // the element with ID 'hover-me'
	     *    UI.showPopup( 'popup.generic', targetElm, bodyDOM );
	     *
		 * });
		 * @example <caption>Pop-up with body function</caption>
		 * var targetElm = $('#hover-me');
		 * targetElm.mouseOver(function() {
		 *
		 *    // Prepare the function to generate the body within
		 *    // the host DOM element specified.
		 *    var prepareBody = function( hostDOM ) {
		 *       hostDOM.append( $('<h1>Header</h1>') );
		 *       hostDOM.append( $('<p>This is a proceduraly generated body.</p>') );
		 *    }
		 *
	     *    // Pop-up the component 'popup.generic' next to
	     *    // the element with ID 'hover-me'. 
	     *    UI.showPopup( 'popup.generic', targetElm, bodyDOM );
	     *
		 * });
		 * @param {string} name - The name of the widget module.
		 * @param {int|DOMElement} x - The left position on screen
		 * @param {int} y - The top position on screen
		 * @param {function|DOMElement|String} body - the element to place in the body.
		 * @params {object} config - The widget configuration
		 *
		 */
		UI.showPopup = function(name, x, y, body, config) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// If x was a Dom element, update x/y accordingly
			if ((x instanceof $) || (x instanceof Element)) {

				// Shift parameters left
				config = body;
				body = y;

				// Get element coordinates
				var elm = $(x),
					pos = elm.offset(), 
					w = parseInt(elm.attr("width")) || elm.width(), 
					h = parseInt(elm.attr("height")) || elm.height();

				// Use center of the element as anchor
				x = pos.left + w/2;
				y = pos.top + h/2;

			}

			// If body is not a function, create one now
			var bodyFn = body;
			if ((body instanceof $) || (body instanceof Element)) {
				bodyFn = (function(bodyElm) {
					return function(hostDOM) {
						hostDOM.append($(bodyElm));
					};
				})(body);
			} else if (typeof(body) == 'string') {
				bodyFn = (function(bodyText) {
					return function(hostDOM) {
						hostDOM.append($('<span>'+bodyText+'</span>'));
					};
				})(body);
			}

			// Check if we already have an instance of this widget
			var widget = UI.popupWidgets[name];
			if (!widget) {
				widget = UI.popupWidgets[name] = R.instanceComponent( name, UI.popupDOM, Components.Popup );
				if (!widget) {
					console.error("UI: Unable to instantiate pop-up widget '"+name+"'");
					return;
				}
			}

			var __configAndShow = function() {

				// Adopt parent size
				widget.onResize( UI.host.width(), UI.host.height() );

				// Configure
				var cfg = config || {};
				cfg.left = x; cfg.top = y;
				widget.onPopupConfig(cfg, bodyFn);

				// Update anchor
				widget.onAnchorUpdate( x, y );

				// Show widget
				widget.show();
			}

			// Hide previous widget
			if (popupWidget) {
				popupWidget.hide( __configAndShow );
			} else {
				__configAndShow();
			}

			// Keep new reference
			popupWidget = widget;
			return widget;

		}

		/**
		 * Hide a pop-up previously shown with showPopup()
		 *
		 */
		UI.hidePopup = function(cb) {
			if (popupWidget)
				popupWidget.hide(cb);
			popupWidget = false;
		}

		/**
		 * Focus a particular visual aid.
		 *
		 * This function will add the class 'visualaid-focus' to the specified DOM element for the
		 * specified time or until the blurVisualAid function is called.
		 *
		 * @param {DOMElement|string} element - The element to focus or it's visual aid ID
		 * @param {int} duration - (Optional) The duraton (in seconds) to keep the element focused. Infinite if ommited or 0
		 * @param {string} classes - (Optional) Additional classes to add on the element
		 * @param {function} cb_completed - (Optional) A callback function to fire when completed
		 *
		 */
		UI.focusVisualAid = function( element, duration, classes, cb_completed ) {

			// Check for visual aid ID
			if (typeof(element) != 'string') {
				console.error("UI: Invalid visual aid ID!");
				return;
			}
			var aid = R.getVisualAidMeta( element );
			if (!aid) {
				console.error("UI: Missing visual aid '"+element+"'");
				return;
			}

			// Check for missing parameters
			if (typeof(classes) == 'function') {
				cb_completed = classes;
				classes = "";
			} else if (typeof(duration) == 'function') {
				cb_completed = duration;
				duration = 0;
				classes = "";
			}

			// Wrap on jquery
			var e = $(aid.element);

			// Reset previous entry
			if (visualAidCurrent) blurVisualAid();

			// Merge classes with the metadata from aid
			var classStr = (classes || "") + " " + (aid.classes || "");

			// Keep the metadata of the current visual aid
			visualAidMeta = aid;

			//
			// Asynchronous function for waiting until a possible
			// screen transition is completed.
			//
			var __continueVisualAidPresentation = function() {

				// Keep some state information
				visualAidWasVisible = (e.css("display") != "none");

				visualAidClasses = e.attr("class");
				if (!visualAidWasVisible) e.show();
				if (classStr) e.addClass(classStr)

				// Focus specified element
				visualAidCurrent = e.addClass("visualaid-focus");
				overlaymasks_apply_element(visualAidCurrent);

				// Set duration timeout if we have specified one
				if (duration) {
					visualAidTimer = setTimeout(function() { UI.blurVisualAid(); }, duration*1000);
				}
				
				// Fire callback
				if (cb_completed) cb_completed();

				// Call onShown
				if (typeof(aid.onShown) == 'function') {
					aid.onShown();
				}


			}

			//
			// Asynchronous function to check if we have a visual aid
			// pre-display callback.
			//
			var __continuePreDisplay = function() {
				if (typeof(aid.onWillShow) == 'function') {
					aid.onWillShow( __continueVisualAidPresentation );
				} else {
					__continueVisualAidPresentation();
				}
			}

			// Check if we should switch screen
			if (aid['screen'] && (UI.activeScreen != aid['screen'])) {
				UI.selectScreen( aid['screen'], UI.Transitions.ZOOM_OUT, __continuePreDisplay );
			} else {
				__continuePreDisplay();
			}


		}

		/**
		 * Unfocus a previously focused visual aid element.
		 */
		UI.blurVisualAid = function() {

			//
			// Asynchronous function to continue visual aid blurring
			//
			var __continueVisualAidBlur = function() {
				var e = $(visualAidCurrent);

				// Reset previous visual aid
				e.removeClass("visualaid-focus");

				// Reset attributes and configuration
				if (!visualAidWasVisible) e.hide();
				e.attr("class", visualAidClasses);

				// Reset overlay mask
				overlaymasks_apply_element(false);

				// Call onHidden
				if (typeof(visualAidMeta.onHidden) == 'function') {
					visualAidMeta.onHidden();
				}

			}

			// Reset previous entry
			clearTimeout(visualAidTimer);
			if (visualAidCurrent) {

				// Check if we have to call onWillHide
				if (typeof(visualAidMeta.onWillHide) == 'function') {
					visualAidMeta.onWillHide( __continueVisualAidBlur );
				} else {
					__continueVisualAidBlur();
				}

			}

			// Reset visualAidCurrent
			visualAidCurrent = false;

		}

		/**
		 * Schedule a help overlay when possible
		 *
		 * @param {array|string} image - The path to the image(s).
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the help screen is disposed
		 *
		 */
		UI.scheduleHelpOverlay = function( image, transition, cb_close ) {

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_close = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_IN;
			}

			// Put on sqeuencer
			Sequencer.schedule((function(cb_next) {
				this.showHelpOverlay(image, transition, function() {
					cb_next();
					if (cb_close) cb_close();
				});
			}).bind(this));

		}

		/**
		 * Show a full-screen one or multi-image help screen
		 *
		 * @param {array|string} image - The path to the image(s).
		 * @param {array} transition - The transition definition (defaults to UI.Transitions.ZOOM_IN)
		 * @param {function} cb_close - The callback to fire when the help screen is disposed
		 *
		 */
		UI.showHelpOverlay = function( image, transition, cb_close ) {

			// Check for missing arguments
			if (typeof(transition) == 'function') {
				cb_close = transition; transition = null;
			}
			if (!transition) {
				transition = UI.Transitions.ZOOM_IN;
			}

			// Return component instance
			return UI.showOverlay("overlay.help", transition, function(com) {

				// Define message
				com.onHelpDefined( [ image ] );

				// Register close event
				com.onOnce("close", function() {
					// Fire callback when completed
					if (cb_close) cb_close();
				});
				com.onOnce("dispose", function() {
					// Fire callback when disposed
					if (cb_close) cb_close();
				});

			});

		}

		/**
		 * Schedule a showTutorial execution
		 *
		 * This function will fire a showTutorial in a manner that won't block
		 * the current UI state. 
		 *
		 * @param {objects|string} sequence - The animation sequence to present or the ID of the tutorial to fetch from the database.
		 * @param {function} cb_completed - The callback to fire when the tutorial has started
		 */
		UI.scheduleTutorial = function( sequence, cb_completed ) {

			// Put on sqeuencer
			Sequencer.schedule((function(cb_next) {
				this.showTutorial(sequence, function() {
					cb_next();
					if (cb_completed) cb_completed();
				});
			}).bind(this));

		}

		/**
		 * Show an agent and start the specified tutorial sequence.
		 *
		 * @example <caption>Sample animation sequence</caption>
		 * UI.showTutorial({
		 *
		 *    // The video source to use for the tutorial
		 *    video : 'http://www.youtube.com/watch?v=ScMzIvxBSi4',
		 *
		 *    // The visual aids to focus on the paricular time locations
		 *    aids : [
		 *		{ at: 5,  duration: 1, focus: 'tune.tunables' },
		 *		{ at: 10, duration: 2, focus: 'tune.begin' },
		 *		{ at: 30, duration: 2, focus: 'tune.observables' },
		 *    ]
		 *
		 * });
		 * @param {objects|string} sequence - The animation sequence to present or the ID of the tutorial to fetch from the database.
		 * @param {function} cb_completed - The callback to fire when the tutorial has started
		 *
		 */
		UI.showTutorial = function( sequence, cb_completed ) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Store name of sequence
			tutorialSequence = sequence;

			// Keep the name of the sequence
			var seqName = sequence;

			// Asynchronouos callback to start the sequence
			var __startTutorial = function() {

				// Remove overlay from loading mode
				UI.overlayDOM.removeClass("loading");

				// Start visual agent animation
				UI.visualAgent.onStart();

				// Unblur a possible blur in the background
				// TODO: Unhack this
				UI.host.removeClass("fx-blur");

				// Handle completed event
				UI.visualAgent.onOnce("completed", function() {
					// Fire callback when completed
					if (cb_completed) cb_completed();
					// Unblock sequencer
					//Sequencer.unblock();
				});

			}

			// Asynchronous callback for preparing the elements
			var __prepareTutorial = function( sequence ) {

				// We have an active tutorial
				tutorialActive = true;

				// Keep the currently active screen
				tutorialOriginalScreen = UI.activeScreen;

				// Put overlay in loading mode
				UI.overlayDOM.addClass("loading");

				// Show agent
				UI.visualAgent.show(function() {
					var vc = 2;

					// Fade-in & initialize in the same time
					UI.visualAgentDOM.show(function() {
						UI.overlayDOM.fadeIn(500, function() { if (--vc==0) __startTutorial(); } );

						// Include the sequence ID in the object
						sequence['id'] = seqName;
						UI.visualAgent.onSequenceDefined( sequence, function() { if (--vc==0) __startTutorial(); } );

					});

				});

			}

			// Asynchronous function to stop previous tutorial and start this one
			var __stopPrevStartThis = function(sequence) {
				if (tutorialActive) {
					UI.hideTutorial(function(){ __prepareTutorial(sequence); });
				} else {
					__prepareTutorial(sequence);
				}
			}

			// Asynchronous function to download (if required) the video sequence
			var __downloadTutorial = function( name ) {
				var db = DB.openTable("tutorials");
				db.get(name, function(data) {
					if (!name) {
						console.error("UI: Could not find tutorial '"+name+"' in the database!");
					} else {
						__stopPrevStartThis(data);
					}
				});
			}
			
			// Block sequencer
			//Sequencer.block();

			// If we were given a string, load the tutorial from the database
			if (typeof(sequence) == 'string') {
				__downloadTutorial( sequence );
			} else {
				seqName = "anonymous";
				__stopPrevStartThis( sequence );
			}

		}

		/**
		 * Abort a tutorial previously started with showTutorial()
		 *
		 * @param {function} cb_completed - The callback to fire when the previous tutorial is aborted
		 *
		 */
		UI.hideTutorial = function( cb_ready ) {
			if (!tutorialActive) return;

			// Abort previous visual agent
			UI.visualAgent.onStop();

			// Blur previous visual aids
			UI.blurVisualAid();

			// Asynchronous function to wait until a screen transition
			// has completed
			var __continueHideTutorial = function() {

				// Hide visual agent
				UI.visualAgent.hide(function() {

					// Fade-out overlay DOM
					UI.overlayDOM.fadeOut(500, function() {
						if (cb_ready) cb_ready();
						UI.visualAgentDOM.hide();
						tutorialActive = false;
					});

				});

			}

			// Check if screen has changed since the beginning of the tutorial
			if (UI.activeScreen != tutorialOriginalScreen) {
				UI.selectScreen( tutorialOriginalScreen, UI.Transitions.FLIP_LEFT, __continueHideTutorial );
			} else {
				__continueHideTutorial();
			}

		}

		/**
		 * Activate the screen which was previously active before someone called selectScreen()
		 *
		 * @param {function} cb_ready - (Optional) The callback to fire when the screen has changed
		 *
		 */
		UI.selectPreviousScreen = function( cb_ready) {
			if (!UI.previousScreen) return;
			UI.selectScreen( UI.previousScreen, UI.Transitions.ZOOM_OUT, cb_ready )
		}

		/**
		 * Activate a screen module with the given name.
		 *
		 * @param {string} name - The name of the module to focus.
		 * @param {transition} array - (Optional) The transition to choose (from UI.Transitions)
		 * @param {function} cb_ready - (Optional) The callback to fire when the screen has changed
		 *
		 */
		UI.selectScreen = function(name, transition, cb_ready) {

			// Skip on lockdown
			if (UI.lockdown)
				return;

			// Check for wrong values
			if (UI.activeScreen == name)
				return;

			// Fire analytics
			var screenTime = Analytics.restartTimer("screen-time");
			if (screenTime > 0) {
				Analytics.fireEvent("ui.screen.time", {
					"id": UI.activeScreen,
					"time": screenTime
				});
			}
			Analytics.fireEvent("ui.screen.change", {
				"id": name
			});

			// Trigger server event
			User.triggerEvent("ui.screen.change", {
				"to": name,
				"from": UI.activeScreen,
				"time": screenTime
			});

			// Preserve previous screen ID
			UI.previousScreen = UI.activeScreen;

			// Switch screen
			var prevScreen = UI.activeScreen;
			UI.activeScreen = name;

			// Check for missing transition
			if (transition == undefined) {
				transition = UI.Transitions.ZOOM_IN;
			} else if (typeof(transition) == 'function') {
				cb_ready = transition;
				transition = UI.Transitions.ZOOM_IN;
			}

			// Hide all first-time aids previously shown
			UI.hideAllfirstTimeAids();

			// Get prev/next screen
			var ePrev = UI.screens[prevScreen],
				eNext = UI.screens[name];

			console.log(prevScreen," -> ",name);

			// Helper to display a waiting screen untless cancelled
			var loadingTimer = 0,
				loadingShown = false,
				showLoadingAfter = function(waitMs) {
					loadingTimer = setTimeout(function() {
						if (tutorialActive) return;
						loadingShown = true;
						UI.overlayDOM.addClass("loading");
						UI.overlayDOM.fadeIn(250);
					}, waitMs);
				},
				abortShowLoading = function() {
					clearTimeout(loadingTimer);
					if (loadingShown) {
						loadingShown = false;
						UI.overlayDOM.fadeOut(250, function() {
							UI.overlayDOM.removeClass("loading");
						});
					}
				}

			// Prepare previous hide
			var preparePrev = function(cb) {
				if (ePrev == undefined) { cb(); } else {

					// Inform old screen that will be hidden
					ePrev.onWillHide(cb);

				}
			}

			// Prepare next show
			var prepareNext = function(cb) {
				if (eNext == undefined) { cb(); } else {

					// Call onResize function just to make sure
					// the component will have the appropriate dimentions
					eNext.onResize( eNext.hostDOM.width(), eNext.hostDOM.height() );

					// If callback takes too much time to reply, show loading
					showLoadingAfter( 500 );

					// Inform new screen that will be shown
					eNext.onWillShow(cb);

				}
			}

			// Prepare both first
			preparePrev(function() { prepareNext(function() {

				// We got the OK From the screen to be shown, hide 
				// any possible loading screen that came-up while waiting
				// in onWillShow
				abortShowLoading();

				// Inform page transition
				if (UI.mininav)
					UI.mininav.onPageWillChange( prevScreen, name );

				// And cross-fade simultanously
				UI.pageTransition(ePrev.hostDOM, eNext.hostDOM, transition, function() {

					// Fire shown/hidden
					if (ePrev !== undefined) ePrev.onHidden();
					if (eNext !== undefined) eNext.onShown();

					// Change page
					if (UI.mininav)
						UI.mininav.onPageChanged( prevScreen, name );

					// Fire resize events on overlay masks & visualAgent
					// (This is a hack to update visual agent's position after 
					// a screen switch in the middle of the tutorial)
					var w = eNext.hostDOM.width(),
						h = eNext.hostDOM.height();
					UI.visualAgent.onResize( w, h );
					overlaymasks_apply_element(visualAidCurrent);

					// Fire ready callback
					if (cb_ready) cb_ready();

				});

			}); });

			// Return the screen we are focusing into
			return eNext;

		}

		/**
		 * Growl a message.
		 *
		 * @param {string} message - The message to growl
		 * @param {function} v_callback - The callback function to fire when the user clicks on the bubble.
		 * @param {int} v_timeout - The timeout (in milliseconds) before it disappears
		 * @param {string} v_growlClass - The class to append on the growl bubble
		 */
		UI.growl = function( message, v_callback, v_timeout, v_growlClass ) {

			// Dynamic parameter population
			var callback = null,
				timeout = 5000,
				growlClass = "",
				args = [v_callback, v_timeout, v_growlClass];

			for (var i=0; i<args.length; i++) {
				if (typeof(args[i]) == "number") {
					timeout = args[i];
				} else if (typeof(args[i]) == "string") {
					growlClass = args[i];
				} else if (typeof(args[i]) == "function") {
					callback = args[i];
				}
			}

			// Realign growl stack
			var _reaignGrowlStack = function() {
				var top = 10;
				for (var i=0; i<UI.growlStack.length; i++) {
					UI.growlStack[i].css({
						'top': top
					});
					top += 86;
				}
			};

			// Create a growl
			var growl = $('<div class="growl '+ growlClass +'">' + message + '</div>').appendTo($("body"));


			// Dispose growl
			var _disposeGrowl = function() {
				// Dismiss the given growl item
				for (var i=0; i<UI.growlStack.length; i++) {
					if (UI.growlStack[i].is(growl)) {
						UI.growlStack.splice(i,1);
						break;
					}
				}
				// Fade out
				growl.fadeOut(function() {
					growl.remove();
				});
				// Realign
				_reaignGrowlStack();				
			}

			// Register disposal
			growl.click(function() {
				// Fire callback
				if (callback) callback();
				// Dispose
				_disposeGrowl();
			});

			// Fire timeout
			if (timeout) {
				setTimeout(function() {
					_disposeGrowl();
				}, timeout);
			}

			// Put it on stack
			UI.growlStack.push(growl);

			// Realign
			_reaignGrowlStack();

		}

		/**
		 * Schedule a displaySequence execution
		 *
		 * This function will fire a displaySequence in a manner that won't block
		 * the current UI state. 
		 *
		 * @param {array} sequences - The configuration of the sequences
		 * @param {function} callback - The callback function to be fired when the sequence is completed
		 */
		UI.scheduleSequence = function( sequences, callback ) {

			// Put on sqeuencer
			Sequencer.schedule((function( cb_next ) {
				this.displaySequence(sequences, function() {
					cb_next();
					if (callback) callback();
				});
			}).bind(this));

		}

		/**
		 * Display a configurable sequence of screens
		 *
		 * Each screen should trigger the event 'sequence' when it's completed,
		 * passing an argument that can be translated by this function into a usable
		 * result.
		 *
		 * @param {array} sequences - The configuration of the sequences
		 * @param {function} callback - The callback function to be fired when the sequence is completed
		 */
		UI.displaySequence = function( sequences, callback ) {

			// Config contains the following sequence information:
			// [
			//   {
			//      'screen': 'screen_name',
			//      'config': { },
			//      'next' : { // Routing information when we receive the 'sequence' event
			//         'key': <index>, // Go to the given sequence
			//              : 0        // Exit sequence
			//      }
			// ]

			// Prepare variables
			var seq_index = 0;

			// Process the next sequencing task
			var handeSequence = function() {
				// Pick transition
				var sequence = sequences[seq_index],
					transition = sequence['transition'] || UI.Transitions.ZOOM_IN;

				// First, show the interface
				var scr = UI.screens[sequence['screen']];

				// Delay-called after (possible) configuration
				var sequenceContinueFn = function() {

					// After we are configured, select screen
					UI.selectScreen(sequence['screen'], transition, function() {

						// The interface is visible, wait for events
						scr.off('sequence.next');
						scr.on('sequence.next', function(key) {

							// Lookup status on the sequence table
							var routing_table = sequence['next'] || {};
							if ((routing_table[key] == undefined) || (routing_table[key] < 0)) {
								// We are completed
								if (callback) callback();
								// Unblock sequencer
								//Sequencer.unblock();								
							} else {
								// Apply routing
								var index = routing_table[key];

								// Check validity of next index
								if ((index >= 0) && (index < sequences.length)) {
									seq_index = index;
									handeSequence();
								} else {
									// Otherwise trigger error
									UI.logError("Invalid index specified on screen sequence!");
								}
							}

						});

						// Handle forceful sequence exit
						scr.off('sequence.exit');
						scr.on('sequence.exit', function(key) {
							if (callback) callback();
							// Unblock sequencer
							//Sequencer.unblock();								
						});

					});

				};

				// Check if have to apply configuration on the screne
				if ((sequence['config'] != undefined) && (scr.onSequenceConfig !== undefined))
					scr.onSequenceConfig( sequence['config'], sequenceContinueFn );
				else
					sequenceContinueFn();

			};

			// Block sequencer to prohibit interactions
			//Sequencer.block();

			// Start with the first sequence
			handeSequence();

		}

		// Return UI
		return UI;

	}

);
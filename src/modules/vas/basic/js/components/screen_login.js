
define(

	// Requirements
	["require", "vas/config", "vas/core/registry", "vas/core/base/components", "vas/core/ui" ],

	/**
	 * Basic version of the home screen
	 *
	 * @exports vas-basic/components/running_screen
	 */
	function(require, config,R,C,UI) {

		/**
		 * Find base directory for images
		 */
		var img_dir = require.toUrl(".").split("/").slice(0,-2).join("/") + "/img";

		/**
		 * @class
		 * @classdesc The basic home screen
		 */
		var LoginScreen = function( hostDOM ) {
			C.LoginScreen.call(this, hostDOM);

			// Prepare host
			hostDOM.addClass("login");

			// Create a slpash backdrop
			this.backdropDOM = $('<div class="'+config.css['backdrop']+'"></div>');
			hostDOM.append(this.backdropDOM);
			this.backdrop = R.instanceComponent("backdrop.login", this.backdropDOM);

			// Create foreground DOM
			this.foregroundDOM = $('<div class="'+config.css['foreground']+'"></div>');
			hostDOM.append(this.foregroundDOM);

			// Create the element which is hosting the entire screen
			this.elmHost = $('<div class="host"></div>');
			this.foregroundDOM.append( this.elmHost );

			// Prepare logo header
			this.elmHeader = $('<div class="header"></div>');
			this.elmHost.append( this.elmHeader );
			this.elmHeader.append( $('<div class="logo-icon"></div>') );
			this.elmHeader.append( $('<div class="logo-text"><h1><span>Virtual</span> Atom Smasher</h1><p>Learn particle physics & help scientists at CERN</p></div>') );

			// Prepare main body
			this.elmBody = $('<div class="body"></div>');
			this.elmHost.append( this.elmBody );
			this.elmLeftBody = $('<div class="left"></div>');
			this.elmBody.append( this.elmLeftBody );
			this.elmRightBody = $('<div class="right"></div>');
			this.elmBody.append( this.elmRightBody );

			// Prepare left body
			this.elmLeftBody.append($("<h1>Welcome visitor!</h1>"));
			this.elmLeftBody.append($("<p>Virtual Atom Smasher is a revolutionary educational game that brings you along with the theoretical physicists inside CERN!</p>"));
			this.elmLeftBody.append($("<p>Playing this game you are not only learning about particle physics, but you are actively helping scientists with their research!</p>"));
			var btnTour = $('<a href="do:tour"><img src="'+img_dir+'/take-tour.png" /></a>')
			btnTour.click(function(e) {
				e.preventDefault();
				e.stopPropagation();
				UI.showTutorial("pub.welcome");
			});
			this.elmLeftBody.append( btnTour );

			// Prepare right body
			this.elmRightBody.append($("<h1>Welcome fellow scientist!</h1>"));
			var fEmail = this.fEmail = $('<input  id="login-email" type="text" />'),
				fPassword = this.fPassword = $('<input id="login-password" type="password" />');

			var table = $('<table></table>'),
				tr1 = $('<tr></tr'), tr2 = $('<tr></tr>'),
				td11 = $('<th><label for="login-email">E-Mail:</label></th>'),
				td21 = $('<th><label for="login-password">Password:</label></th>'),
				td12 = $('<td></td>'), td22 = $('<td></td>');

			td12.append( fEmail ); td22.append( fPassword );
			tr1.append(td11).append(td12);
			tr2.append(td21).append(td22);
			table.append(tr1).append(tr2);
			this.elmRightBody.append(table);

			var loginBtnHost = $('<div class="login"></div>');
			this.elmRightBody.append( loginBtnHost );

			// Prepare register button
			var btnRegister = $('<button class="btn-shaded btn-teal">Create an account</button>');
			loginBtnHost.append(btnRegister);
			btnRegister.click((function(e) {
				e.preventDefault();
				e.stopPropagation();
				this.trigger("register", fEmail.val(), fPassword.val() );
			}).bind(this));

			// Prepare log-in button
			var btnLogin = $('<button class="btn-shaded btn-blue">Login</button>');
			loginBtnHost.append(btnLogin);
			btnLogin.click((function(e) {

				// Prevent default
				e.preventDefault();
				e.stopPropagation();

				// Save e-mail
				localStorage.setItem("vas-login", fEmail.val());

				// Trigger login
				this.trigger("login", fEmail.val(), fPassword.val() );

			}).bind(this));

			// Handle log-in with enter
			fEmail.keypress(function(e) {
				if (e.keyCode == 13)
					btnLogin.click();
			});
			fPassword.keypress(function(e) {
				if (e.keyCode == 13)
					btnLogin.click();
			});

		}
		LoginScreen.prototype = Object.create( C.LoginScreen.prototype );

		/**
		 * Reset/populate form on show
		 */
		LoginScreen.prototype.onWillShow = function(ready) {

			// Pre-populate log-in field
			this.fEmail.val( localStorage.getItem("vas-login") );

			ready();
		}

		/**
		 * Focus username or password upon show
		 */
		LoginScreen.prototype.onShown = function() {

			// If we have username focus on password
			if (!this.fEmail.val()) {
				this.fEmail.focus();
			} else {
				this.fPassword.focus();
			}

		}

		// Register login screen
		R.registerComponent( "screen.login", LoginScreen, 1 );

	}

);

define(

		// Core dependencies
		["core/util/event_base", "sha1", "vas/config",
 		
 		// Interfaces of socket APIs
 		"vas/core/api/db", "vas/core/api/account", "vas/core/api/chatroom", "vas/core/api/course",
 		"vas/core/api/labsocket", "vas/core/api/labtrain" ], 

	/**
	 * The APISocket class provides all the required functionality to interact in real time
	 * with other APISocket members.
	 *
	 * @exports vas-core/apisocket
	 */
	function( EventBase, SHA1, Config,
			  IDb, IAccount, IChatroom, ICourse, ILabsocket, ILabtrain ) {

		/**
		 * Bitmask filter
		 */
		var API_MASK_DOMAIN = 0xffff0000,
			API_MASK_ID     = 0x0000ffff;

		/**
		 * The APISocket class provides all the required functionality to interact in real time
		 * with other APISocket members.
		 *
		 * @class
		 * @classdesc The APISocket class
		 * @augments module:core/util/event_base~EventBase
		 */
		var APISocket = function( hostDOM ) {

			// Initialize superclass
			EventBase.call(this);

			// Initialize properties
			this.connected = false;
			this.loginCallback = null;
			this.keepaliveTimer = 0;

			// Dynamic API interfaces
			this.apiInterfaces = {};
			this.apiInstances = [];

			// Register interfaces
			this.registerInterface( "db" 		, 0x00, IDb			,true  );
			this.registerInterface( "account" 	, 0x00, IAccount 	,true  );
			this.registerInterface( "chatroom"	, 0x00, IChatroom 	,false );
			this.registerInterface( "course" 	, 0x00, ICourse 	,false );
			this.registerInterface( "labsocket" , 0x01, ILabsocket	,false );
			this.registerInterface( "labtrain"  , 0x02, ILabtrain 	,false );

		}

		// Subclass from EventBase
		APISocket.prototype = Object.create( EventBase.prototype );

		/**
		 * Register a dynamic API interface
		 */
		APISocket.prototype.registerInterface = function( domain, bitDomain, Interface, reuse ) {

			// Set default value to reuse
			var reuseInstance = reuse;
			if (reuseInstance === undefined) reuseInstance = true;

			// Store instance under the specified domain
			this.apiInterfaces[domain] = Interface;

			// Register open function
			this['open' + domain[0].toUpperCase() + domain.substr(1) ] = (function() {

				// Close or reuse previous instance
				if (this.apiInstances[domain] !== undefined ) {

					// Check if we should reuse single instance
					if (reuseInstance) {
						return this.apiInstances[domain];
					}

					// Otherwise cleanup
					try {
						this.apiInstances[domain].__handleClose();
					} catch(e) {
						console.error("Error closing interface '",domain,"':",e);
					};
					delete this.apiInstances[domain];
					
				}

				// Prepare arguments by the ones given to openXXXX function
				var args = [this];
				for (i = 0; i < arguments.length; i++) {
					args.push( arguments[i] );
				}

				// Prepare instance proxy
				function I() {
					Interface.apply(this, args);
				}
				I.prototype = Interface.prototype;

				// Update domain and bitmask
				I.prototype.domain = domain;
				I.prototype.bitmask = bitDomain << 16;

				// Create instance
				var inst = new I();
				this.apiInstances[domain] = inst;

				// Return instance
				return inst;

			}).bind(this);

		}

		/**
		 * Connect to the APISocket server
		 */
		APISocket.prototype.connect = function(url) {
			try {

				// Create new websocket instance
				this.socket = new WebSocket(url);

				// -----------------------------------------------------------
				// Bind a listener to the incoming WebSocket Data
				// This listener supports both binary and text data receiving
				// 
				this.socket.onmessage = (function(event) {

					// Check if the incoming data is a binary frame
					if (event.data instanceof Blob) {
						// If we have a binary response, read input

						// Prepare FileReader to read Blob into a ArrayBuffer
						var blobReader = new FileReader(), self = this;
						blobReader.onload = function() {

							// Cast result to UInt32 array in order to extract
							// the frame ID
							var buf = new Uint32Array( this.result, 0, 1 ),
								frameID = buf[0];

							// Handle data frame
							self.handleDataFrame( frameID, this.result );

						};

						// Send Blob to the FileReader
						blobReader.readAsArrayBuffer(event.data);

					} else {

						// Parse JSON frame
						var data = JSON.parse(event.data);
						// Extract parameters
						var param = data['param'] || { };

						// Handle action
						this.handleActionFrame( data['action'], param );

					}

				}).bind(this);

				// -----------------------------------------------------------
				// Upon connection, we will need to send handshake and request 
				// the initial configuration for the histograms.
				// 
				this.socket.onopen = (function() {

					this.connected = true;
					this.trigger('ready');
					this.keepaliveTimer = setInterval(this.sendKeepalive.bind(this), 10000);

				}).bind(this);

				// -----------------------------------------------------------
				// If for any reason the socket is closed, retry connection
				//
				this.socket.onclose = (function(e) {
					this.connected = false;
					this.trigger('critical', 'Disconnected from the APISocket socket! (#'+e.code+')');
					clearInterval(this.keepaliveTimer);

					// Cleanup dynamic API instances
					for (k in this.apiInstances) {
						try {
							this.apiInstances[k].__handleClose();
						} catch(e) {
							console.error("Error closing interface '",k,"':",e);
						};
						this.apiInstances.splice(0);
					}

				}).bind(this);

				// -----------------------------------------------------------
				// Handle socket errors
				//
				this.socket.onerror = (function(ws, error) {
					this.connected = false;
					this.trigger('critical', 'Error while trying to connect to the API socket!');
					clearInterval(this.keepaliveTimer);
				}).bind(this);

			}
			catch (e) {
				this.connected = false;
				this.trigger('critical', 'Could not connect to the API socket! ' + String(e));
			}
		}

		/**
		 * Send an I/O ping frame
		 */
		APISocket.prototype.sendKeepalive = function() {
			this.sendAction("io.keepalive");
		}

		/**
		 * Send an action frame
		 */
		APISocket.prototype.sendAction = function( action, parameters ) {

			// Prepare data to send
			var param = parameters || { };

			// Send command
			if (!this.connected) return;
			this.socket.send(JSON.stringify({
				"action": action,
				"param": param
			}));

		}

		/**
		 * Send blob
		 */
		APISocket.prototype.sendBlob = function( frameID, payload ) {
			// Prepare data to send
			var param = parameters || { };
			// Send command
			if (!this.connected) return;
		}

		/**
		 * Handle data frame
		 */
		APISocket.prototype.handleDataFrame = function( frameID, byteArray ) {

			// Check which bitmask fits the arrived frame ID
			for (k in this.apiInstances) {

				// Get bitmask
				var mask = this.apiInstances[k].bitmask;
				if (!mask) continue;

				// Check if bitmask matches
				if ((frameID & API_MASK_DOMAIN) == mask) {
					this.apiInstances[k].__handleData( frameID & API_MASK_ID, byteArray );
				}

			}

		}

		/**
		 * Handle an action frame that arrives from the APISocket channel
		 */
		APISocket.prototype.handleActionFrame = function( action, parameters ) {

			// Lookup the domain on the domain
			var parts = action.split(".", 2),
				domain = parts[0],
				domainAction = action.substr(domain.length+1);

			// Handle some priority messages
			if (action == "ui.event") {
				// A server-triggered event
				this.trigger('event', parameters);
			} else if (action == "ui.command") {
				// A server-triggered command
				this.trigger('command', parameters);
			}

			// Check if we have a domain handler
			else if (this.apiInstances[domain]) {
				// Handle action on the given API instance
				this.apiInstances[domain].__handleAction( domainAction, parameters );
			}

			// Handle login events
			else if (action == "user.login.success") {
				if (this.loginCallback)
					this.loginCallback(true, parameters);
			}

			// Handle login events
			else if (action == "user.login.failure") {
				if (this.loginCallback) 
					this.loginCallback(false, parameters);
			}

			// Handle errors
			else if (action == "error") {
				this.trigger('error', parameters['message'], parameters['code'], parameters['domain']);
			}

		}

		///////////////////////////////////////////////////////////////
		//                    PUBLIC API INTERFACE                   //
		///////////////////////////////////////////////////////////////

		/**
		 * Try to log user-in
		 */
		APISocket.prototype.login = function( user, password, callback ) {

			// Try to log user in
			this.sendAction('user.login', {
				'user': user,
				'password': password
			});

			// Register the callback to fire on 'user.login.callback'
			if (callback) {
				this.loginCallback = function(success, parameters) {
					if (success) {
						callback(parameters['profile']);
					} else {
						callback(null, parameters['message']);
					}
				};
			}
			
		}

		/**
		 * Return a APISocket singleton
		 */
		var APISocket = new APISocket();
		return APISocket;

	}
	
);
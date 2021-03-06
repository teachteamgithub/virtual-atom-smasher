/**
 * [core/api/chatroom] - Chatroom API
 */
define(["vas/core/api/interface", "vas/config"], 

	function(APIInterface, Config) {

		/**
		 * APISocket Chatroom
		 *
		 * @augments module:vas-core/api/interface~APIInterface
		 * @exports vas-core/api/course
		 */
		var APICourseroom = function(apiSocket, course) {

			// Initialize superclass
			APIInterface.call(this, apiSocket);

			// Setup properties
			this.course = course;
			this.active = true;

			// Join course
			this.sendAction('enter', { 'course': course } );

		}

		// Subclass from APIInterface
		APICourseroom.prototype = Object.create( APIInterface.prototype );

		/**
		 * Handle course event
		 */
		APICourseroom.prototype.handleAction = function(action, data) {
			console.log("Course action:",action,data);
			if (action == "info") {
				this.trigger('info', data);

			} else if (action == "sync") {
				this.trigger('sync', data);
				
			}
		}

		/**
		 * Close and lock class
		 */
		APICourseroom.prototype.handleClose = function() {
			// Leave course
			this.sendAction('leave');
		}

		// Return the Chatroom class
		return APICourseroom;

	}

);
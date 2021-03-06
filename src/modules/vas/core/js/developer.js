
/**
 * [core/developer] - Developer additions for the user interface
 */
define(["vas/config", "vas/core/ui", "vas/core/registry"], 

	function(config, UI, R) {

		/**
		 * Global scope where system-wide resources can be placed.
		 *
		 * @exports vas-core/developer
		 */
		var Developer = { };

		/**
		 * Edit a paricular component name
		 */
		Developer.editComponent = function(name) {

			// Show the in-place IDE
			UI.showOverlay("screen.ipide", (function(ipide) {

				// Reflection analysis
				var inst = R.components[name];

				// Produce the code
				var code = "";
				for (k in inst.prototype) {
					var ref = inst.prototype[k],
						hint = "[Missing documentation]",
						payload = "";

					if (typeof(ref) == "function") {
						payload = ref.toString();
						code += '/**\n * '+hint+'\n */\n' + "Component.prototype."+k+" = " + payload +";\n\n";
					}

				}

				// Define component
				ipide.onCodeLoaded(name, code);
				ipide.off("commit");
				ipide.on("commit", function(code) {
					// Re-apply code back in the structures
					var code = 'require(["vas/core/registry"], function(R){var Component = R.components["'+name+'"];' + code + '});'
					try {
						eval(code);
					} catch(e) {
						UI.logError(e.toString());
					}
					UI.hideOverlay();
				});
				ipide.off("cancel");
				ipide.on("cancel", function(code) {
					UI.hideOverlay();
				});

			}).bind(this));

		}

		// Return the developer scope
		return Developer;
	}

);
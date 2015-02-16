
define(["three"], 

	/**
	 * Extend THREE namespace with ShaderPass
	 */
	function(THREE) {

		/**
		 * @author alteredq / http://alteredqualia.com/
		 *
		 * Blend two textures
		 */

		THREE.BlendShader = {

			uniforms: {

				"tDiffuse":  { type: "t", value: null },
				"tDiffuse2": { type: "t", value: null },
				"mixRatio":  { type: "f", value: 0.5 },
				"opacity":   { type: "f", value: 1.0 }

			},

			vertexShader: [

				"varying vec2 vUv;",

				"void main() {",

					"vUv = uv;",
					"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

				"}"

			].join("\n"),

			fragmentShader: [

				"uniform float opacity;",
				"uniform float mixRatio;",

				"uniform sampler2D tDiffuse;",
				"uniform sampler2D tDiffuse2;",

				"varying vec2 vUv;",

				"void main() {",

					"vec4 texel1 = texture2D( tDiffuse, vUv );",
					"vec4 texel2 = texture2D( tDiffuse2, vUv );",
					"gl_FragColor = texel1 * texel2;",

				"}"

			].join("\n")

		};

	}
);

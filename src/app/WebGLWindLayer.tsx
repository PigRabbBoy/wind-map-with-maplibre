"use client";

import {
  Layer,
  LayerProps,
  UpdateParameters,
  LayerContext,
} from "@deck.gl/core";
import { Buffer, Texture } from "@luma.gl/core";

// Define shader code as string constants instead of importing from files
const drawVertShader = `precision mediump float;

attribute float a_index;

uniform sampler2D u_particles;
uniform float u_particles_res;

varying vec2 v_particle_pos;

void main() {
    vec4 color = texture2D(u_particles, vec2(
        fract(a_index / u_particles_res),
        floor(a_index / u_particles_res) / u_particles_res));

    // decode current particle position from the pixel's RGBA value
    v_particle_pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a);

    gl_PointSize = 1.0;
    gl_Position = vec4(2.0 * v_particle_pos.x - 1.0, 1.0 - 2.0 * v_particle_pos.y, 0, 1);
}`;

const drawFragShader = `precision mediump float;

uniform sampler2D u_wind;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform sampler2D u_color_ramp;

varying vec2 v_particle_pos;

void main() {
    vec2 velocity = mix(u_wind_min, u_wind_max, texture2D(u_wind, v_particle_pos).rg);
    float speed_t = length(velocity) / length(u_wind_max);

    // color ramp is encoded in a 16x16 texture
    vec2 ramp_pos = vec2(
        fract(16.0 * speed_t),
        floor(16.0 * speed_t) / 16.0);

    gl_FragColor = texture2D(u_color_ramp, ramp_pos);
}`;

const quadVertShader = `precision mediump float;

attribute vec2 a_pos;

varying vec2 v_tex_pos;

void main() {
    v_tex_pos = a_pos;
    gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
}`;

const screenFragShader = `precision mediump float;

uniform sampler2D u_screen;
uniform float u_opacity;

varying vec2 v_tex_pos;

void main() {
    vec4 color = texture2D(u_screen, 1.0 - v_tex_pos);
    // a hack to guarantee opacity fade out even with a value close to 1.0
    gl_FragColor = vec4(floor(255.0 * color * u_opacity) / 255.0);
}`;

const updateFragShader = `precision highp float;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform vec2 u_wind_res;
uniform vec2 u_wind_min;
uniform vec2 u_wind_max;
uniform float u_rand_seed;
uniform float u_speed_factor;
uniform float u_drop_rate;
uniform float u_drop_rate_bump;

varying vec2 v_tex_pos;

// pseudo-random generator
const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);
float rand(const vec2 co) {
    float t = dot(rand_constants.xy, co);
    return fract(sin(t) * (rand_constants.z + t));
}

// wind speed lookup; use manual bilinear filtering based on 4 adjacent pixels for smooth interpolation
vec2 lookup_wind(const vec2 uv) {
    // return texture2D(u_wind, uv).rg; // lower-res hardware filtering
    vec2 px = 1.0 / u_wind_res;
    vec2 vc = (floor(uv * u_wind_res)) * px;
    vec2 f = fract(uv * u_wind_res);
    vec2 tl = texture2D(u_wind, vc).rg;
    vec2 tr = texture2D(u_wind, vc + vec2(px.x, 0)).rg;
    vec2 bl = texture2D(u_wind, vc + vec2(0, px.y)).rg;
    vec2 br = texture2D(u_wind, vc + px).rg;
    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

void main() {
    vec4 color = texture2D(u_particles, v_tex_pos);
    vec2 pos = vec2(
        color.r / 255.0 + color.b,
        color.g / 255.0 + color.a); // decode particle position from pixel RGBA

    vec2 velocity = mix(u_wind_min, u_wind_max, lookup_wind(pos));
    float speed_t = length(velocity) / length(u_wind_max);

    // take EPSG:4236 distortion into account for calculating where the particle moved
    float distortion = cos(radians(pos.y * 180.0 - 90.0));
    vec2 offset = vec2(velocity.x / distortion, -velocity.y) * 0.0001 * u_speed_factor;

    // update particle position, wrapping around the date line
    pos = fract(1.0 + pos + offset);

    // a random seed to use for the particle drop
    vec2 seed = (pos + v_tex_pos) * u_rand_seed;

    // drop rate is a chance a particle will restart at random position, to avoid degeneration
    float drop_rate = u_drop_rate + speed_t * u_drop_rate_bump;
    float drop = step(1.0 - drop_rate, rand(seed));

    vec2 random_pos = vec2(
        rand(seed + 1.3),
        rand(seed + 2.1));
    pos = mix(pos, random_pos, drop);

    // encode the new particle position back into RGBA
    gl_FragColor = vec4(
        fract(pos * 255.0),
        floor(pos * 255.0) / 255.0);
}`;

// Default color ramp for particles (copied from old implementation)
const defaultRampColors = {
  0.0: "#3288bd",
  0.1: "#66c2a5",
  0.2: "#abdda4",
  0.3: "#e6f598",
  0.4: "#fee08b",
  0.5: "#fdae61",
  0.6: "#f46d43",
  1.0: "#d53e4f",
};

// Data structure for wind data
export type WindDataType = {
  width: number;
  height: number;
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  image: Uint8Array;
};

// Props for WebGLWindLayer
type WebGLWindLayerProps = {
  id: string;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  fadeOpacity?: number;
  speedFactor?: number;
  dropRate?: number;
  dropRateBump?: number;
  colorRamp?: Record<string, string>;
  numParticles?: number;
  animate?: boolean;
  windData?: WindDataType;
} & LayerProps;

/**
 * WebGLWindLayer - A custom deck.gl layer that renders wind particles
 * using direct WebGL/GLSL implementation via luma.gl
 */
export default class WebGLWindLayer extends Layer<WebGLWindLayerProps> {
  // Define defaultProps
  static defaultProps = {
    fadeOpacity: 0.996,
    speedFactor: 0.25,
    dropRate: 0.003,
    dropRateBump: 0.01,
    colorRamp: defaultRampColors,
    numParticles: 5000,
    animate: true,
  };

  // Declare class properties
  drawProgram: any;
  screenProgram: any;
  updateProgram: any;
  quadBuffer: Buffer | null = null;
  framebuffer: WebGLFramebuffer | null = null;
  colorRampTexture: Texture | null = null;
  backgroundTexture: Texture | null = null;
  screenTexture: Texture | null = null;
  particleStateTexture0: Texture | null = null;
  particleStateTexture1: Texture | null = null;
  particleIndexBuffer: Buffer | null = null;
  particleStateResolution: number = 0;
  _numParticles: number = 0;
  windTexture: Texture | null = null;
  windData: WindDataType | null = null;
  animationFrame: number | null = null;

  initializeState(_context: LayerContext) {
    const gl = this.context.gl;

    // Initialize programs with shader strings (not imported files)
    this.drawProgram = this.createProgram(gl, drawVertShader, drawFragShader);
    this.screenProgram = this.createProgram(
      gl,
      quadVertShader,
      screenFragShader
    );
    this.updateProgram = this.createProgram(
      gl,
      quadVertShader,
      updateFragShader
    );

    // Initialize buffers - Fix Buffer initialization
    const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    this.framebuffer = gl.createFramebuffer();

    // Initialize textures
    this.setColorRamp(this.props.colorRamp || defaultRampColors);

    // Set number of particles
    if (this.props.numParticles) {
      this.setNumParticles(this.props.numParticles);
    }

    // Start animation if enabled
    if (this.props.animate) {
      this.startAnimation();
    }
  }

  finalizeState() {
    this.stopAnimation();

    // Clean up resources
    if (this.quadBuffer) this.quadBuffer.delete();
    if (this.colorRampTexture) this.colorRampTexture.delete();
    if (this.backgroundTexture) this.backgroundTexture.delete();
    if (this.screenTexture) this.screenTexture.delete();
    if (this.particleStateTexture0) this.particleStateTexture0.delete();
    if (this.particleStateTexture1) this.particleStateTexture1.delete();
    if (this.particleIndexBuffer) this.particleIndexBuffer.delete();
    if (this.windTexture) this.windTexture.delete();

    const gl = this.context.gl;
    if (this.framebuffer && gl) gl.deleteFramebuffer(this.framebuffer);
  }

  shouldUpdateState(params: UpdateParameters<this>): boolean {
    return (
      params.changeFlags.propsChanged ||
      params.changeFlags.viewportChanged ||
      params.changeFlags.dataChanged
    );
  }

  updateState({ props, oldProps, changeFlags }: UpdateParameters<this>) {
    super.updateState({ props, oldProps, changeFlags });

    // Handle prop changes
    if (props.numParticles !== oldProps.numParticles && props.numParticles) {
      this.setNumParticles(props.numParticles);
    }

    if (props.colorRamp !== oldProps.colorRamp) {
      this.setColorRamp(props.colorRamp || defaultRampColors);
    }

    if (props.animate !== oldProps.animate) {
      if (props.animate) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    }

    // Create mock wind data if no actual wind data provided
    if (!this.windData) {
      this.windData = this.createMockWindData(props.bounds);
      this.setWindData(this.windData);
    }

    // Resize textures if needed
    if (changeFlags.viewportChanged) {
      this.resize();
    }
  }

  draw({ uniforms }: any) {
    const { animate } = this.props;

    // Skip drawing if we don't have the necessary resources
    if (!this.windTexture || !this.particleStateTexture0) return;

    // Single frame if not animating, continuous updates if animating
    if (animate) {
      this.drawAnimationFrame();
    } else {
      this.drawStaticFrame();
    }
  }

  // Create a shader program with vertex and fragment shaders
  createProgram(
    gl: WebGLRenderingContext,
    vertexSource: string,
    fragmentSource: string
  ) {
    // Create shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error(
        gl.getShaderInfoLog(vertexShader) || "Vertex shader compilation error"
      );
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error(
        gl.getShaderInfoLog(fragmentShader) ||
          "Fragment shader compilation error"
      );
    }

    // Create program
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Program linking error");
    }

    // Get attribute and uniform locations
    const wrapper: any = { program };

    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
      const attribute = gl.getActiveAttrib(program, i)!;
      wrapper[attribute.name] = gl.getAttribLocation(program, attribute.name);
    }

    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const uniform = gl.getActiveUniform(program, i)!;
      wrapper[uniform.name] = gl.getUniformLocation(program, uniform.name);
    }

    return wrapper;
  }

  // Set the color ramp for particle visualization
  setColorRamp(colors: Record<string, string>) {
    const gl = this.context.gl;
    this.colorRampTexture = this.createColorRampTexture(gl, colors);
  }

  // Create color ramp texture
  createColorRampTexture(
    gl: WebGLRenderingContext,
    colors: Record<string, string>
  ) {
    // Create a canvas to generate the color ramp
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    canvas.width = 256;
    canvas.height = 1;

    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    for (const stop in colors) {
      gradient.addColorStop(+stop, colors[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    const imageData = ctx.getImageData(0, 0, 256, 1);

    // Use raw WebGL calls instead of luma.gl Texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData
    );
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
  }

  // Set the number of particles
  setNumParticles(numParticles: number) {
    const gl = this.context.gl;

    // Create a square texture where each pixel will hold a particle position encoded as RGBA
    const particleRes = (this.particleStateResolution = Math.ceil(
      Math.sqrt(numParticles)
    ));
    this._numParticles = particleRes * particleRes;

    // Initialize particle state with random positions
    const particleState = new Uint8Array(this._numParticles * 4);
    for (let i = 0; i < particleState.length; i++) {
      particleState[i] = Math.floor(Math.random() * 256);
    }

    // Create particle state textures
    this.particleStateTexture0 = this.createDataTexture(
      gl,
      particleState,
      particleRes,
      particleRes
    );
    this.particleStateTexture1 = this.createDataTexture(
      gl,
      particleState,
      particleRes,
      particleRes
    );

    // Create particle index buffer directly with WebGL
    const particleIndices = new Float32Array(this._numParticles);
    for (let i = 0; i < this._numParticles; i++) {
      particleIndices[i] = i;
    }

    // Create particle index buffer using raw WebGL
    this.particleIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, particleIndices, gl.STATIC_DRAW);
  }

  // Create a data texture
  createDataTexture(
    gl: WebGLRenderingContext,
    data: Uint8Array,
    width: number,
    height: number
  ) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  // Create mock wind data for visualization
  createMockWindData(bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  }): WindDataType {
    const width = 360;
    const height = 180;
    const data = new Uint8Array(width * height * 4);

    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;

    // Generate wind data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Convert pixel position to geographic coordinates
        const lng = (x / width) * 360 - 180;
        const lat = (y / height) * 180 - 90;

        // Generate wind vectors using a simple wave pattern
        const uComp = Math.sin(lat * 0.05) * Math.cos(lng * 0.05);
        const vComp = Math.cos(lat * 0.05) * Math.sin(lng * 0.05);

        // Update min/max
        uMin = Math.min(uMin, uComp);
        uMax = Math.max(uMax, uComp);
        vMin = Math.min(vMin, vComp);
        vMax = Math.max(vMax, vComp);

        // Encode wind vectors in RGBA
        const i = (y * width + x) * 4;
        // R and G channels contain the u component
        data[i] = Math.floor((uComp + 1) * 127.5); // R: integer part
        data[i + 1] = Math.floor((((uComp + 1) * 127.5) % 1) * 255); // G: fraction part

        // B and A channels contain the v component
        data[i + 2] = Math.floor((vComp + 1) * 127.5); // B: integer part
        data[i + 3] = Math.floor((((vComp + 1) * 127.5) % 1) * 255); // A: fraction part
      }
    }

    return {
      width,
      height,
      uMin,
      uMax,
      vMin,
      vMax,
      image: data,
    };
  }

  // Set wind data for visualization
  setWindData(windData: WindDataType) {
    this.windData = windData;

    const gl = this.context.gl;

    // Use raw WebGL calls instead of luma.gl Texture
    this.windTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.windTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      windData.width,
      windData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      windData.image
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Resize screen textures
  resize() {
    const gl = this.context.gl;
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    const emptyPixels = new Uint8Array(width * height * 4);

    // Create screen textures
    this.backgroundTexture = this.createDataTexture(
      gl,
      emptyPixels,
      width,
      height
    );
    this.screenTexture = this.createDataTexture(gl, emptyPixels, width, height);
  }

  // Start animation
  startAnimation() {
    if (!this.animationFrame) {
      this.animationFrame = requestAnimationFrame(this.animateFrame.bind(this));
    }
  }

  // Stop animation
  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // Animation frame
  animateFrame() {
    this.drawAnimationFrame();
    if (this.props.animate) {
      this.animationFrame = requestAnimationFrame(this.animateFrame.bind(this));
    }
  }

  // Draw a single static frame
  drawStaticFrame() {
    const gl = this.context.gl;
    if (!gl || !this.windTexture || !this.particleStateTexture0) return;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    // Bind textures
    this.bindTexture(gl, this.windTexture, 0);
    this.bindTexture(gl, this.particleStateTexture0, 1);

    // Draw particles only (no trails or updates)
    this.drawParticles();
  }

  // Draw an animation frame
  drawAnimationFrame() {
    const gl = this.context.gl;
    if (!gl || !this.windTexture || !this.particleStateTexture0) return;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    // Bind textures
    this.bindTexture(gl, this.windTexture, 0);
    this.bindTexture(gl, this.particleStateTexture0, 1);

    // Draw screen with particles and trails
    this.drawScreen();
    // Update particle positions
    this.updateParticles();
  }

  // Draw the screen with particles and trails
  drawScreen() {
    const gl = this.context.gl;
    if (!this.framebuffer || !this.screenTexture || !this.backgroundTexture)
      return;

    // Draw the screen into a temporary framebuffer
    this.bindFramebuffer(gl, this.framebuffer, this.screenTexture);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Draw background with fade
    this.drawTexture(this.backgroundTexture, this.props.fadeOpacity || 0.996);
    // Draw new particles
    this.drawParticles();

    // Unbind framebuffer and draw to screen
    this.bindFramebuffer(gl, null);

    // Enable blending for drawing on top of existing content
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw the current screen
    this.drawTexture(this.screenTexture, 1.0);

    gl.disable(gl.BLEND);

    // Swap screen and background textures for next frame
    const temp = this.backgroundTexture;
    this.backgroundTexture = this.screenTexture;
    this.screenTexture = temp;
  }

  // Draw a texture to the screen
  drawTexture(texture: Texture, opacity: number) {
    const gl = this.context.gl;
    const program = this.screenProgram;
    if (!program || !this.quadBuffer) return;

    gl.useProgram(program.program);

    // Bind attributes and uniforms
    this.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);
    this.bindTexture(gl, texture, 2);

    gl.uniform1i(program.u_screen, 2);
    gl.uniform1f(program.u_opacity, opacity);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Draw particles
  drawParticles() {
    const gl = this.context.gl;
    const program = this.drawProgram;
    if (
      !program ||
      !this.particleIndexBuffer ||
      !this.colorRampTexture ||
      !this.windData
    )
      return;

    gl.useProgram(program.program);

    // Bind attributes and textures
    this.bindAttribute(gl, this.particleIndexBuffer, program.a_index, 1);
    this.bindTexture(gl, this.colorRampTexture, 2);

    // Set uniforms
    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_particles, 1);
    gl.uniform1i(program.u_color_ramp, 2);

    gl.uniform1f(program.u_particles_res, this.particleStateResolution);
    gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
    gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);

    // Draw points
    gl.drawArrays(gl.POINTS, 0, this._numParticles);
  }

  // Update particle positions
  updateParticles() {
    const gl = this.context.gl;
    const {
      speedFactor = 0.25,
      dropRate = 0.003,
      dropRateBump = 0.01,
    } = this.props;

    if (
      !this.framebuffer ||
      !this.particleStateTexture1 ||
      !this.quadBuffer ||
      !this.updateProgram ||
      !this.windData
    ) {
      return;
    }

    // Bind framebuffer for particle state update
    this.bindFramebuffer(gl, this.framebuffer, this.particleStateTexture1);
    gl.viewport(
      0,
      0,
      this.particleStateResolution,
      this.particleStateResolution
    );

    const program = this.updateProgram;
    gl.useProgram(program.program);

    // Bind attributes and uniforms
    this.bindAttribute(gl, this.quadBuffer, program.a_pos, 2);

    gl.uniform1i(program.u_wind, 0);
    gl.uniform1i(program.u_particles, 1);

    gl.uniform1f(program.u_rand_seed, Math.random());
    gl.uniform2f(program.u_wind_res, this.windData.width, this.windData.height);
    gl.uniform2f(program.u_wind_min, this.windData.uMin, this.windData.vMin);
    gl.uniform2f(program.u_wind_max, this.windData.uMax, this.windData.vMax);
    gl.uniform1f(program.u_speed_factor, speedFactor);
    gl.uniform1f(program.u_drop_rate, dropRate);
    gl.uniform1f(program.u_drop_rate_bump, dropRateBump);

    // Update particles
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Swap particle state textures
    const temp = this.particleStateTexture0;
    this.particleStateTexture0 = this.particleStateTexture1;
    this.particleStateTexture1 = temp;
  }

  // Bind texture to a specific unit
  bindTexture(gl: WebGLRenderingContext, texture: any, unit: number) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  // Bind attribute buffer
  bindAttribute(
    gl: WebGLRenderingContext,
    buffer: any,
    attribute: number,
    numComponents: number
  ) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, numComponents, gl.FLOAT, false, 0, 0);
  }

  // Bind framebuffer
  bindFramebuffer(
    gl: WebGLRenderingContext,
    framebuffer: WebGLFramebuffer | null,
    texture?: any
  ) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    if (framebuffer && texture) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
    }
  }
}

// Helper function to create a wind layer instance
export function createWebGLWindLayer(props: Omit<WebGLWindLayerProps, "id">) {
  return new WebGLWindLayer({
    id: "webgl-wind-layer",
    ...props,
  });
}

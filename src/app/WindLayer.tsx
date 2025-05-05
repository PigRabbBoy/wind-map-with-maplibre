"use client";

// Import components and functions needed from React
// - useMemo: Used to memoize calculated values and prevent recalculation on each render
import React, { useMemo } from 'react';

// Import base layers from deck.gl that will be used to display wind particles
// - PathLayer: Used for drawing lines showing wind direction and particle trails
// - ScatterplotLayer: Used for drawing points showing current particle positions
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

// Import classes and types for creating composite layers from deck.gl
// - CompositeLayer: Class for creating layers composed of multiple sub-layers
// - CompositeLayerProps: Type for CompositeLayer properties
// - Layer: Base class for all layers
// - UpdateParameters: Type for parameters used in layer updates
import { CompositeLayer, CompositeLayerProps, Layer, UpdateParameters } from '@deck.gl/core';

// Import functions and types for handling mock wind data
// - generateMockWindData: Function to generate mock wind data for a specified area
// - getWindColor: Function to convert wind speed to appropriate color
// - WindPoint: Type for individual wind data points
import { generateMockWindData, getWindColor, WindPoint } from '../data/mockWindData';

// Define props for the WindLayer component - parameters used to customize the wind data display
type WindLayerProps = {
  bounds: {
    west: number;    // Western boundary of area (longitude) - the leftmost longitude
    south: number;   // Southern boundary of area (latitude) - the bottom latitude
    east: number;    // Eastern boundary of area (longitude) - the rightmost longitude
    north: number;   // Northern boundary of area (latitude) - the top latitude
  };
  density?: number;   // Density of wind points (points per axis) - higher means more detailed but heavier processing
  lengthScale?: number;  // Wind arrow length scale factor - controls the length of lines showing wind direction
  widthScale?: number;   // Wind arrow width scale factor - controls the thickness of lines showing wind direction
  particleCount?: number; // Number of particles used in visualization - defines how many particles appear on the map
  animate?: boolean;  // Enable/disable animation - controls whether to show animation or static view
  particleSpeed?: number; // Particle speed - controls how fast particles move
};

// Define props for the WindParticleLayer which is a custom Composite layer for showing wind particles
type WindParticleLayerProps = {
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  density?: number;
  lengthScale?: number;
  widthScale?: number;
  particleCount?: number;
  animate?: boolean;
  particleSpeed?: number;
  id?: string;  // ID value to identify the layer, must be unique among other layers in deck.gl
};

// Define type for each wind particle to store data and display animation
type ParticleType = {
  position: [number, number]; // Current position [longitude, latitude] on the map
  direction: number;         // Movement direction (in radians) where 0 is east and increases clockwise
  speed: number;             // Movement speed (relative value, not SI units)
  age: number;               // Current age of particle (counted in frames)
  maxAge: number;            // Maximum age of particle before it's recreated (counted in frames)
  size: number;              // Particle size (in pixels)
  color: [number, number, number, number]; // RGBA color (each value in 0-255 range)
};

// Create a custom Composite layer for displaying wind particles
// CompositeLayer is a base class from deck.gl that allows creating layers composed of multiple sub-layers
class WindParticleLayer extends CompositeLayer<WindParticleLayerProps> {
  static layerName = 'WindParticleLayer';  // Define layer name for reference
  static defaultProps = {
    particleCount: 1000,  // Default 1000 particles
    animate: true,        // Animation enabled by default
    particleSpeed: 0.02,  // Default particle speed
    fadeOpacity: 0.996,   // Fade rate for animation (higher = slower fade)
  };

  // Declare variable for animation frame ID to use for canceling animation when needed
  animationFrame: number | null = null;

  // Define initial state of layer
  state = {
    particles: [] as ParticleType[],  // Array to store all particles
    timestamp: 0,                      // Current time, used to trigger updates
    windData: [] as WindPoint[],       // Wind data from simulation
  };

  // Function called when layer is initially created
  initializeState() {
    // Create mock wind data and particles when initialized
    const { bounds, density = 20 } = this.props;
    const windData = generateMockWindData(bounds, density); // Generate mock wind data based on bounds and density
    this.setState({ 
      windData,  // Store generated wind data in state
      particles: this.generateParticles(windData)  // Generate and store particles based on wind data
    });
    
    // Set up animation loop using browser's requestAnimationFrame
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }

  // Function called when layer is being destroyed
  finalizeState() {
    // Cancel animation loop if it's running
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // Function to decide whether to update layer state
  shouldUpdateState(params: UpdateParameters<Layer<WindParticleLayerProps & Required<CompositeLayerProps>>>) {
    const { changeFlags } = params;
    // Update when props change, viewport changes, or data changes
    return Boolean(changeFlags.propsChanged) || 
           Boolean(changeFlags.viewportChanged) || 
           Boolean(changeFlags.dataChanged);
  }
  
  // Generate wind particles in specified area based on wind data
  generateParticles(windData: WindPoint[]) {
    const { particleCount = 1000 } = this.props;  // Get desired number of particles or use default 1000
    const { bounds } = this.props;  // Get bounds of area to create particles in
    
    const particles: ParticleType[] = [];  // Array to store created particles
    
    // Create particles based on specified count
    for (let i = 0; i < particleCount; i++) {
      // Generate random position within specified bounds
      const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
      const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
      
      // Find closest wind data point to determine direction and speed of particle
      let closestWindPoint = windData[0];
      let minDistance = Number.MAX_VALUE;
      
      for (const point of windData) {
        const dx = point.position[0] - longitude;
        const dy = point.position[1] - latitude;
        const distance = dx * dx + dy * dy;  // Calculate distance with Pythagoras without square root (for speed)
        
        if (distance < minDistance) {
          minDistance = distance;
          closestWindPoint = point;
        }
      }
      
      // Randomize particle age to make particle creation staggered
      const maxAge = 50 + Math.random() * 50;  // Maximum age between 50-100 frames
      
      // Set color based on wind speed with alpha of 200 (out of 255)
      const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
      
      // Add new particle to the array
      particles.push({
        position: [longitude, latitude],
        direction: closestWindPoint.direction,
        speed: closestWindPoint.speed,
        age: Math.random() * maxAge,  // Start with random age to stagger renewals
        maxAge,
        size: 6 + closestWindPoint.speed * 15, // Particle size varies with wind speed (reduced 50% from 12+speed*30)
        color
      });
    }
    
    return particles;
  }
  
  // Update particle movement based on wind direction and speed
  updateParticles() {
    const { animate, particleSpeed = 0.0075, bounds } = this.props; // Reduced speed 50% from 0.015 to 0.0075
    const { particles, windData } = this.state;
    
    // If animation is off or no particles exist, return original particles
    if (!animate || particles.length === 0) return particles;
    
    // Update each particle
    return particles.map(particle => {
      // Increase particle age with each update
      particle.age += 1;
      
      // If particle has reached maximum age, create a new one
      if (particle.age >= particle.maxAge) {
        // Generate random position within bounds
        const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
        const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
        
        // Find closest wind point to new position
        let closestWindPoint = windData[0];
        let minDistance = Number.MAX_VALUE;
        
        for (const point of windData) {
          const dx = point.position[0] - longitude;
          const dy = point.position[1] - latitude;
          const distance = dx * dx + dy * dy;
          
          if (distance < minDistance) {
            minDistance = distance;
            closestWindPoint = point;
          }
        }
        
        // Set new maximum age and color
        const maxAge = 50 + Math.random() * 50;
        const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
        
        // Return new particle
        return {
          position: [longitude, latitude],
          direction: closestWindPoint.direction,
          speed: closestWindPoint.speed,
          age: 0,  // Reset age to 0
          maxAge,
          size: 6 + closestWindPoint.speed * 15, // Size based on wind speed (reduced 50% from 12+speed*30)
          color
        };
      } else {
        // Move particle based on direction and speed
        const speed = particle.speed * particleSpeed;  // Adjust speed with particleSpeed parameter
        // Calculate new position using cos/sin and speed
        const x = particle.position[0] + Math.cos(particle.direction) * speed;
        const y = particle.position[1] + Math.sin(particle.direction) * speed;
        
        // Check if particle is still within bounds
        if (x < bounds.west || x > bounds.east || y < bounds.south || y > bounds.north) {
          // If out of bounds, set age to maximum to create a new one in next frame
          particle.age = particle.maxAge;
          return particle;
        }
        
        // Update transparency based on age - older particles become more transparent
        const opacityFactor = 1 - particle.age / particle.maxAge;
        particle.color[3] = 200 * opacityFactor;
        
        // Update particle position
        particle.position = [x, y];
        
        return particle;
      }
    });
  }
  
  // Function that runs on each animation frame
  animate() {
    if (this.props.animate) {
      // Update all particles
      const updatedParticles = this.updateParticles();
      // Update state with updated particles and current time
      this.setState({ 
        timestamp: Date.now(),  // Use current time to trigger deck.gl to update display
        particles: updatedParticles 
      });
    }
    
    // Request next animation frame (creates continuous animation)
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }
  
  // Create and return sub-layers used to display wind particles
  renderLayers() {
    const { particles } = this.state;
    const { widthScale = 3, animate } = this.props;
    
    // When animation is off, display wind direction arrows instead of moving particles
    if (!animate) {
      // Use PathLayer to create arrows showing wind direction based directly on wind data
      return [
        new PathLayer({
          id: `${this.props.id}-wind-arrows`,
          data: this.state.windData,
          pickable: false,  // Not selectable
          widthMinPixels: 2.25,  // Minimum line width
          getPath: (d: WindPoint) => {
            const [x, y] = d.position;
            // Calculate arrow endpoint based on wind direction
            const length = 0.5; // Arrow length
            const endX = x + Math.cos(d.direction) * length;
            const endY = y + Math.sin(d.direction) * length;
            
            // Calculate points for arrow head
            const arrowSize = 0.15; // Arrow head size
            const arrowAngle = Math.PI / 6; // 30 degree angle for arrow head
            
            // Calculate left point of arrow head (from arrow endpoint)
            const leftX = endX - arrowSize * Math.cos(d.direction + arrowAngle);
            const leftY = endY - arrowSize * Math.sin(d.direction + arrowAngle);
            
            // Calculate right point of arrow head (from arrow endpoint)
            const rightX = endX - arrowSize * Math.cos(d.direction - arrowAngle);
            const rightY = endY - arrowSize * Math.sin(d.direction - arrowAngle);
            
            // Complete path that forms the arrow
            // Format: start point -> end point -> left arrow head -> end point -> right arrow head
            return [
              [x, y],          // Start point
              [endX, endY],    // End point
              [leftX, leftY],  // Left side of arrow head
              [endX, endY],    // Back to end point
              [rightX, rightY] // Right side of arrow head
            ];
          },
          getColor: (d: WindPoint) => {
            // Get appropriate color based on wind speed
            const [r, g, b] = getWindColor(d.speed);
            return [r, g, b, 200]; // Set transparency for arrow lines
          },
          getWidth: (d: WindPoint) => d.speed * 3 + 1, // Line thickness varies with wind speed
        })
      ];
    }
    
    // When animation is on, show moving particles with usual animation by using 2 layers together
    return [
      // First layer: ScatterplotLayer for particle points
      new ScatterplotLayer({
        id: `${this.props.id}-particles`,
        data: particles,
        pickable: false,
        opacity: 1,
        stroked: false,  // No outline
        filled: true,    // Fill with color
        radiusScale: widthScale * 1.5, // Adjust particle size with widthScale
        getPosition: (d: ParticleType) => d.position,  // Point position
        getRadius: (d: ParticleType) => d.size * 1.2,  // Point radius
        getFillColor: (d: ParticleType) => d.color,    // Point color
        getLineColor: [255, 255, 255],                 // Border color (not used with stroked=false)
        updateTriggers: {
          // Triggers to tell deck.gl when to update data
          getPosition: this.state.timestamp,
          getFillColor: this.state.timestamp,
        }
      }),
      
      // Second layer: PathLayer for particle trails
      new PathLayer({
        id: `${this.props.id}-trails`,
        data: particles,
        pickable: false,
        widthMinPixels: 2.25, // Minimum trail width (reduced 50% from 4.5)
        getPath: (d: ParticleType) => {
          const [x, y] = d.position;
          // Create trail path backwards from current position in opposite direction of wind
          const length = d.speed * 0.45; // Trail length
          const endX = x - Math.cos(d.direction) * length;
          const endY = y - Math.sin(d.direction) * length;
          return [[x, y], [endX, endY]];  // Line from current to end point
        },
        getColor: (d: ParticleType) => {
          // Make trail color slightly brighter than particle color
          const [r, g, b, a] = d.color;
          // Increase brightness but cap at 255
          return [Math.min(r + 40, 255), Math.min(g + 40, 255), Math.min(b + 40, 255), a];
        },
        getWidth: (d: ParticleType) => d.size * 0.8, // Trail thickness (80% of particle size)
        updateTriggers: {
          getPath: this.state.timestamp,
          getColor: this.state.timestamp,
        }
      })
    ];
  }
}

// Helper function to easily create WindLayer - this function is called from outside this file
export const createWindLayer = ({
  bounds,
  density = 25,      // Base density of 25 points per axis
  lengthScale = 0.5,  // Base length multiplier of 0.5
  widthScale = 3,     // Base width multiplier of 3
  particleCount = 1500, // Base particle count of 1500
  animate = true,     // Animation enabled by default
  particleSpeed = 0.0075 // Base particle speed (reduced 50% from 0.015)
}: WindLayerProps) => {
  // Create and return WindParticleLayer with specified parameters
  return new WindParticleLayer({
    id: 'wind-particle-layer', // Set layer ID
    bounds,
    density,
    lengthScale,
    widthScale,
    particleCount,
    animate,
    particleSpeed
  });
};

// React component for use with <DeckGL> component
// This function is a React wrapper for the createWindLayer function above
const WindLayer: React.FC<WindLayerProps> = (props) => {
  // Use useMemo to create layer only when props change, for efficiency
  useMemo(() => createWindLayer(props), [props]); // Simplified dependencies to just props
  
  // No JSX return needed as this is a deck.gl layer (not a standard React component)
  return null;
};

export default WindLayer;

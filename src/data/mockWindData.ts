// filepath: /Users/pigrabb/Documents/GitHub/wind-map-with-maplibre/src/data/mockWindData.ts
// File for creating mock wind data for animated wind direction visualization
// This document includes data types, wind data generation functions, and animation functions
// for displaying interactive wind direction on maps

// ================ Data Types ================

// Define the wind point data structure
export type WindPoint = {
  position: [number, number];  // Geographic position [longitude, latitude]
  direction: number;           // Wind direction (measured in radians, where 0 is east and increasing counterclockwise)
  speed: number;               // Wind speed (normalized value between 0-1 for animation calculations)
};

// Define the wind particle data structure for movement
// Wind particles are used to show the animated flow of wind on the map
export type WindParticle = {
  x: number;                  // Screen x position (in pixels)
  y: number;                  // Screen y position (in pixels)
  age: number;                // Current age of the particle (counted in frames)
  maxAge: number;             // Maximum age of particle before it's reset and recreated (frames)
  speed: number;              // Particle speed (in pixels per frame)
  direction: number;          // Movement direction (in radians)
};

// Type for map object with projection methods
// Necessary for converting between screen coordinates (pixels) and geographic coordinates (longitude/latitude)
export type MapWithProjection = {
  unproject: (point: [number, number]) => { lng: number; lat: number };
};

// ================ Wind Data Generation and Management Functions ================

// Function to generate mock wind data as a grid over a specified area
// This function creates wind data points as a grid covering the specified geographic area
// with realistic wind patterns simulated for the Thailand region
export function generateMockWindData(
  bounds: {
    west: number;             // Western boundary of area (minimum longitude)
    south: number;            // Southern boundary of area (minimum latitude)
    east: number;             // Eastern boundary of area (maximum longitude)
    north: number;            // Northern boundary of area (maximum latitude)
  },
  density: number = 15        // Grid density (points per axis), default is 15 points
): WindPoint[] {
  const windData: WindPoint[] = [];
  
  // Set safety limit to prevent excessive points generation
  const safetyLimit = 500;  // Limit the maximum number of wind points to prevent performance issues
  const effectiveDensity = Math.min(density, 30); // Limit density to a maximum of 30 points per axis for efficiency
  
  // Calculate step size for latitude and longitude based on bounds and density
  const lonStep = (bounds.east - bounds.west) / effectiveDensity;  // Longitude step size
  const latStep = (bounds.north - bounds.south) / effectiveDensity; // Latitude step size
  
  // Count points created to ensure we don't exceed safety limits
  let pointCount = 0;

  // Create grid of wind points by looping through latitudes and longitudes
  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lon = bounds.west; lon <= bounds.east; lon += lonStep) {
      // Check if we've exceeded the safety limit, if so, stop creating points and return existing data
      if (pointCount >= safetyLimit) {
        console.warn(`Wind data point limit (${safetyLimit}) reached. Some areas may not be covered.`);
        return windData;
      }
      
      // Simulate wind patterns for Thailand based on geographic position
      // Divide into different patterns by region to make the flow more realistic
      let direction, speed;
      
      // Use latitude 14.0 degrees as a rough dividing line between northern and southern regions
      const isNorth = lat > 14.0;
      
      if (isNorth) {
        // Wind pattern for northern Thailand (more east-west flow)
        // Simulating northeast monsoon and northwest monsoon characteristics
        // Math.PI * 0.5 is 90 degrees (north) with adjustments based on position using sin and cos functions
        direction = Math.PI * 0.5 + 
          Math.sin(lat * 0.3) * 0.5 + 
          Math.cos(lon * 0.2) * 0.3;
        
        // Wind speed for northern region, with a base value of 0.3 and variation based on position
        speed = 0.3 + 0.3 * Math.abs(Math.sin(lat * 0.1 + lon * 0.2));
      } else {
        // Wind pattern for southern Thailand (peninsula) - more variable due to ocean influence
        // Math.PI * 0.25 is 45 degrees (northeast) with more complex adjustments
        // to simulate the influence of monsoons and frequently changing sea breezes
        direction = Math.PI * 0.25 + 
          Math.sin(lat * 0.4 + lon * 0.3) * Math.PI * 0.5 + 
          Math.cos(lat * 0.3) * 0.4;
        
        // Wind speed for southern region, with a base value of 0.2 (slightly less than northern)
        // but with higher variation due to surrounding sea influence
        speed = 0.2 + 
          0.4 * Math.abs(Math.sin(lat * 0.2) + Math.sin(lon * 0.3));
      }

      // Add wind point to the data list, including position, direction and speed
      windData.push({
        position: [lon, lat],  // Geographic position
        direction,            // Calculated wind direction
        speed                 // Calculated wind speed
      });
      
      // Increment the count of points created
      pointCount++;
    }
  }

  // Return all generated wind data
  return windData;
}

// ================ Wind Particle Functions ================

// Create wind particles for animating wind direction on the map
// Wind particles are moving points that follow the wind direction and speed at each position
export function generateWindParticles(
  windData: WindPoint[],       // Wind data to reference for creating particles
  width: number,               // Width of display area on screen (in pixels)
  height: number,              // Height of display area on screen (in pixels)
  map: MapWithProjection,      // Map object for conversion between screen and geographic coordinates
  count: number = 1000         // Number of wind particles to create (default is 1000)
): WindParticle[] {
  // Create array to store all wind particles
  const particles: WindParticle[] = [];
  
  // Create wind particles with random distribution across the screen
  for (let i = 0; i < count; i++) {
    // Generate random screen position with x and y coordinates
    const x = Math.random() * width;   // Random x from 0 to display width
    const y = Math.random() * height;  // Random y from 0 to display height
    
    // Convert screen coordinates to geographic coordinates
    const lngLat = map.unproject([x, y]);
    
    // Find the wind point closest to this position
    let closestDistance = Infinity;
    let closestWindPoint: WindPoint | null = null;
    
    // Loop through all wind points to find the closest
    for (const windPoint of windData) {
      const distance = Math.sqrt(
        Math.pow(windPoint.position[0] - lngLat.lng, 2) +
        Math.pow(windPoint.position[1] - lngLat.lat, 2)
      );
      
      // If we found a closer point, update closest point record
      if (distance < closestDistance) {
        closestDistance = distance;
        closestWindPoint = windPoint;
      }
    }
    
    // If a suitable wind point was found, create a new wind particle using that point's data
    if (closestWindPoint) {
      // Generate random maximum age between 50 and 100 frames
      const maxAge = 50 + Math.random() * 50; 
      
      // Add new particle to the array
      particles.push({
        x,                          // Starting x position
        y,                          // Starting y position
        age: Math.random() * maxAge,    // Set initial age randomly to avoid all particles resetting at once
        maxAge,                         // Maximum lifetime of the particle
        direction: closestWindPoint.direction,  // Use direction from closest wind point
        speed: closestWindPoint.speed * 1.5     // Use speed from closest wind point and multiply by 1.5 for clearer animation
      });
    }
  }
  
  // Return all created wind particles
  return particles;
}

// ================ Wind Particle Update Function ================

// This function moves wind particles according to their direction and speed and handles particles that move off-screen or age out
export function updateWindParticles(
  particles: WindParticle[],    // All current wind particles
  windData: WindPoint[],        // Wind data for direction and speed reference
  width: number,                // Width of display area (pixels)
  height: number,               // Height of display area (pixels)
  map: MapWithProjection        // Map object for coordinate conversion
): WindParticle[] {
  // Update position and properties of each wind particle
  return particles.map(particle => {
    // Move the particle according to its direction and speed
    // Use Math.cos and Math.sin to break velocity into x and y components
    // Multiply by 2 to make the movement more visible
    particle.x += Math.cos(particle.direction) * particle.speed * 2;
    particle.y += Math.sin(particle.direction) * particle.speed * 2;
    
    // Increase particle age by 1 frame
    particle.age += 1;
    
    // Check if particle is too old or has moved off-screen
    if (particle.age >= particle.maxAge || 
        particle.x < 0 || particle.x > width ||
        particle.y < 0 || particle.y > height) {
      
      // Reset particle with new random position on screen
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      // Convert screen coordinates to geographic coordinates to find appropriate wind data
      const lngLat = map.unproject([x, y]);
      
      // Find closest wind point to the new position
      let closestDistance = Infinity;
      let closestWindPoint: WindPoint | null = null;
      
      // Loop through all wind points to find closest
      for (const windPoint of windData) {
        const distance = Math.sqrt(
          Math.pow(windPoint.position[0] - lngLat.lng, 2) +
          Math.pow(windPoint.position[1] - lngLat.lat, 2)
        );
        
        if (distance < closestDistance) {
          closestDistance = distance;
          closestWindPoint = windPoint;
        }
      }
      
      // If a suitable wind point was found, reset the particle with new values
      if (closestWindPoint) {
        return {
          x,                          // New x position
          y,                          // New y position
          age: 0,                     // Reset age to 0
          maxAge: 50 + Math.random() * 50,  // Set new random maximum age
          direction: closestWindPoint.direction,  // Set direction from closest wind point
          speed: closestWindPoint.speed * 1.5     // Set speed from closest wind point
        };
      }
    }
    
    // If particle is still valid, return it with updated position and age
    return particle;
  });
}

// ================ Helper Functions for Visualization ================

// Get RGB color for wind based on speed to provide clear visual differentiation
// Different wind speeds have different colors so users can easily see variations
export function getWindColor(speed: number): [number, number, number] {
  // Clear visible colors for overlay on maps
  // Using high saturation colors to stand out against map background
  if (speed < 0.3) {
    // Light winds (0.0 - 0.3) - light blue
    return [30, 144, 255]; // DodgerBlue - suitable for showing low speed winds
  } else if (speed < 0.6) {
    // Medium winds (0.3 - 0.6) - green to yellow gradient
    // Calculate color to create a gradient based on wind speed
    const g = Math.round(200 + speed * 55); // G value in RGB increases with speed
    return [255, g, 0];  // Yellow-orange color
  } else {
    // Strong winds (0.6 - 1.0) - orange to red
    // Decrease G value in RGB as speed increases for darker color
    const g = Math.round(165 - speed * 165); // G value decreases as speed increases
    return [255, g, 0];  // Gradient from orange to deep red
  }
}

// Get CSS rgba color string for wind particles, accounting for both speed and age
// Older particles fade out, creating a trail effect that shows wind direction
export function getParticleColor(speed: number, age: number, maxAge: number): string {
  // Use getWindColor function to get base color based on wind speed
  const [r, g, b] = getWindColor(speed);
  
  // Calculate opacity based on particle age
  // Multiply by 0.85 to ensure all particles have some transparency
  const alpha = (1 - age / maxAge) * 0.85;
  
  // Create and return the CSS rgba color value
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
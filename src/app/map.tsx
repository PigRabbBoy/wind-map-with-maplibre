/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

// Import basic React libraries and necessary functions
// - useRef: For referencing DOM elements and storing values without triggering re-renders
// - useEffect: For handling side effects and lifecycle-related operations
// - useState: For managing component internal state
// - useCallback: For memoizing functions to prevent new function creation in every render cycle
import React, { useRef, useEffect, useState, useCallback } from "react";

// Import MapLibre GL JS for vector map rendering
// MapLibre is an open-source map library forked from Mapbox GL JS
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Import libraries from deck.gl for creating specialized visualization layers
// Deck and MapView are fundamental components for creating deck.gl visualizations
import { Deck } from "@deck.gl/core";
import { MapView, MapViewState } from "@deck.gl/core";

// Import functions to create wind visualization layers (from project files)
import { createWindLayer } from "./WindLayer";
// Import AdvanceWindLayer for wind visualization using GLSL shaders
import { createAdvanceWindLayer } from "./AdvanceWindLayer";

// Southeast Asia region boundaries
// Define coordinates to constrain the display area and particle generation to this specific region
const SOUTHEAST_ASIA_BOUNDS = {
  west: 92, // Approximate western Burma
  south: -11, // Approximate southern East Timor
  east: 141, // Approximate eastern Papua New Guinea
  north: 28.5, // Approximate southern China
};

// Default map position values
const INITIAL_LNG = 110; // Center longitude for the region
const INITIAL_LAT = 5; // Center latitude for the region
const INITIAL_ZOOM = 4; // Initial zoom level

// Southeast Asian countries and nearby areas
// List of ISO 3-letter country codes for filtering and styling the map
const SOUTHEAST_ASIA_COUNTRIES = [
  "THA", // Thailand
  "VNM", // Vietnam
  "LAO", // Laos
  "KHM", // Cambodia
  "MMR", // Myanmar
  "MYS", // Malaysia
  "SGP", // Singapore
  "IDN", // Indonesia
  "PHL", // Philippines
  "BRN", // Brunei
  "TLS", // Timor-Leste
];

/**
 * Main component for displaying a map with animated wind particles
 * Uses MapLibre GL JS as the main map library and deck.gl for rendering wind particles
 */
function Map() {
  // Create refs for map element reference
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck<MapView[]> | null>(null);

  // Map boundaries and wind data
  const mapBoundsRef = useRef(SOUTHEAST_ASIA_BOUNDS);

  // State for displaying position and zoom level information on screen
  const [displayInfo, setDisplayInfo] = useState({
    lng: INITIAL_LNG,
    lat: INITIAL_LAT,
    zoom: INITIAL_ZOOM,
  });

  // State for controlling animation on/off
  const [animationEnabled, setAnimationEnabled] = useState(true);

  // State for selecting layer type to display (standard or advance)
  const [layerType, setLayerType] = useState<"standard" | "advance">("standard");

  // Refs for storing both animated and static layers
  const animatedLayerRef = useRef<any>(null);
  const staticLayerRef = useRef<any>(null);
  const advanceLayerRef = useRef<any>(null);

  /**
   * Update deck.gl layers by switching between animated and static layers
   */
  const updateDeckGLLayers = useCallback(() => {
    // Update deck instance if it already exists
    if (deckRef.current) {
      // Create both layer types when needed
      if (!animatedLayerRef.current) {
        animatedLayerRef.current = createWindLayer({
          bounds: mapBoundsRef.current,
          density: 15,
          lengthScale: 0.5,
          widthScale: 3,
          particleCount: 1500,
          animate: true,
          particleSpeed: 0.0075,
        });
      }

      if (!staticLayerRef.current) {
        staticLayerRef.current = createWindLayer({
          bounds: mapBoundsRef.current,
          density: 15,
          lengthScale: 0.5,
          widthScale: 3,
          particleCount: 1500,
          animate: false,
          particleSpeed: 0.0075,
        });
      }

      // Always recreate webgl layer with current animation state
      advanceLayerRef.current = createAdvanceWindLayer({
        bounds: mapBoundsRef.current,
        numParticles: 5000,
        animate: animationEnabled,
        fadeOpacity: 0.996,
        speedFactor: 0.25,
        dropRate: 0.003,
        dropRateBump: 0.01,
      });

      // Select layer to display based on layerType and animationEnabled state
      let activeLayer;

      if (layerType === "advance") {
        activeLayer = advanceLayerRef.current;
      } else {
        // Standard layer - choose between animated and static
        activeLayer = animationEnabled
          ? animatedLayerRef.current
          : staticLayerRef.current;
      }

      deckRef.current.setProps({ layers: [activeLayer] });
    }
  }, [animationEnabled, layerType]);

  /**
   * Update currently visible map boundaries
   * Constrain boundaries to stay within Southeast Asia region
   */
  const updateMapBounds = useCallback(() => {
    if (!map.current) return;

    const bounds = map.current.getBounds();

    // Adjust boundaries based on current view, but constrain to Southeast Asia
    mapBoundsRef.current = {
      west: Math.max(bounds.getWest(), SOUTHEAST_ASIA_BOUNDS.west),
      south: Math.max(bounds.getSouth(), SOUTHEAST_ASIA_BOUNDS.south),
      east: Math.min(bounds.getEast(), SOUTHEAST_ASIA_BOUNDS.east),
      north: Math.min(bounds.getNorth(), SOUTHEAST_ASIA_BOUNDS.north),
    };

    // Reset layer refs to recreate with updated boundaries
    animatedLayerRef.current = null;
    staticLayerRef.current = null;
    advanceLayerRef.current = null;

    // Update deck.gl layers
    updateDeckGLLayers();
  }, [updateDeckGLLayers]);

  /**
   * Initialize and setup deck.gl for animated wind visualization
   */
  const initializeDeckGL = useCallback(() => {
    if (!map.current || deckRef.current) return;

    // Create initial layer based on selected type
    let initialLayer;

    if (layerType === "advance") {
      advanceLayerRef.current = createAdvanceWindLayer({
        bounds: mapBoundsRef.current,
        numParticles: 5000,
        animate: animationEnabled,
        fadeOpacity: 0.996,
        speedFactor: 0.25,
        dropRate: 0.003,
        dropRateBump: 0.01,
      });
      initialLayer = advanceLayerRef.current;
    } else {
      // Create WindLayer with deck.gl
      const windLayer = createWindLayer({
        bounds: mapBoundsRef.current,
        density: 15,
        lengthScale: 0.5,
        widthScale: 4,
        particleCount: 1200,
        animate: animationEnabled,
        particleSpeed: 0.01,
      });

      // Store layer in appropriate variable
      if (animationEnabled) {
        animatedLayerRef.current = windLayer;
      } else {
        staticLayerRef.current = windLayer;
      }
      initialLayer = windLayer;
    }

    // Create DeckGL instance
    deckRef.current = new Deck({
      canvas: "deck-canvas",
      width: "100%",
      height: "100%",
      controller: false, // Don't use deck.gl controller (use MapLibre controller instead)
      initialViewState: {
        main: {
          // Use a view ID key
          longitude: INITIAL_LNG,
          latitude: INITIAL_LAT,
          zoom: INITIAL_ZOOM,
          pitch: 0,
          bearing: 0,
        },
      },
      onViewStateChange: ({ viewState }) => {
        // Sync view with MapLibre
        if (map.current) {
          // Access the correct viewState properties based on the structure
          const { longitude, latitude, zoom, pitch, bearing } =
            viewState as MapViewState;
          map.current.jumpTo({
            center: [longitude, latitude],
            zoom,
            pitch,
            bearing,
          });
        }
      },
      views: [new MapView({ id: "main", repeat: true })],
      layers: [initialLayer],
      // Sync with MapLibre data
      onBeforeRender: () => {
        if (!map.current) return;
        // Sync view with MapLibre
        const viewport = {
          main: {
            latitude: map.current.getCenter().lat,
            longitude: map.current.getCenter().lng,
            zoom: map.current.getZoom(),
            bearing: map.current.getBearing(),
            pitch: map.current.getPitch(),
          },
        };

        if (deckRef.current) {
          deckRef.current.setProps({ viewState: viewport });
        }
      },
      parameters: {},
    });

    // Add listener for map view changes
    map.current.on("move", () => {
      if (deckRef.current && map.current) {
        const viewport = {
          main: {
            latitude: map.current.getCenter().lat,
            longitude: map.current.getCenter().lng,
            zoom: map.current.getZoom(),
            bearing: map.current.getBearing(),
            pitch: map.current.getPitch(),
          },
        };

        deckRef.current.setProps({ viewState: viewport });
      }
    });
  }, [animationEnabled, layerType]);

  /**
   * Initialize MapLibre map
   */
  useEffect(() => {
    if (map.current) return; // Don't create duplicate map if one already exists
    if (!mapContainer.current) return;

    // Initialize MapLibre map with dark style
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {}, // No initial data sources
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#000000", // Black background for the map
            },
          },
        ],
      },
      center: [INITIAL_LNG, INITIAL_LAT], // Use constant instead of changing state
      zoom: INITIAL_ZOOM, // Use constant instead of changing state
      maxZoom: 18, // Maximum zoom level
      attributionControl: false, // Don't show attribution text
    });

    // Set up event handlers for updating map position
    map.current.on("move", () => {
      const center = map.current!.getCenter();
      const zoom = map.current!.getZoom();

      setDisplayInfo({
        lng: parseFloat(center.lng.toFixed(4)),
        lat: parseFloat(center.lat.toFixed(4)),
        zoom: parseFloat(zoom.toFixed(2)),
      });
    });

    // Add country boundaries
    map.current.on("load", () => {
      // Add global country boundaries from GeoJSON
      fetch(
        "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
      )
        .then((response) => response.json())
        .then((data) => {
          const filteredData = {
            type: "FeatureCollection" as const,
            features: data.features,
          };

          // Add countries data source
          map.current!.addSource("countries", {
            type: "geojson",
            data: filteredData,
          });

          // Add country fill areas (to make boundaries more visible)
          map.current!.addLayer({
            id: "country-fill",
            type: "fill",
            source: "countries",
            paint: {
              "fill-color": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                "#333333", // Color for Southeast Asian countries
                "#222222", // Color for other countries
              ],
              "fill-opacity": 0.5,
            },
          });

          // Add country borders
          map.current!.addLayer({
            id: "country-borders",
            type: "line",
            source: "countries",
            layout: {},
            paint: {
              "line-color": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                "#888888", // Color for Southeast Asian countries - brighter
                "#555555", // Color for other countries - darker
              ],
              "line-width": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                1.5, // Line thickness for Southeast Asian countries - thicker
                1, // Line thickness for other countries - thinner
              ],
              "line-opacity": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                0.8, // Opacity for Southeast Asian countries - more visible
                0.5, // Opacity for other countries - more transparent
              ],
            },
          });

          // Initialize deck.gl
          initializeDeckGL();
        })
        .catch((error) => {
          console.error("Error loading country boundaries:", error);
        });
    });

    // Add navigation control
    map.current.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true, // Show pitch control
        showCompass: true, // Show compass
      }),
      "top-right" // Position of controls
    );

    // Cleanup when component is destroyed
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      if (deckRef.current) {
        deckRef.current.finalize();
        deckRef.current = null;
      }
    };
  }, [initializeDeckGL]); // Added initializeDeckGL as dependency

  /**
   * Start animation when map is ready
   * and set up map events
   */
  useEffect(() => {
    if (!map.current) return;

    // Function to run when map is loaded
    const onLoad = () => {
      console.log("Map loaded");
      updateMapBounds();
    };

    // Add event handler
    map.current.on("load", onLoad);

    // Start animation immediately if map is already loaded
    if (map.current.loaded()) {
      onLoad();
    }

    // Cleanup when component is destroyed
    return () => {
      if (map.current) {
        map.current.off("load", onLoad);
      }
    };
  }, [updateMapBounds, initializeDeckGL]);

  // Update layers when layerType changes
  useEffect(() => {
    updateDeckGLLayers();
  }, [layerType, updateDeckGLLayers]);

  return (
    <div>
      {/* Top information bar - shows coordinates and zoom level */}
      <div
        className="sidebar"
        style={{
          background: "rgba(35, 35, 35, 0.8)", // Translucent background
          color: "white", // Text color
          padding: "6px 12px", // Edge padding
          borderRadius: "4px", // Rounded corners
          position: "absolute", // Absolute positioning
          top: "10px", // 10px from top
          left: "10px", // 10px from left
          zIndex: 1, // Stacking order
          fontFamily: "monospace", // Font style
        }}
      >
        Longitude: {displayInfo.lng} | Latitude: {displayInfo.lat} | Zoom:{" "}
        {displayInfo.zoom}
      </div>

      {/* Animation and Layer Type control buttons */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "20px",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          alignItems: "flex-start",
        }}
      >
        {/* Animation on/off control */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(35, 35, 35, 0.8)",
            padding: "10px 15px",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0, 0, 0, 0.3)",
          }}
        >
          <span
            style={{
              color: "white",
              marginRight: "10px",
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            {animationEnabled ? "Animation ON" : "Animation OFF"}
          </span>

          {/* Toggle Switch for Animation */}
          <div
            onClick={() => {
              // Change animation on/off state
              setAnimationEnabled(!animationEnabled);
              // Update currently displayed layer
              updateDeckGLLayers();
            }}
            style={{
              position: "relative",
              width: "46px",
              height: "24px",
              backgroundColor: animationEnabled ? "#4CAF50" : "#ccc",
              borderRadius: "34px",
              cursor: "pointer",
              transition: "background-color 0.3s",
            }}
          >
            {/* Sliding button */}
            <div
              style={{
                position: "absolute",
                height: "20px",
                width: "20px",
                left: animationEnabled ? "24px" : "2px",
                bottom: "2px",
                backgroundColor: "white",
                borderRadius: "50%",
                transition: "left 0.3s",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
              }}
            />
          </div>
        </div>

        {/* Layer Type selection control */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "rgba(35, 35, 35, 0.8)",
            padding: "10px 15px",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0, 0, 0, 0.3)",
          }}
        >
          <span
            style={{
              color: "white",
              marginRight: "10px",
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            Layer Type:
          </span>

          {/* Standard Layer Type button (deck.gl) */}
          <button
            onClick={() => setLayerType("standard")}
            style={{
              backgroundColor: layerType === "standard" ? "#4CAF50" : "#555",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "5px 10px",
              marginRight: "5px",
              cursor: "pointer",
              fontSize: "12px",
              opacity: layerType === "standard" ? 1 : 0.7,
              transition: "all 0.3s",
            }}
          >
            Standard
          </button>

          {/* Advanced Layer Type button (WebGL/GLSL) */}
          <button
            onClick={() => setLayerType("advance")}
            style={{
              backgroundColor: layerType === "advance" ? "#4CAF50" : "#555",
              color: "white",
              border: "none",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor: "pointer",
              fontSize: "12px",
              opacity: layerType === "advance" ? 1 : 0.7,
              transition: "all 0.3s",
            }}
          >
            Advance
          </button>
        </div>
      </div>

      {/* Main map container */}
      <div
        ref={mapContainer}
        className="map-container"
        style={{ width: "100%", height: "100vh", position: "relative" }}
      />

      {/* Canvas for deck.gl */}
      <canvas
        id="deck-canvas"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
    </div>
  );
}

export default Map;

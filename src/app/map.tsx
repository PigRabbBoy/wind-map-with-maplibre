"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Import deck.gl libraries
import { Deck } from "@deck.gl/core";
import { MapView } from "@deck.gl/core";
import { createWindLayer } from "./WindLayer";

// ขอบเขตภูมิภาคเอเชียตะวันออกเฉียงใต้ (South East Asia)
// กำหนดพิกัดขอบเขตเพื่อจำกัดการแสดงผลและการสร้างอนุภาคเฉพาะในภูมิภาค
const SOUTHEAST_ASIA_BOUNDS = {
  west: 92, // ประมาณพม่าทางตะวันตก
  south: -11, // ประมาณติมอร์ตะวันออกทางใต้
  east: 141, // ประมาณปาปัวนิวกินีทางตะวันออก
  north: 28.5, // ประมาณจีนตอนใต้
};

// ค่าเริ่มต้นของตำแหน่งแผนที่
const INITIAL_LNG = 110; // ลองจิจูดกลางของภูมิภาค
const INITIAL_LAT = 5; // ละติจูดกลางของภูมิภาค
const INITIAL_ZOOM = 4; // ระดับการซูมเริ่มต้น

// ประเทศในภูมิภาคเอเชียตะวันออกเฉียงใต้และพื้นที่ใกล้เคียง
// รายการรหัสประเทศ ISO 3 ตัวอักษรเพื่อใช้ในการกรองและสไตล์แผนที่
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
 * คอมโพเนนต์หลักสำหรับแสดงแผนที่พร้อมอนุภาคลมเคลื่อนไหว
 * ใช้ MapLibre GL JS เป็นไลบรารีแผนที่หลัก และใช้ deck.gl ในการวาดอนุภาคลม
 */
function Map() {
  // สร้าง Ref สำหรับเก็บอ้างอิงถึงอิลิเมนต์แผนที่
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);

  // ขอบเขตแผนที่และข้อมูลลม
  const mapBoundsRef = useRef(SOUTHEAST_ASIA_BOUNDS);

  // สถานะสำหรับแสดงข้อมูลตำแหน่งและระดับการซูมบนหน้าจอ
  const [displayInfo, setDisplayInfo] = useState({
    lng: INITIAL_LNG,
    lat: INITIAL_LAT,
    zoom: INITIAL_ZOOM,
  });
  const [layers, setLayers] = useState<any[]>([]);
  
  // สถานะสำหรับควบคุมการเปิด/ปิด animation
  const [animationEnabled, setAnimationEnabled] = useState(true);

  /**
   * ฟังก์ชันอัพเดตขอบเขตแผนที่ที่มองเห็นในปัจจุบัน
   * จำกัดขอบเขตให้อยู่ในพื้นที่เอเชียตะวันออกเฉียงใต้
   */
  const updateMapBounds = useCallback(() => {
    if (!map.current) return;

    const bounds = map.current.getBounds();

    // ปรับขอบเขตตามการมองเห็นในปัจจุบัน แต่จำกัดให้อยู่ในเอเชียตะวันออกเฉียงใต้
    mapBoundsRef.current = {
      west: Math.max(bounds.getWest(), SOUTHEAST_ASIA_BOUNDS.west),
      south: Math.max(bounds.getSouth(), SOUTHEAST_ASIA_BOUNDS.south),
      east: Math.min(bounds.getEast(), SOUTHEAST_ASIA_BOUNDS.east),
      north: Math.min(bounds.getNorth(), SOUTHEAST_ASIA_BOUNDS.north),
    };

    // อัพเดต deck.gl layers
    updateDeckGLLayers();
  }, []);

  /**
   * อัพเดตเลเยอร์ deck.gl
   */
  const updateDeckGLLayers = useCallback(() => {
    // สร้าง WindLayer ด้วย deck.gl
    const windLayer = createWindLayer({
      bounds: mapBoundsRef.current,
      density: 15,
      lengthScale: 0.5,
      widthScale: 3,
      particleCount: 1500,
      animate: animationEnabled,
      particleSpeed: 0.0075
    });

    // อัพเดต state สำหรับเลเยอร์
    setLayers([windLayer]);

    // อัพเดต deck instance หากมีอยู่แล้ว
    if (deckRef.current) {
      deckRef.current.setProps({ layers: [windLayer] });
    }
  }, [animationEnabled]);

  /**
   * สร้างและเริ่มต้น deck.gl สำหรับการแสดงผลลมแบบมีแอนิเมชัน
   */
  const initializeDeckGL = useCallback(() => {
    if (!map.current || deckRef.current) return;

    // สร้าง WindLayer ด้วย deck.gl
    const windLayer = createWindLayer({
      bounds: mapBoundsRef.current,
      density: 15,
      lengthScale: 0.5,
      widthScale: 3,
      particleCount: 1500,
      animate: animationEnabled,
      particleSpeed: 0.0075
    });

    // อัพเดต state สำหรับเลเยอร์
    setLayers([windLayer]);

    // สร้าง DeckGL instance
    deckRef.current = new Deck({
      canvas: "deck-canvas",
      width: "100%",
      height: "100%",
      controller: false, // ไม่ใช้ตัวควบคุมของ deck.gl (ใช้ของ MapLibre แทน)
      initialViewState: {
        longitude: INITIAL_LNG,
        latitude: INITIAL_LAT,
        zoom: INITIAL_ZOOM,
        pitch: 0,
        bearing: 0,
      },
      onViewStateChange: ({ viewState }: { viewState: any }) => {
        // ซิงค์มุมมองกับ MapLibre
        if (map.current) {
          const { longitude, latitude, zoom, pitch, bearing } = viewState;
          map.current.jumpTo({
            center: [longitude, latitude],
            zoom,
            pitch,
            bearing,
          });
        }
      },
      views: [new MapView({ repeat: true })],
      layers: [windLayer],
      // ซิงค์ข้อมูล MapLibre
      onBeforeRender: ({ gl }: { gl: WebGLRenderingContext }) => {
        if (!map.current) return;
        // ซิงค์มุมมองกับ MapLibre
        const viewport = {
          latitude: map.current.getCenter().lat,
          longitude: map.current.getCenter().lng,
          zoom: map.current.getZoom(),
          bearing: map.current.getBearing(),
          pitch: map.current.getPitch(),
        };

        if (deckRef.current) {
          deckRef.current.setProps({ viewState: viewport });
        }
      },
      glOptions: {
        stencil: true,
      },
    });

    // เพิ่ม listener สำหรับการเปลี่ยนแปลงมุมมองของแผนที่
    map.current.on("move", () => {
      if (deckRef.current && map.current) {
        const viewport = {
          latitude: map.current.getCenter().lat,
          longitude: map.current.getCenter().lng,
          zoom: map.current.getZoom(),
          bearing: map.current.getBearing(),
          pitch: map.current.getPitch(),
        };

        deckRef.current.setProps({ viewState: viewport });
      }
    });
  }, [animationEnabled]);

  /**
   * สร้างและเริ่มต้นแผนที่ MapLibre
   */
  useEffect(() => {
    if (map.current) return; // ไม่สร้างแผนที่ซ้ำถ้ามีอยู่แล้ว
    if (!mapContainer.current) return;

    // Initialize MapLibre map with dark style
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {}, // ไม่มีแหล่งข้อมูลเริ่มต้น
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#000000", // สีดำสำหรับพื้นหลังแผนที่
            },
          },
        ],
        // เพิ่มคุณสมบัติ glyphs เพื่อรองรับการแสดงข้อความ
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      },
      center: [INITIAL_LNG, INITIAL_LAT], // ใช้ค่าคงที่แทน state ที่เปลี่ยนแปลง
      zoom: INITIAL_ZOOM, // ใช้ค่าคงที่แทน state ที่เปลี่ยนแปลง
      maxZoom: 18, // ระดับการซูมสูงสุด
      attributionControl: false, // ไม่แสดงข้อความอ้างอิงแหล่งที่มา
      // ไม่จำกัดขอบเขตการเคลื่อนที่ของแผนที่ เพื่อให้เลื่อนได้ทั่วโลก
    });

    // ตั้งค่า event handlers สำหรับการอัพเดตตำแหน่งแผนที่
    map.current.on("move", () => {
      const center = map.current!.getCenter();
      const zoom = map.current!.getZoom();

      setDisplayInfo({
        lng: parseFloat(center.lng.toFixed(4)),
        lat: parseFloat(center.lat.toFixed(4)),
        zoom: parseFloat(zoom.toFixed(2)),
      });
    });

    // เพิ่มเส้นขอบเขตประเทศ
    map.current.on("load", () => {
      // เพิ่มข้อมูลขอบเขตประเทศทั่วโลกจาก GeoJSON
      fetch(
        "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
      )
        .then((response) => response.json())
        .then((data) => {
          // กรองเฉพาะประเทศในเอเชียตะวันออกเฉียงใต้
          const filteredData = {
            type: "FeatureCollection",
            features: data.features.filter((feature: any) => {
              // แสดงทุกประเทศทั่วโลก แต่เน้นประเทศในเอเชียตะวันออกเฉียงใต้
              return true;
            }),
          };

          // เพิ่มแหล่งข้อมูลประเทศ
          map.current!.addSource("countries", {
            type: "geojson",
            data: filteredData,
          });

          // เพิ่มพื้นที่ประเทศ (ทำให้มองเห็นขอบเขตชัดเจนขึ้น)
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
                "#333333", // สีสำหรับประเทศในเอเชียตะวันออกเฉียงใต้
                "#222222", // สีสำหรับประเทศอื่นๆ
              ],
              "fill-opacity": 0.5,
            },
          });

          // เพิ่มเส้นขอบประเทศ
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
                "#888888", // สีสำหรับประเทศในเอเชียตะวันออกเฉียงใต้ - สว่างกว่า
                "#555555", // สีสำหรับประเทศอื่นๆ - เข้มกว่า
              ],
              "line-width": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                1.5, // ความหนาสำหรับประเทศในเอเชียตะวันออกเฉียงใต้ - หนากว่า
                1, // ความหนาสำหรับประเทศอื่นๆ - บางกว่า
              ],
              "line-opacity": [
                "case",
                [
                  "in",
                  ["get", "ISO_A3"],
                  ["literal", SOUTHEAST_ASIA_COUNTRIES],
                ],
                0.8, // ความโปร่งใสสำหรับประเทศในเอเชียตะวันออกเฉียงใต้ - ชัดเจนกว่า
                0.5, // ความโปร่งใสสำหรับประเทศอื่นๆ - จางกว่า
              ],
            },
          });

          // เพิ่มชื่อประเทศในเอเชียตะวันออกเฉียงใต้
          map.current!.addLayer({
            id: "country-labels",
            type: "symbol",
            source: "countries",
            layout: {
              "text-field": ["get", "ADMIN"], // ใช้ชื่อประเทศจากคุณสมบัติ ADMIN
              "text-font": ["Open Sans Regular"],
              "text-size": 12,
              "text-allow-overlap": false, // ไม่ให้ข้อความทับซ้อนกัน
              "text-ignore-placement": false,
              "text-optional": true, // ข้อความเป็นตัวเลือก (สามารถไม่แสดงได้ถ้าไม่มีพื้นที่)
            },
            paint: {
              "text-color": "#ffffff", // สีข้อความ - ขาว
              "text-halo-color": "#000000", // สีขอบข้อความ - ดำ
              "text-halo-width": 1, // ความหนาของขอบข้อความ
            },
            // กรองให้แสดงเฉพาะชื่อประเทศในเอเชียตะวันออกเฉียงใต้
            filter: [
              "in",
              ["get", "ISO_A3"],
              ["literal", SOUTHEAST_ASIA_COUNTRIES],
            ],
          });

          // เริ่มต้นให้ deck.gl ทำงาน
          initializeDeckGL();
        })
        .catch((error) => {
          console.error("Error loading country boundaries:", error);
        });
    });

    // เพิ่มปุ่มควบคุมการนำทาง
    map.current.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true, // แสดงการควบคุมมุมเอียง
        showCompass: true, // แสดงเข็มทิศ
      }),
      "top-right" // ตำแหน่งของปุ่มควบคุม
    );

    // ทำความสะอาดเมื่อคอมโพเนนต์ถูกทำลาย
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
  }, []); // ไม่ใส่ dependencies เพราะเราต้องการให้ useEffect นี้ทำงานเพียงครั้งเดียวตอนเริ่มต้น

  /**
   * เริ่มแอนิเมชันเมื่อแผนที่พร้อมใช้งาน
   * และตั้งค่าเหตุการณ์ต่างๆ ของแผนที่
   */
  useEffect(() => {
    if (!map.current) return;

    // การทำงานเมื่อแผนที่โหลดเสร็จ
    const onLoad = () => {
      console.log("Map loaded");
      updateMapBounds();
    };

    // เพิ่มตัวจัดการเหตุการณ์
    map.current.on("load", onLoad);

    // เริ่มแอนิเมชันทันทีหากแผนที่โหลดเสร็จแล้ว
    if (map.current.loaded()) {
      onLoad();
    }

    // ทำความสะอาดเมื่อคอมโพเนนต์ถูกทำลาย
    return () => {
      if (map.current) {
        map.current.off("load", onLoad);
      }
    };
  }, [updateMapBounds]);

  return (
    <div>
      {/* แถบข้อมูลด้านบน - แสดงพิกัดและระดับการซูม */}
      <div
        className="sidebar"
        style={{
          background: "rgba(35, 35, 35, 0.8)", // พื้นหลังโปร่งแสง
          color: "white", // สีข้อความ
          padding: "6px 12px", // ระยะห่างขอบ
          borderRadius: "4px", // มุมโค้ง
          position: "absolute", // ตำแหน่งแบบ absolute
          top: "10px", // ห่างจากด้านบน 10px
          left: "10px", // ห่างจากด้านซ้าย 10px
          zIndex: 1, // ชั้นซ้อนทับ
          fontFamily: "monospace", // รูปแบบตัวอักษร
        }}
      >
        Longitude: {displayInfo.lng} | Latitude: {displayInfo.lat} | Zoom: {displayInfo.zoom}
      </div>

      {/* ปุ่มเปิด/ปิด Animation แบบ Toggle */}
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
          
          {/* Toggle Switch */}
          <div
            onClick={() => {
              // เปลี่ยน state ก่อน
              const newState = !animationEnabled;
              setAnimationEnabled(newState);
              
              // จากนั้นค่อยสร้าง layer ใหม่และอัพเดต Deck ด้วย state ใหม่
              const windLayer = createWindLayer({
                bounds: mapBoundsRef.current,
                density: 15,
                lengthScale: 0.5,
                widthScale: 3,
                particleCount: 1500,
                animate: newState,
                particleSpeed: 0.0075
              });
              
              setLayers([windLayer]);
              
              // อัพเดต deck instance ทันทีถ้ามี
              if (deckRef.current) {
                deckRef.current.setProps({ layers: [windLayer] });
              }
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
            {/* ปุ่มเลื่อน */}
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
      </div>

      {/* คอนเทนเนอร์แผนที่หลัก */}
      <div
        ref={mapContainer}
        className="map-container"
        style={{ width: "100%", height: "100vh", position: "relative" }}
      />

      {/* Canvas สำหรับ deck.gl */}
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

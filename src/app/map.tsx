"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  generateMockWindData,
  getWindColor,
  WindPoint,
} from "../data/mockWindData";

// ประกาศชนิดข้อมูลสำหรับอนุภาคลม
// อนุภาคลมเป็นวัตถุที่แสดงการเคลื่อนที่ของลมบนแผนที่
type WindParticle = {
  x: number;        // ตำแหน่ง x บนหน้าจอ (พิกเซล)
  y: number;        // ตำแหน่ง y บนหน้าจอ (พิกเซล)
  lng: number;      // ลองจิจูดทางภูมิศาสตร์
  lat: number;      // ละติจูดทางภูมิศาสตร์
  age: number;      // อายุปัจจุบันของอนุภาค (นับเป็นเฟรม)
  maxAge: number;   // อายุสูงสุดของอนุภาคก่อนที่จะถูกสร้างใหม่
  speed: number;    // ความเร็วของอนุภาค
  direction: number; // ทิศทางการเคลื่อนที่ (หน่วยเป็น radians)
};

// ขอบเขตภูมิภาคเอเชียตะวันออกเฉียงใต้ (South East Asia)
// กำหนดพิกัดขอบเขตเพื่อจำกัดการแสดงผลและการสร้างอนุภาคเฉพาะในภูมิภาค
const SOUTHEAST_ASIA_BOUNDS = {
  west: 92,    // ประมาณพม่าทางตะวันตก
  south: -11,  // ประมาณติมอร์ตะวันออกทางใต้
  east: 141,   // ประมาณปาปัวนิวกินีทางตะวันออก
  north: 28.5, // ประมาณจีนตอนใต้
};

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
 * ใช้ MapLibre GL JS เป็นไลบรารีแผนที่หลัก และใช้ Canvas API ในการวาดอนุภาคลม
 */
function Map() {
  // สร้าง Ref สำหรับเก็บอ้างอิงถึงอิลิเมนต์แผนที่
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Animation related refs - ใช้ useRef เพื่อเก็บค่าที่ต้องใช้ในฟังก์ชันแอนิเมชัน
  // ไม่ใช้ state เพราะไม่ต้องการให้การเปลี่ยนแปลงค่าทำให้คอมโพเนนต์เรนเดอร์ใหม่
  const animationRef = useRef<number | null>(null);   // เก็บ ID ของ requestAnimationFrame
  const particlesRef = useRef<WindParticle[]>([]);    // เก็บข้อมูลอนุภาคทั้งหมด
  const windDataRef = useRef<WindPoint[]>([]);        // เก็บข้อมูลลมที่ใช้ในการคำนวณ
  const mapBoundsRef = useRef(SOUTHEAST_ASIA_BOUNDS); // เก็บขอบเขตปัจจุบันของแผนที่

  // สถานะสำหรับแสดงข้อมูลตำแหน่งและระดับการซูมบนหน้าจอ
  // เริ่มต้นที่ตำแหน่งกลางของภูมิภาคเอเชียตะวันออกเฉียงใต้
  const [lng, setLng] = useState(110); // ลองจิจูดกลางของภูมิภาค
  const [lat, setLat] = useState(5);   // ละติจูดกลางของภูมิภาค
  const [zoom, setZoom] = useState(4); // ระดับการซูมเริ่มต้น - ซูมให้เห็นทั้งภูมิภาค

  /**
   * ฟังก์ชันตรวจสอบว่าพิกัดอยู่ในเอเชียตะวันออกเฉียงใต้หรือไม่
   * ใช้สำหรับคัดกรองอนุภาคให้แสดงเฉพาะในพื้นที่ที่สนใจ
   */
  const isInSoutheastAsia = useCallback((lng: number, lat: number): boolean => {
    return (
      lng >= SOUTHEAST_ASIA_BOUNDS.west &&
      lng <= SOUTHEAST_ASIA_BOUNDS.east &&
      lat >= SOUTHEAST_ASIA_BOUNDS.south &&
      lat <= SOUTHEAST_ASIA_BOUNDS.north
    );
  }, []);

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
  }, []);

  /**
   * สร้างอนุภาคลมสำหรับแอนิเมชันเฉพาะในพื้นที่เอเชียตะวันออกเฉียงใต้
   * อนุภาคเหล่านี้จะแสดงการเคลื่อนที่ของลมบนแผนที่
   * @param windData ข้อมูลทิศทางและความเร็วลม
   * @param width ความกว้างของพื้นที่แสดงผล
   * @param height ความสูงของพื้นที่แสดงผล
   * @param count จำนวนอนุภาคที่ต้องการสร้าง (ค่าเริ่มต้น 1200)
   */
  const createWindParticles = useCallback(
    (
      windData: WindPoint[],
      width: number,
      height: number,
      count: number = 1200
    ) => {
      if (!map.current || windData.length === 0) return [];

      const particles: WindParticle[] = [];
      let attempts = 0;
      const maxAttempts = count * 3; // เพิ่มจำนวนครั้งที่พยายามเพื่อให้ได้อนุภาคเพียงพอ

      // สร้างอนุภาคที่มีตำแหน่งสุ่มทั่วแผนที่
      while (particles.length < count && attempts < maxAttempts) {
        attempts++;

        // สุ่มตำแหน่งบนหน้าจอ
        const x = Math.random() * width;
        const y = Math.random() * height;

        try {
          // แปลงจากพิกัดหน้าจอเป็นตำแหน่ง Lng/Lat
          const lngLat = map.current.unproject([x, y]);
          const lng = lngLat.lng;
          const lat = lngLat.lat;

          // ตรวจสอบว่าอยู่ในพื้นที่เอเชียตะวันออกเฉียงใต้หรือไม่
          if (!isInSoutheastAsia(lng, lat)) {
            continue; // ข้ามไปถ้าไม่ได้อยู่ในเอเชียตะวันออกเฉียงใต้
          }

          // หาข้อมูลลมที่ใกล้ที่สุดสำหรับตำแหน่งนี้
          let closestWindPoint = windData[0];
          let minDistance = Number.MAX_VALUE;

          for (const point of windData) {
            const dx = point.position[0] - lng;
            const dy = point.position[1] - lat;
            const distance = dx * dx + dy * dy; // ระยะทางยกกำลังสอง (ไม่ต้องใช้รากที่สอง เพื่อประสิทธิภาพ)

            if (distance < minDistance) {
              minDistance = distance;
              closestWindPoint = point;
            }
          }

          // อายุสูงสุดของอนุภาคที่สุ่ม
          const maxAge = 60 + Math.random() * 60;

          // เพิ่มอนุภาคใหม่ลงในรายการ
          particles.push({
            x,
            y,
            lng,
            lat,
            age: Math.random() * maxAge, // เริ่มด้วยอายุที่สุ่มเพื่อให้อนุภาครีเซ็ตไม่พร้อมกัน
            maxAge,
            speed: closestWindPoint.speed * 1.5, // ปรับความเร็วให้เห็นการเคลื่อนไหวชัดเจนขึ้น
            direction: closestWindPoint.direction, // ทิศทางตามข้อมูลลมที่ใกล้ที่สุด
          });
        } catch (e) {
          // ป้องกันข้อผิดพลาดจาก unproject
          continue;
        }
      }

      console.log(
        `Created ${particles.length} particles in Southeast Asia after ${attempts} attempts`
      );
      return particles;
    },
    [isInSoutheastAsia]
  );

  /**
   * อัพเดตตำแหน่งอนุภาคสำหรับแต่ละเฟรม - รักษาให้อยู่ในเอเชียตะวันออกเฉียงใต้
   * ฟังก์ชันนี้จะถูกเรียกในทุกเฟรมของแอนิเมชันเพื่อเคลื่อนที่อนุภาคและรีเซ็ตเมื่อจำเป็น
   */
  const updateParticles = useCallback(
    (
      particles: WindParticle[],
      windData: WindPoint[],
      width: number,
      height: number
    ): WindParticle[] => {
      if (!map.current || windData.length === 0) return particles;

      return particles.map((particle) => {
        try {
          // เคลื่อนที่อนุภาคตามทิศทางและความเร็ว - ลดความเร็วลงครึ่งหนึ่ง จาก 0.6 เป็น 0.3
          particle.x += Math.cos(particle.direction) * particle.speed * 0.3;
          particle.y += Math.sin(particle.direction) * particle.speed * 0.3;
          particle.age++;

          // อัพเดตพิกัด lng/lat จากตำแหน่งบนหน้าจอ
          const lngLat = map.current!.unproject([particle.x, particle.y]);
          particle.lng = lngLat.lng;
          particle.lat = lngLat.lat;

          // ตรวจสอบว่าอนุภาคยังอยู่ในพื้นที่เอเชียตะวันออกเฉียงใต้หรือไม่
          const isOutOfBounds = !isInSoutheastAsia(particle.lng, particle.lat);

          // ถ้าอนุภาคแก่เกินไปหรือออกจากขอบเขตหน้าจอหรือออกจากเอเชียตะวันออกเฉียงใต้ ให้รีเซ็ต
          if (
            particle.age >= particle.maxAge ||
            particle.x < -20 ||
            particle.x > width + 20 ||
            particle.y < -20 ||
            particle.y > height + 20 ||
            isOutOfBounds
          ) {
            // พยายามสร้างอนุภาคใหม่ภายในเอเชียตะวันออกเฉียงใต้
            let validPosition = false;
            let attempts = 0;
            const maxAttempts = 10; // จำกัดการลองเพื่อไม่ให้ติดลูปอนันต์

            while (!validPosition && attempts < maxAttempts) {
              attempts++;

              // สุ่มตำแหน่งใหม่บนหน้าจอ
              const newX = Math.random() * width;
              const newY = Math.random() * height;

              try {
                // แปลงจากพิกัดหน้าจอเป็นตำแหน่ง Lng/Lat
                const lngLat = map.current!.unproject([newX, newY]);
                const newLng = lngLat.lng;
                const newLat = lngLat.lat;

                // ตรวจสอบว่าตำแหน่งใหม่อยู่ในพื้นที่เอเชียตะวันออกเฉียงใต้หรือไม่
                if (isInSoutheastAsia(newLng, newLat)) {
                  validPosition = true;

                  // หาข้อมูลลมที่ใกล้ที่สุด
                  let closestWindPoint = windData[0];
                  let minDistance = Number.MAX_VALUE;

                  for (const point of windData) {
                    const dx = point.position[0] - newLng;
                    const dy = point.position[1] - newLat;
                    const distance = dx * dx + dy * dy;

                    if (distance < minDistance) {
                      minDistance = distance;
                      closestWindPoint = point;
                    }
                  }

                  // สร้างอนุภาคใหม่
                  particle = {
                    x: newX,
                    y: newY,
                    lng: newLng,
                    lat: newLat,
                    age: 0,
                    maxAge: 60 + Math.random() * 60,
                    speed: closestWindPoint.speed * 1.5,
                    direction: closestWindPoint.direction,
                  };
                }
              } catch (e) {
                // ป้องกันข้อผิดพลาดจาก unproject
                continue;
              }
            }

            // ถ้าไม่สามารถหาตำแหน่งที่เหมาะสมได้ ให้สร้างอนุภาคในพื้นที่เอเชียตะวันออกเฉียงใต้โดยตรง
            if (!validPosition) {
              // สุ่มพิกัดในเอเชียตะวันออกเฉียงใต้
              const newLng =
                SOUTHEAST_ASIA_BOUNDS.west +
                Math.random() *
                  (SOUTHEAST_ASIA_BOUNDS.east - SOUTHEAST_ASIA_BOUNDS.west);
              const newLat =
                SOUTHEAST_ASIA_BOUNDS.south +
                Math.random() *
                  (SOUTHEAST_ASIA_BOUNDS.north - SOUTHEAST_ASIA_BOUNDS.south);

              try {
                // แปลงจากพิกัด Lng/Lat เป็นตำแหน่งบนหน้าจอ
                const point = map.current!.project([newLng, newLat]);
                const newX = point.x;
                const newY = point.y;

                // หาข้อมูลลมที่ใกล้ที่สุด
                let closestWindPoint = windData[0];
                let minDistance = Number.MAX_VALUE;

                for (const point of windData) {
                  const dx = point.position[0] - newLng;
                  const dy = point.position[1] - newLat;
                  const distance = dx * dx + dy * dy;

                  if (distance < minDistance) {
                    minDistance = distance;
                    closestWindPoint = point;
                  }
                }

                // สร้างอนุภาคใหม่
                particle = {
                  x: newX,
                  y: newY,
                  lng: newLng,
                  lat: newLat,
                  age: 0,
                  maxAge: 60 + Math.random() * 60,
                  speed: closestWindPoint.speed * 1.5,
                  direction: closestWindPoint.direction,
                };
              } catch (e) {
                // ป้องกันข้อผิดพลาดจาก project
                // เก็บอนุภาคเดิมไว้ แต่รีเซ็ตอายุ
                particle.age = 0;
              }
            }
          }

          return particle;
        } catch (e) {
          // ป้องกันข้อผิดพลาดจาก unproject
          return particle;
        }
      });
    },
    [isInSoutheastAsia]
  );

  /**
   * อนิเมชันหลักสำหรับการวาดอนุภาคลม
   * ฟังก์ชันนี้จะถูกเรียกซ้ำในทุกเฟรมด้วย requestAnimationFrame
   */
  const animateParticles = useCallback(() => {
    if (!map.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ล้าง Canvas ด้วยพื้นหลังโปร่งใสในแต่ละเฟรม
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // สร้างอนุภาคหากยังไม่มี
    if (particlesRef.current.length === 0 && windDataRef.current.length > 0) {
      particlesRef.current = createWindParticles(
        windDataRef.current,
        canvas.width,
        canvas.height,
        600 // ลดจำนวนอนุภาคลงจาก 1200 เหลือ 600 ตัวเพื่อปรับปรุงประสิทธิภาพ
      );
      console.log("Created particles:", particlesRef.current.length);
    }

    // อัพเดตตำแหน่งอนุภาค
    if (particlesRef.current.length > 0) {
      particlesRef.current = updateParticles(
        particlesRef.current,
        windDataRef.current,
        canvas.width,
        canvas.height
      );
    }

    // วาดอนุภาคทั้งหมด - กำหนดความหนาของเส้น
    ctx.lineWidth = 3.5; // เพิ่มความหนาของเส้นจาก 2 เป็น 3.5 เพื่อให้มองเห็นได้ชัดเจนขึ้น

    particlesRef.current.forEach((particle) => {
      // กำหนดความยาวเส้นตามความเร็วลม - เพิ่มความยาวเส้น
      const trailLength = particle.speed * 6; // เพิ่มความยาวเส้นจาก 3.5 เป็น 6

      // คำนวณจุดปลายเส้น
      const endX = particle.x - Math.cos(particle.direction) * trailLength;
      const endY = particle.y - Math.sin(particle.direction) * trailLength;

      // กำหนดสีตามความเร็วและความโปร่งแสงตามอายุ
      const [r, g, b] = getWindColor(particle.speed / 3);
      // เพิ่มความทึบให้มากขึ้นจาก 0.7 เป็น 0.95 เพื่อให้มองเห็นชัดเจนขึ้น
      const alpha = Math.max(0, 1 - particle.age / particle.maxAge) * 0.95; 
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      // วาดเส้นลูกศรลม
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // วาดจุดเพื่อแสดงหัวลูกศร
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha + 0.1})`;
      ctx.fill();
    });

    // ทำงานต่อเนื่องในเฟรมถัดไปโดยใช้ requestAnimationFrame
    animationRef.current = requestAnimationFrame(animateParticles);
  }, [createWindParticles, updateParticles]);

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
      center: [lng, lat], // ตำแหน่งเริ่มต้นจากสถานะ
      zoom: zoom,         // ระดับการซูมเริ่มต้นจากสถานะ
      maxZoom: 18,        // ระดับการซูมสูงสุด
      attributionControl: false, // ไม่แสดงข้อความอ้างอิงแหล่งที่มา
      // ไม่จำกัดขอบเขตการเคลื่อนที่ของแผนที่ เพื่อให้เลื่อนได้ทั่วโลก
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
                1,   // ความหนาสำหรับประเทศอื่นๆ - บางกว่า
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
              "text-allow-overlap": false,  // ไม่ให้ข้อความทับซ้อนกัน
              "text-ignore-placement": false,
              "text-optional": true,        // ข้อความเป็นตัวเลือก (สามารถไม่แสดงได้ถ้าไม่มีพื้นที่)
            },
            paint: {
              "text-color": "#ffffff",      // สีข้อความ - ขาว
              "text-halo-color": "#000000", // สีขอบข้อความ - ดำ
              "text-halo-width": 1,         // ความหนาของขอบข้อความ
            },
            // กรองให้แสดงเฉพาะชื่อประเทศในเอเชียตะวันออกเฉียงใต้
            filter: ["in", ["get", "ISO_A3"], ["literal", SOUTHEAST_ASIA_COUNTRIES]],
          });
        })
        .catch((error) => {
          console.error("Error loading country boundaries:", error);
        });
    });

    // เพิ่มปุ่มควบคุมการนำทาง
    map.current.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true, // แสดงการควบคุมมุมเอียง
        showCompass: true,    // แสดงเข็มทิศ
      }),
      "top-right" // ตำแหน่งของปุ่มควบคุม
    );

    // ทำความสะอาดเมื่อคอมโพเนนต์ถูกทำลาย
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [lng, lat, zoom]);

  /**
   * สร้าง Canvas สำหรับวาดอนุภาคลม
   * Canvas นี้จะถูกวางทับบนแผนที่และใช้สำหรับการแสดงแอนิเมชัน
   */
  useEffect(() => {
    if (!map.current) return;

    // สร้าง Canvas สำหรับวาดอนุภาคลม
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";  // Canvas ไม่รับเหตุการณ์จากเมาส์ (ให้แผนที่ด้านล่างรับแทน)
    canvas.style.zIndex = "10";           // Canvas อยู่เหนือแผนที่

    // เพิ่ม Canvas เข้าในคอนเทนเนอร์
    if (mapContainer.current) {
      mapContainer.current.appendChild(canvas);
      canvasRef.current = canvas;

      // กำหนดขนาด Canvas ให้ตรงกับขนาดของคอนเทนเนอร์
      const resizeCanvas = () => {
        if (!mapContainer.current) return;

        const { width, height } = mapContainer.current.getBoundingClientRect();
        canvas.width = width;
        canvas.height = height;

        // รีเซ็ตอนุภาคเมื่อมีการปรับขนาด
        particlesRef.current = [];

        // สร้างข้อมูลลมใหม่ - ใช้ค่าจาก ref แทนการใช้ค่าจาก state
        const windData = generateMockWindData(mapBoundsRef.current, 15);
        windDataRef.current = windData;
        console.log("Generated wind data:", windData.length);
      };

      // ตั้งค่าเริ่มต้น
      resizeCanvas();

      // รับรู้การเปลี่ยนแปลงขนาดหน้าต่าง
      window.addEventListener("resize", resizeCanvas);

      // ทำความสะอาดเมื่อคอมโพเนนต์ถูกทำลาย
      return () => {
        window.removeEventListener("resize", resizeCanvas);
        if (
          mapContainer.current &&
          canvas.parentNode === mapContainer.current
        ) {
          mapContainer.current.removeChild(canvas);
        }
        canvasRef.current = null;

        // ยกเลิกแอนิเมชัน
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }
  }, []);

  /**
   * เริ่มแอนิเมชันเมื่อแผนที่พร้อมใช้งาน
   * และตั้งค่าเหตุการณ์ต่างๆ ของแผนที่
   */
  useEffect(() => {
    if (!map.current) return;

    // การทำงานเมื่อแผนที่โหลดเสร็จ
    const onLoad = () => {
      console.log("Map loaded, starting animation");
      updateMapBounds();

      // สร้างข้อมูลลมเริ่มต้น - ใช้ค่าจาก ref แทน
      const windData = generateMockWindData(mapBoundsRef.current, 15);
      windDataRef.current = windData;
      console.log("Initial wind data:", windData.length);

      // เริ่มแอนิเมชัน
      if (animationRef.current === null) {
        console.log("Starting animation");
        animationRef.current = requestAnimationFrame(animateParticles);
      }
    };

    // การทำงานเมื่อแผนที่มีการเคลื่อนที่หรือซูม
    const onMoveEnd = () => {
      if (!map.current) return;

      // อัพเดตสถานะตำแหน่งและระดับการซูม
      const center = map.current.getCenter();
      setLng(parseFloat(center.lng.toFixed(4)));
      setLat(parseFloat(center.lat.toFixed(4)));
      setZoom(parseFloat(map.current.getZoom().toFixed(2)));

      // อัพเดตขอบเขตแผนที่
      updateMapBounds();

      // รีเซ็ตอนุภาคเมื่อแผนที่เคลื่อนที่
      particlesRef.current = [];

      // อัพเดตข้อมูลลมสำหรับพื้นที่ใหม่ - ใช้ค่าจาก ref แทน
      const windData = generateMockWindData(mapBoundsRef.current, 15);
      windDataRef.current = windData;
    };

    // เพิ่มตัวจัดการเหตุการณ์
    map.current.on("load", onLoad);
    map.current.on("moveend", onMoveEnd);
    map.current.on("zoomend", onMoveEnd);

    // เริ่มแอนิเมชันทันทีหากแผนที่โหลดเสร็จแล้ว
    if (map.current.loaded()) {
      onLoad();
    }

    // ทำความสะอาดเมื่อคอมโพเนนต์ถูกทำลาย
    return () => {
      if (map.current) {
        map.current.off("load", onLoad);
        map.current.off("moveend", onMoveEnd);
        map.current.off("zoomend", onMoveEnd);
      }

      // ยกเลิกแอนิเมชัน
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [updateMapBounds, animateParticles]);

  return (
    <div>
      {/* แถบข้อมูลด้านบน - แสดงพิกัดและระดับการซูม */}
      <div
        className="sidebar"
        style={{
          background: "rgba(35, 35, 35, 0.8)", // พื้นหลังโปร่งแสง
          color: "white",                      // สีข้อความ
          padding: "6px 12px",                 // ระยะห่างขอบ
          borderRadius: "4px",                 // มุมโค้ง
          position: "absolute",                // ตำแหน่งแบบ absolute
          top: "10px",                         // ห่างจากด้านบน 10px
          left: "10px",                        // ห่างจากด้านซ้าย 10px
          zIndex: 1,                           // ชั้นซ้อนทับ
          fontFamily: "monospace",             // รูปแบบตัวอักษร
        }}
      >
        Longitude: {lng} | Latitude: {lat} | Zoom: {zoom}
      </div>
      
      {/* คอนเทนเนอร์แผนที่หลัก */}
      <div
        ref={mapContainer}
        className="map-container"
        style={{ width: "100%", height: "100vh", position: "relative" }}
      />
    </div>
  );
}

export default Map;

"use client";

import React, { useMemo } from 'react';
import { PathLayer } from '@deck.gl/layers';
import { generateMockWindData, getWindColor, WindPoint } from '../data/mockWindData';

// กำหนด props สำหรับคอมโพเนนต์ WindLayer
type WindLayerProps = {
  bounds: {
    west: number;    // ขอบเขตด้านตะวันตกของพื้นที่ (longitude)
    south: number;   // ขอบเขตด้านใต้ของพื้นที่ (latitude)
    east: number;    // ขอบเขตด้านตะวันออกของพื้นที่ (longitude)
    north: number;   // ขอบเขตด้านเหนือของพื้นที่ (latitude)
  };
  density?: number;   // ความหนาแน่นของจุดลม (จำนวนจุดต่อแกน)
  lengthScale?: number;  // ค่าปรับขนาดความยาวของลูกศรลม
  widthScale?: number;   // ค่าปรับขนาดความกว้างของลูกศรลม
};

// สร้าง WindLayer เป็นฟังก์ชันที่นำกลับไปใช้ซ้ำได้ซึ่งจะสร้าง PathLayer
// ฟังก์ชันนี้สร้างเลเยอร์ที่แสดงลูกศรลมบนแผนที่ Deck.gl
export const createWindLayer = ({
  bounds,
  density = 25,      // ค่าเริ่มต้นความหนาแน่นของจุดลม
  lengthScale = 0.2, // ค่าเริ่มต้นความยาวของลูกศรลม
  widthScale = 2     // ค่าเริ่มต้นความกว้างของลูกศรลม
}: WindLayerProps) => {
  // สร้างข้อมูลลมจำลองโดยใช้ขอบเขตพื้นที่และความหนาแน่นที่กำหนด
  const windData = generateMockWindData(bounds, density);

  // ส่งคืน PathLayer ที่แสดงลูกศรลม
  // PathLayer เป็นเลเยอร์ของ deck.gl ที่วาดเส้นทางเชื่อมต่อจุด
  return new PathLayer({
    id: 'wind-layer',      // ID ของเลเยอร์สำหรับอ้างอิง
    data: windData,        // ข้อมูลที่ใช้ในการแสดงผล
    pickable: false,       // ไม่สามารถเลือกได้ (ไม่มีปฏิสัมพันธ์กับผู้ใช้)
    widthScale,            // ความกว้างของลูกศรลม
    widthMinPixels: 1,     // ความกว้างขั้นต่ำในหน่วยพิกเซล
    getPath: (d: WindPoint) => {
      // สร้างเส้นทางลูกศรจากตำแหน่งจุดลมและทิศทาง
      const [x, y] = d.position;                     // ตำแหน่งต้นทาง
      const length = d.speed * lengthScale;          // คำนวณความยาวลูกศรตามความเร็ว
      const endX = x + Math.cos(d.direction) * length; // จุดปลายตามทิศทางลม (X)
      const endY = y + Math.sin(d.direction) * length; // จุดปลายตามทิศทางลม (Y)
      return [
        [x, y],      // จุดเริ่มต้นของเส้น
        [endX, endY] // จุดสิ้นสุดของเส้น
      ];
    },
    getColor: (d: WindPoint) => [...getWindColor(d.speed), 200], // กำหนดสีตามความเร็วลมและค่าความโปร่งใส
    getWidth: (d: WindPoint) => d.speed * 3                      // กำหนดความกว้างของเส้นตามความเร็วลม
  });
};

// คอมโพเนนต์ React ที่ไม่แสดงอะไรเลย เป็นเพียงโครงสร้างเปล่าสำหรับความเข้ากันได้
// (ใช้สำหรับโครงสร้างรหัสเท่านั้น - ฟังก์ชันจริงคือ createWindLayer ข้างบน)
const WindLayer: React.FC<WindLayerProps> = () => {
  // คอมโพเนนต์นี้ไม่ได้แสดงผลใดๆ - เป็นเพียง API เท่านั้น
  return null;
};

export default WindLayer;

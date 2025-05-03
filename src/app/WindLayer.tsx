"use client";

import React, { useMemo } from 'react';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { CompositeLayer, CompositeLayerProps, Layer, UpdateParameters } from '@deck.gl/core';
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
  particleCount?: number; // จำนวนอนุภาคที่ใช้ในการแสดงผล
  animate?: boolean;  // เปิด/ปิดการเคลื่อนไหว
  particleSpeed?: number; // ความเร็วของอนุภาค
};

// Define WindParticleLayer props type
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
  id?: string;
};

// นิยาม ParticleType สำหรับเก็บข้อมูลอนุภาคการเคลื่อนไหว
type ParticleType = {
  position: [number, number]; // ตำแหน่ง [longitude, latitude]
  direction: number;         // ทิศทางการเคลื่อนที่ (radians)
  speed: number;             // ความเร็วการเคลื่อนที่
  age: number;               // อายุปัจจุบันของอนุภาค
  maxAge: number;            // อายุสูงสุดก่อนที่จะถูกสร้างใหม่
  size: number;              // ขนาดของอนุภาค
  color: [number, number, number, number]; // สี RGBA
};

// สร้าง Layer กำหนดเองสำหรับแสดงอนุภาคลม
class WindParticleLayer extends CompositeLayer<WindParticleLayerProps> {
  static layerName = 'WindParticleLayer';
  static defaultProps = {
    particleCount: 1000,
    animate: true,
    particleSpeed: 0.02,
    fadeOpacity: 0.996, // ค่าการจางหายของการเคลื่อนไหว (ยิ่งมากยิ่งหายช้า)
  };

  // Add property declaration for animationFrame
  animationFrame: number | null = null;

  state = {
    particles: [] as ParticleType[],
    timestamp: 0,
    windData: [] as WindPoint[],
  };

  initializeState() {
    // สร้างข้อมูลลมและอนุภาคเมื่อเริ่มต้น
    const { bounds, density = 20 } = this.props;
    const windData = generateMockWindData(bounds, density);
    this.setState({ 
      windData,
      particles: this.generateParticles(windData)
    });
    
    // ตั้งค่า animation loop
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }

  finalizeState() {
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  shouldUpdateState(params: UpdateParameters<Layer<WindParticleLayerProps & Required<CompositeLayerProps>>>) {
    const { changeFlags } = params;
    return Boolean(changeFlags.propsChanged) || 
           Boolean(changeFlags.viewportChanged) || 
           Boolean(changeFlags.dataChanged);
  }
  
  // สร้างอนุภาคในบริเวณที่กำหนด
  generateParticles(windData: WindPoint[]) {
    const { particleCount = 1000 } = this.props;
    const { bounds } = this.props;
    
    const particles: ParticleType[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      // สุ่มตำแหน่งภายในขอบเขตที่กำหนด
      const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
      const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
      
      // หาข้อมูลลมที่ใกล้ที่สุด
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
      
      // สุ่มอายุอนุภาค
      const maxAge = 50 + Math.random() * 50;
      
      const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
      
      particles.push({
        position: [longitude, latitude],
        direction: closestWindPoint.direction,
        speed: closestWindPoint.speed,
        age: Math.random() * maxAge,
        maxAge,
        size: 6 + closestWindPoint.speed * 15, // ลดขนาด 50% จาก (12 + speed * 30) เป็น (6 + speed * 15)
        color
      });
    }
    
    return particles;
  }
  
  // เคลื่อนที่อนุภาคตามทิศทางและความเร็ว
  updateParticles() {
    const { animate, particleSpeed = 0.0075, bounds } = this.props; // ลดความเร็วลง 50% จาก 0.015 เป็น 0.0075
    const { particles, windData } = this.state;
    
    if (!animate || particles.length === 0) return particles;
    
    return particles.map(particle => {
      // เพิ่มอายุ
      particle.age += 1;
      
      // ถ้าอนุภาคหมดอายุ สร้างใหม่
      if (particle.age >= particle.maxAge) {
        // สุ่มตำแหน่งใหม่
        const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
        const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
        
        // หาข้อมูลลมที่ใกล้ที่สุด
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
        
        const maxAge = 50 + Math.random() * 50;
        const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
        
        return {
          position: [longitude, latitude],
          direction: closestWindPoint.direction,
          speed: closestWindPoint.speed,
          age: 0,
          maxAge,
          size: 6 + closestWindPoint.speed * 15, // ลดขนาดลง 50% จาก (12 + speed * 30)
          color
        };
      } else {
        // เคลื่อนที่อนุภาคตามทิศทางและความเร็ว
        const speed = particle.speed * particleSpeed;
        const x = particle.position[0] + Math.cos(particle.direction) * speed;
        const y = particle.position[1] + Math.sin(particle.direction) * speed;
        
        // ตรวจสอบว่าอนุภาคยังอยู่ในขอบเขตหรือไม่
        if (x < bounds.west || x > bounds.east || y < bounds.south || y > bounds.north) {
          // ถ้าออกนอกขอบเขต ให้รีเซ็ตอายุเพื่อสร้างใหม่ในรอบถัดไป
          particle.age = particle.maxAge;
          return particle;
        }
        
        // อัพเดตค่าความโปร่งใสตามอายุ
        const opacityFactor = 1 - particle.age / particle.maxAge;
        particle.color[3] = 200 * opacityFactor;
        
        // อัพเดตตำแหน่ง
        particle.position = [x, y];
        
        return particle;
      }
    });
  }
  
  animate() {
    if (this.props.animate) {
      // อัพเดตอนุภาค
      const updatedParticles = this.updateParticles();
      this.setState({ 
        timestamp: Date.now(),
        particles: updatedParticles 
      });
    }
    
    // ทำการเคลื่อนไหวต่อในเฟรมถัดไป
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }
  
  renderLayers() {
    const { particles } = this.state;
    const { widthScale = 3, animate } = this.props;
    
    // เมื่อ animation ถูกปิด ให้แสดงลูกศรทิศทางลมแทน
    if (!animate) {
      // ใช้ข้อมูลลมโดยตรงเพื่อแสดงลูกศรทิศทางลม
      return [
        new PathLayer({
          id: `${this.props.id}-wind-arrows`,
          data: this.state.windData,
          pickable: false,
          widthMinPixels: 2.25,
          getPath: (d: WindPoint) => {
            const [x, y] = d.position;
            // คำนวณจุดปลายของลูกศร
            const length = 0.5; // ความยาวของเส้นลูกศร
            const endX = x + Math.cos(d.direction) * length;
            const endY = y + Math.sin(d.direction) * length;
            
            // คำนวณจุดสำหรับหัวลูกศร (แก้ไขให้เป็นลูกศรที่ถูกต้อง)
            const arrowSize = 0.15; // ขนาดของหัวลูกศร
            const arrowAngle = Math.PI / 6; // มุม 30 องศาสำหรับหัวลูกศร
            
            // คำนวณจุดด้านซ้ายของหัวลูกศร (เริ่มจากปลายลูกศร)
            const leftX = endX - arrowSize * Math.cos(d.direction + arrowAngle);
            const leftY = endY - arrowSize * Math.sin(d.direction + arrowAngle);
            
            // คำนวณจุดด้านขวาของหัวลูกศร (เริ่มจากปลายลูกศร)
            const rightX = endX - arrowSize * Math.cos(d.direction - arrowAngle);
            const rightY = endY - arrowSize * Math.sin(d.direction - arrowAngle);
            
            // เส้นทางที่สร้างเป็นลูกศรที่ถูกต้อง
            // จุดเริ่มต้น -> จุดปลาย -> จุดด้านซ้ายของหัวลูกศร -> จุดปลาย -> จุดด้านขวาของหัวลูกศร
            return [
              [x, y],          // จุดเริ่มต้น
              [endX, endY],    // จุดปลาย
              [leftX, leftY],  // ส่วนด้านซ้ายของหัวลูกศร
              [endX, endY],    // กลับมาที่จุดปลาย
              [rightX, rightY] // ส่วนด้านขวาของหัวลูกศร
            ];
          },
          getColor: (d: WindPoint) => {
            const [r, g, b] = getWindColor(d.speed);
            return [r, g, b, 200]; // กำหนดความโปร่งใสให้กับเส้นลูกศร
          },
          getWidth: (d: WindPoint) => d.speed * 3 + 1, // ความหนาของเส้นตามความเร็วลม
        })
      ];
    }
    
    // กรณีเปิด animation แสดงอนุภาคเคลื่อนไหวตามปกติ
    return [
      new ScatterplotLayer({
        id: `${this.props.id}-particles`,
        data: particles,
        pickable: false,
        opacity: 1,
        stroked: false,
        filled: true,
        radiusScale: widthScale * 1.5, // ลดลง 50% จาก widthScale * 3
        getPosition: (d: ParticleType) => d.position,
        getRadius: (d: ParticleType) => d.size * 1.2, // ใช้ size ที่ลดขนาดแล้ว
        getFillColor: (d: ParticleType) => d.color,
        getLineColor: [255, 255, 255],
        updateTriggers: {
          getPosition: this.state.timestamp,
          getFillColor: this.state.timestamp,
        }
      }),
      
      // เลเยอร์ลากเส้นจากตำแหน่งอนุภาค
      new PathLayer({
        id: `${this.props.id}-trails`,
        data: particles,
        pickable: false,
        widthMinPixels: 2.25, // ลดลง 50% จาก 4.5
        getPath: (d: ParticleType) => {
          const [x, y] = d.position;
          // เพิ่มความยาวของเส้นทาง
          const length = d.speed * 0.45; // เพิ่มความยาวขึ้น 2 เท่า จาก 0.225 เป็น 0.45
          const endX = x - Math.cos(d.direction) * length;
          const endY = y - Math.sin(d.direction) * length;
          return [[x, y], [endX, endY]];
        },
        getColor: (d: ParticleType) => {
          // ปรับความสว่างของสีเส้นทาง
          const [r, g, b, a] = d.color;
          // เพิ่มความสว่างของสีเพื่อให้เห็นชัดขึ้น
          return [Math.min(r + 40, 255), Math.min(g + 40, 255), Math.min(b + 40, 255), a];
        },
        getWidth: (d: ParticleType) => d.size * 0.8, // ใช้ size ที่ลดขนาดแล้ว
        updateTriggers: {
          getPath: this.state.timestamp,
          getColor: this.state.timestamp,
        }
      })
    ];
  }
}

// สร้าง WindLayer เป็นฟังก์ชันที่นำกลับไปใช้ซ้ำได้
export const createWindLayer = ({
  bounds,
  density = 25,      
  lengthScale = 0.5,  
  widthScale = 3,     
  particleCount = 1500, 
  animate = true,
  particleSpeed = 0.0075 // ลดความเร็วลง 50% จาก 0.015 เป็น 0.0075
}: WindLayerProps) => {
  // สร้าง WindParticleLayer สำหรับแสดงอนุภาคเคลื่อนไหว
  return new WindParticleLayer({
    id: 'wind-particle-layer',
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
const WindLayer: React.FC<WindLayerProps> = (props) => {
  useMemo(() => createWindLayer(props), [props]); // Simplify dependencies to just props
  
  return null;
};

export default WindLayer;

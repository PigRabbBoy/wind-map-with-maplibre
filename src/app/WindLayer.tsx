"use client";

// นำเข้าคอมโพเนนต์และฟังก์ชันที่จำเป็นจาก React
// - useMemo: ใช้เพื่อจดจำค่าที่คำนวณแล้วและป้องกันการคำนวณซ้ำในทุกรอบการเรนเดอร์
import React, { useMemo } from 'react';

// นำเข้าเลเยอร์พื้นฐานจาก deck.gl ที่จะใช้แสดงอนุภาคลม
// - PathLayer: ใช้สำหรับวาดเส้นแสดงทิศทางลมและหางของอนุภาค
// - ScatterplotLayer: ใช้สำหรับวาดจุดแสดงตำแหน่งปัจจุบันของอนุภาค
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

// นำเข้าคลาสและประเภทข้อมูลสำหรับสร้างเลเยอร์แบบ composite จาก deck.gl
// - CompositeLayer: คลาสสำหรับสร้างเลเยอร์ที่ประกอบด้วยเลเยอร์ย่อยหลายตัว
// - CompositeLayerProps: ประเภทข้อมูลสำหรับคุณสมบัติของ CompositeLayer
// - Layer: คลาสพื้นฐานของทุกเลเยอร์
// - UpdateParameters: ประเภทข้อมูลสำหรับพารามิเตอร์ที่ใช้ในการอัพเดตเลเยอร์
import { CompositeLayer, CompositeLayerProps, Layer, UpdateParameters } from '@deck.gl/core';

// นำเข้าฟังก์ชันและประเภทข้อมูลสำหรับการจัดการข้อมูลลมจำลอง
// - generateMockWindData: ฟังก์ชันสร้างข้อมูลลมจำลองตามขอบเขตที่กำหนด
// - getWindColor: ฟังก์ชันสำหรับแปลงความเร็วลมเป็นสีที่เหมาะสม
// - WindPoint: ประเภทข้อมูลสำหรับจุดข้อมูลลมแต่ละจุด
import { generateMockWindData, getWindColor, WindPoint } from '../data/mockWindData';

// กำหนด props สำหรับคอมโพเนนต์ WindLayer - เป็นพารามิเตอร์ที่ใช้ในการกำหนดลักษณะการแสดงผลของชั้นข้อมูลลม
type WindLayerProps = {
  bounds: {
    west: number;    // ขอบเขตด้านตะวันตกของพื้นที่ (longitude) - เส้นลองจิจูดที่เป็นขอบซ้ายสุด
    south: number;   // ขอบเขตด้านใต้ของพื้นที่ (latitude) - เส้นละติจูดที่เป็นขอบล่างสุด
    east: number;    // ขอบเขตด้านตะวันออกของพื้นที่ (longitude) - เส้นลองจิจูดที่เป็นขอบขวาสุด
    north: number;   // ขอบเขตด้านเหนือของพื้นที่ (latitude) - เส้นละติจูดที่เป็นขอบบนสุด
  };
  density?: number;   // ความหนาแน่นของจุดลม (จำนวนจุดต่อแกน) - ยิ่งมากยิ่งละเอียด แต่ประมวลผลหนักขึ้น
  lengthScale?: number;  // ค่าปรับขนาดความยาวของลูกศรลม - ควบคุมความยาวของเส้นที่แสดงทิศทางลม
  widthScale?: number;   // ค่าปรับขนาดความกว้างของลูกศรลม - ควบคุมความหนาของเส้นที่แสดงทิศทางลม
  particleCount?: number; // จำนวนอนุภาคที่ใช้ในการแสดงผล - กำหนดจำนวนอนุภาคที่จะแสดงบนแผนที่
  animate?: boolean;  // เปิด/ปิดการเคลื่อนไหว - ควบคุมว่าจะแสดงเป็นแบบเคลื่อนไหวหรือแบบคงที่
  particleSpeed?: number; // ความเร็วของอนุภาค - กำหนดความเร็วในการเคลื่อนที่ของอนุภาคลม
};

// กำหนด props สำหรับเลเยอร์ WindParticleLayer ซึ่งเป็นเลเยอร์แบบ Composite ที่สร้างขึ้นเองสำหรับแสดงอนุภาคลม
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
  id?: string;  // ค่า id ที่ใช้ระบุตัวตนของเลเยอร์ ต้องไม่ซ้ำกับเลเยอร์อื่นใน deck.gl
};

// กำหนดประเภทข้อมูลสำหรับอนุภาคลมแต่ละอนุภาค เพื่อใช้ในการเก็บข้อมูลและแสดงผลการเคลื่อนไหว
type ParticleType = {
  position: [number, number]; // ตำแหน่งปัจจุบัน [longitude, latitude] บนแผนที่
  direction: number;         // ทิศทางการเคลื่อนที่ (หน่วยเป็น radians) โดยที่ 0 คือทิศตะวันออก และเพิ่มตามเข็มนาฬิกา
  speed: number;             // ความเร็วการเคลื่อนที่ (ค่าสัมพัทธ์ ไม่ใช่หน่วย SI)
  age: number;               // อายุปัจจุบันของอนุภาค (นับเป็นจำนวนเฟรม)
  maxAge: number;            // อายุสูงสุดของอนุภาคก่อนที่จะถูกสร้างใหม่ (นับเป็นจำนวนเฟรม)
  size: number;              // ขนาดของอนุภาค (หน่วยเป็นพิกเซล)
  color: [number, number, number, number]; // สี RGBA (แต่ละค่าเป็นช่วง 0-255)
};

// สร้างเลเยอร์แบบ Composite ที่กำหนดเองสำหรับแสดงอนุภาคลม
// CompositeLayer เป็นคลาสฐานจาก deck.gl ที่ช่วยให้สร้างเลเยอร์ที่ประกอบด้วยเลเยอร์ย่อยหลายตัวได้
class WindParticleLayer extends CompositeLayer<WindParticleLayerProps> {
  static layerName = 'WindParticleLayer';  // กำหนดชื่อของเลเยอร์เพื่อการอ้างอิง
  static defaultProps = {
    particleCount: 1000,  // จำนวนอนุภาคเริ่มต้น 1000 อนุภาค
    animate: true,        // เปิดการเคลื่อนไหวเป็นค่าเริ่มต้น
    particleSpeed: 0.02,  // ความเร็วของอนุภาคเริ่มต้น
    fadeOpacity: 0.996,   // ค่าการจางหายของการเคลื่อนไหว (ยิ่งมากยิ่งหายช้า)
  };

  // ประกาศตัวแปรสำหรับเก็บ ID ของ animation frame เพื่อใช้ในการยกเลิกแอนิเมชันเมื่อไม่ต้องการ
  animationFrame: number | null = null;

  // กำหนดสถานะเริ่มต้นของเลเยอร์
  state = {
    particles: [] as ParticleType[],  // อาร์เรย์เก็บอนุภาคทั้งหมด
    timestamp: 0,                      // เวลาปัจจุบัน ใช้สำหรับ trigger การอัพเดต
    windData: [] as WindPoint[],       // ข้อมูลลม ที่ได้จากการสร้างจำลอง
  };

  // ฟังก์ชันที่จะถูกเรียกเมื่อเริ่มต้นสร้างเลเยอร์
  initializeState() {
    // สร้างข้อมูลลมจำลองและอนุภาคเมื่อเริ่มต้น
    const { bounds, density = 20 } = this.props;
    const windData = generateMockWindData(bounds, density); // สร้างข้อมูลลมจำลองตามขอบเขตและความหนาแน่นที่กำหนด
    this.setState({ 
      windData,  // เก็บข้อมูลลมที่สร้างไว้ในสถานะ
      particles: this.generateParticles(windData)  // สร้างและเก็บอนุภาคตามข้อมูลลมที่สร้างขึ้น
    });
    
    // ตั้งค่า animation loop โดยใช้ requestAnimationFrame ของเบราว์เซอร์
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }

  // ฟังก์ชันที่จะถูกเรียกเมื่อต้องการทำลายเลเยอร์
  finalizeState() {
    // ยกเลิกการทำงานของ animation loop ถ้ามีการทำงานอยู่
    if (this.animationFrame) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // ฟังก์ชันตัดสินใจว่าจะต้องอัพเดตสถานะของเลเยอร์หรือไม่
  shouldUpdateState(params: UpdateParameters<Layer<WindParticleLayerProps & Required<CompositeLayerProps>>>) {
    const { changeFlags } = params;
    // อัพเดตเมื่อ props เปลี่ยน หรือ viewport เปลี่ยน หรือข้อมูลเปลี่ยน
    return Boolean(changeFlags.propsChanged) || 
           Boolean(changeFlags.viewportChanged) || 
           Boolean(changeFlags.dataChanged);
  }
  
  // สร้างอนุภาคลมในบริเวณที่กำหนดตามข้อมูลลม
  generateParticles(windData: WindPoint[]) {
    const { particleCount = 1000 } = this.props;  // รับค่าจำนวนอนุภาคที่ต้องการ หรือใช้ค่าเริ่มต้น 1000
    const { bounds } = this.props;  // ขอบเขตพื้นที่ที่จะสร้างอนุภาค
    
    const particles: ParticleType[] = [];  // อาร์เรย์เก็บอนุภาคที่สร้าง
    
    // สร้างอนุภาคตามจำนวนที่กำหนด
    for (let i = 0; i < particleCount; i++) {
      // สุ่มตำแหน่งภายในขอบเขตที่กำหนด
      const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
      const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
      
      // หาข้อมูลลมที่ใกล้ตำแหน่งที่สุดเพื่อกำหนดทิศทางและความเร็วของอนุภาค
      let closestWindPoint = windData[0];
      let minDistance = Number.MAX_VALUE;
      
      for (const point of windData) {
        const dx = point.position[0] - longitude;
        const dy = point.position[1] - latitude;
        const distance = dx * dx + dy * dy;  // คำนวณระยะทางแบบพีทาโกรัสโดยไม่ต้องถอดรูท (เพื่อความเร็ว)
        
        if (distance < minDistance) {
          minDistance = distance;
          closestWindPoint = point;
        }
      }
      
      // สุ่มอายุอนุภาคเพื่อให้อนุภาคที่สร้างมีการเกิดใหม่ไม่พร้อมกัน
      const maxAge = 50 + Math.random() * 50;  // อายุสูงสุดระหว่าง 50-100 เฟรม
      
      // กำหนดสีตามความเร็วลม และเพิ่มค่า alpha เป็น 200 (จาก 255)
      const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
      
      // เพิ่มอนุภาคใหม่เข้าไปในอาร์เรย์
      particles.push({
        position: [longitude, latitude],
        direction: closestWindPoint.direction,
        speed: closestWindPoint.speed,
        age: Math.random() * maxAge,  // เริ่มต้นด้วยอายุที่สุ่มเพื่อกระจายการเกิดใหม่
        maxAge,
        size: 6 + closestWindPoint.speed * 15, // ขนาดอนุภาคแปรผันตามความเร็วลม (ลดขนาด 50% จาก 12+speed*30)
        color
      });
    }
    
    return particles;
  }
  
  // อัพเดตการเคลื่อนที่ของอนุภาคตามทิศทางและความเร็วลม
  updateParticles() {
    const { animate, particleSpeed = 0.0075, bounds } = this.props; // ลดความเร็วลง 50% จาก 0.015 เป็น 0.0075
    const { particles, windData } = this.state;
    
    // ถ้าปิดการเคลื่อนไหวหรือไม่มีอนุภาค ให้คืนค่าอนุภาคเดิม
    if (!animate || particles.length === 0) return particles;
    
    // อัพเดตแต่ละอนุภาค
    return particles.map(particle => {
      // เพิ่มอายุอนุภาคทุกครั้งที่อัพเดต
      particle.age += 1;
      
      // ถ้าอนุภาคหมดอายุ (อายุถึงค่าสูงสุด) ให้สร้างอนุภาคใหม่
      if (particle.age >= particle.maxAge) {
        // สุ่มตำแหน่งใหม่ภายในขอบเขต
        const longitude = bounds.west + Math.random() * (bounds.east - bounds.west);
        const latitude = bounds.south + Math.random() * (bounds.north - bounds.south);
        
        // หาข้อมูลลมที่ใกล้ตำแหน่งใหม่ที่สุด
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
        
        // กำหนดอายุสูงสุดและสีใหม่
        const maxAge = 50 + Math.random() * 50;
        const color = [...getWindColor(closestWindPoint.speed), 200] as [number, number, number, number];
        
        // คืนค่าอนุภาคใหม่
        return {
          position: [longitude, latitude],
          direction: closestWindPoint.direction,
          speed: closestWindPoint.speed,
          age: 0,  // เริ่มนับอายุใหม่จาก 0
          maxAge,
          size: 6 + closestWindPoint.speed * 15, // ขนาดตามความเร็วลม (ลดลง 50% จาก 12+speed*30)
          color
        };
      } else {
        // เคลื่อนที่อนุภาคตามทิศทางและความเร็ว
        const speed = particle.speed * particleSpeed;  // ปรับความเร็วตาม particleSpeed
        // คำนวณตำแหน่งใหม่ด้วยฟังก์ชัน cos/sin และความเร็ว
        const x = particle.position[0] + Math.cos(particle.direction) * speed;
        const y = particle.position[1] + Math.sin(particle.direction) * speed;
        
        // ตรวจสอบว่าอนุภาคยังอยู่ในขอบเขตหรือไม่
        if (x < bounds.west || x > bounds.east || y < bounds.south || y > bounds.north) {
          // ถ้าออกนอกขอบเขต ให้รีเซ็ตอายุเพื่อสร้างใหม่ในรอบถัดไป
          particle.age = particle.maxAge;
          return particle;
        }
        
        // อัพเดตค่าความโปร่งใสตามอายุ - ยิ่งอายุมากยิ่งจางลง
        const opacityFactor = 1 - particle.age / particle.maxAge;
        particle.color[3] = 200 * opacityFactor;
        
        // อัพเดตตำแหน่งอนุภาค
        particle.position = [x, y];
        
        return particle;
      }
    });
  }
  
  // ฟังก์ชันที่ทำงานในแต่ละเฟรมของแอนิเมชัน
  animate() {
    if (this.props.animate) {
      // อัพเดตอนุภาคทุกตัว
      const updatedParticles = this.updateParticles();
      // อัพเดตสถานะด้วยอนุภาคที่อัพเดตแล้วและเวลาปัจจุบัน
      this.setState({ 
        timestamp: Date.now(),  // ใช้เวลาปัจจุบันเพื่อเป็น trigger ให้ deck.gl รู้ว่าต้องอัพเดตการแสดงผล
        particles: updatedParticles 
      });
    }
    
    // ขอให้เรียกฟังก์ชัน animate อีกครั้งในเฟรมถัดไป (สร้างการเคลื่อนไหวต่อเนื่อง)
    this.animationFrame = window.requestAnimationFrame(this.animate.bind(this));
  }
  
  // สร้างและคืนค่าเลเยอร์ย่อยที่ใช้แสดงผลอนุภาคลม
  renderLayers() {
    const { particles } = this.state;
    const { widthScale = 3, animate } = this.props;
    
    // เมื่อ animation ถูกปิด ให้แสดงลูกศรทิศทางลมแทนการแสดงอนุภาคเคลื่อนที่
    if (!animate) {
      // ใช้ PathLayer เพื่อสร้างลูกศรแสดงทิศทางลมตามข้อมูลลมโดยตรง
      return [
        new PathLayer({
          id: `${this.props.id}-wind-arrows`,
          data: this.state.windData,
          pickable: false,  // ไม่ต้องการให้คลิกได้
          widthMinPixels: 2.25,  // ความกว้างขั้นต่ำของเส้น
          getPath: (d: WindPoint) => {
            const [x, y] = d.position;
            // คำนวณจุดปลายของลูกศรตามทิศทางลม
            const length = 0.5; // ความยาวของเส้นลูกศร
            const endX = x + Math.cos(d.direction) * length;
            const endY = y + Math.sin(d.direction) * length;
            
            // คำนวณจุดสำหรับสร้างหัวลูกศร
            const arrowSize = 0.15; // ขนาดของหัวลูกศร
            const arrowAngle = Math.PI / 6; // มุม 30 องศาสำหรับหัวลูกศร
            
            // คำนวณจุดด้านซ้ายของหัวลูกศร (จากจุดปลายลูกศร)
            const leftX = endX - arrowSize * Math.cos(d.direction + arrowAngle);
            const leftY = endY - arrowSize * Math.sin(d.direction + arrowAngle);
            
            // คำนวณจุดด้านขวาของหัวลูกศร (จากจุดปลายลูกศร)
            const rightX = endX - arrowSize * Math.cos(d.direction - arrowAngle);
            const rightY = endY - arrowSize * Math.sin(d.direction - arrowAngle);
            
            // เส้นทางที่สร้างเป็นลูกศรที่สมบูรณ์
            // รูปแบบ: จุดเริ่มต้น -> จุดปลาย -> จุดด้านซ้ายของหัวลูกศร -> จุดปลาย -> จุดด้านขวาของหัวลูกศร
            return [
              [x, y],          // จุดเริ่มต้น
              [endX, endY],    // จุดปลาย
              [leftX, leftY],  // ส่วนด้านซ้ายของหัวลูกศร
              [endX, endY],    // กลับมาที่จุดปลาย
              [rightX, rightY] // ส่วนด้านขวาของหัวลูกศร
            ];
          },
          getColor: (d: WindPoint) => {
            // ใช้ฟังก์ชัน getWindColor เพื่อรับสีที่เหมาะสมตามความเร็วลม
            const [r, g, b] = getWindColor(d.speed);
            return [r, g, b, 200]; // กำหนดความโปร่งใสให้กับเส้นลูกศร
          },
          getWidth: (d: WindPoint) => d.speed * 3 + 1, // ความหนาของเส้นแปรผันตามความเร็วลม
        })
      ];
    }
    
    // กรณีเปิด animation แสดงอนุภาคเคลื่อนไหวตามปกติ โดยใช้ 2 เลเยอร์ร่วมกัน
    return [
      // เลเยอร์แรก: ScatterplotLayer สำหรับแสดงจุดอนุภาค
      new ScatterplotLayer({
        id: `${this.props.id}-particles`,
        data: particles,
        pickable: false,
        opacity: 1,
        stroked: false,  // ไม่มีเส้นขอบ
        filled: true,    // มีสีเต็มจุด
        radiusScale: widthScale * 1.5, // ปรับขนาดอนุภาคตาม widthScale
        getPosition: (d: ParticleType) => d.position,  // ตำแหน่งของจุด
        getRadius: (d: ParticleType) => d.size * 1.2,  // ขนาดรัศมีของจุด
        getFillColor: (d: ParticleType) => d.color,    // สีของจุด
        getLineColor: [255, 255, 255],                 // สีเส้นขอบ (ไม่ถูกใช้เพราะ stroked=false)
        updateTriggers: {
          // ทริกเกอร์ที่บอก deck.gl ว่าเมื่อไรควรอัพเดตข้อมูลใหม่
          getPosition: this.state.timestamp,
          getFillColor: this.state.timestamp,
        }
      }),
      
      // เลเยอร์ที่สอง: PathLayer สำหรับวาดเส้นทางหางของอนุภาค
      new PathLayer({
        id: `${this.props.id}-trails`,
        data: particles,
        pickable: false,
        widthMinPixels: 2.25, // ความกว้างขั้นต่ำของเส้น (ลดลง 50% จาก 4.5)
        getPath: (d: ParticleType) => {
          const [x, y] = d.position;
          // สร้างเส้นทางย้อนหลังจากตำแหน่งปัจจุบันในทิศตรงข้ามกับทิศทางลม
          const length = d.speed * 0.45; // ความยาวของเส้นหางอนุภาค
          const endX = x - Math.cos(d.direction) * length;
          const endY = y - Math.sin(d.direction) * length;
          return [[x, y], [endX, endY]];  // เส้นจากจุดปัจจุบันไปยังจุดสิ้นสุด
        },
        getColor: (d: ParticleType) => {
          // ปรับสีของเส้นหางให้สว่างกว่าสีของอนุภาคเล็กน้อย
          const [r, g, b, a] = d.color;
          // เพิ่มค่าความสว่าง แต่ไม่เกิน 255
          return [Math.min(r + 40, 255), Math.min(g + 40, 255), Math.min(b + 40, 255), a];
        },
        getWidth: (d: ParticleType) => d.size * 0.8, // ความหนาของเส้นหาง (80% ของขนาดอนุภาค)
        updateTriggers: {
          getPath: this.state.timestamp,
          getColor: this.state.timestamp,
        }
      })
    ];
  }
}

// ฟังก์ชันช่วยสำหรับสร้าง WindLayer อย่างสะดวก - ฟังก์ชันนี้จะถูกเรียกใช้จากภายนอกไฟล์
export const createWindLayer = ({
  bounds,
  density = 25,      // ความหนาแน่นพื้นฐาน 25 จุดต่อแกน
  lengthScale = 0.5,  // ตัวคูณความยาวพื้นฐาน 0.5
  widthScale = 3,     // ตัวคูณความกว้างพื้นฐาน 3
  particleCount = 1500, // จำนวนอนุภาคพื้นฐาน 1500 อนุภาค
  animate = true,     // เปิดการเคลื่อนไหวเป็นค่าเริ่มต้น
  particleSpeed = 0.0075 // ความเร็วอนุภาคพื้นฐาน (ลดความเร็วลง 50% จาก 0.015)
}: WindLayerProps) => {
  // สร้างและคืนค่า WindParticleLayer พร้อมกำหนดค่าตามพารามิเตอร์
  return new WindParticleLayer({
    id: 'wind-particle-layer', // กำหนด ID ของเลเยอร์
    bounds,
    density,
    lengthScale,
    widthScale,
    particleCount,
    animate,
    particleSpeed
  });
};

// React component สำหรับใช้กับ <DeckGL> component
// ฟังก์ชันนี้เป็น wrapper แบบ React สำหรับ createWindLayer ที่สร้างด้านบน
const WindLayer: React.FC<WindLayerProps> = (props) => {
  // ใช้ useMemo เพื่อสร้างเลเยอร์เฉพาะเมื่อ props เปลี่ยนแปลง เพื่อประสิทธิภาพ
  useMemo(() => createWindLayer(props), [props]); // ลดความซับซ้อนของ dependencies เหลือเพียง props
  
  // ไม่จำเป็นต้องคืนค่า JSX เพราะเป็น deck.gl layer (ไม่ใช่ React component ปกติ)
  return null;
};

export default WindLayer;

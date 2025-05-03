// ไฟล์สำหรับสร้างข้อมูลลมจำลองสำหรับการแสดงผลภาพเคลื่อนไหวของทิศทางลม

// กำหนดโครงสร้างข้อมูลของจุดลม
export type WindPoint = {
  position: [number, number]; // ตำแหน่ง longitude, latitude
  direction: number;          // ทิศทางลม (หน่วยเป็น radians)
  speed: number;              // ความเร็วลม (ค่าปรับให้อยู่ระหว่าง 0-1)
};

// กำหนดโครงสร้างข้อมูลของอนุภาคลมสำหรับการเคลื่อนที่
export type WindParticle = {
  x: number;                  // ตำแหน่ง x บนหน้าจอ
  y: number;                  // ตำแหน่ง y บนหน้าจอ
  age: number;                // อายุปัจจุบันของอนุภาค
  maxAge: number;             // อายุสูงสุดของอนุภาคก่อนที่จะถูกสร้างใหม่
  speed: number;              // ความเร็วของอนุภาค
  direction: number;          // ทิศทางการเคลื่อนที่ (หน่วยเป็น radians)
};

// Type for map object with the required methods
export type MapWithProjection = {
  unproject: (point: [number, number]) => { lng: number; lat: number };
};

// ฟังก์ชันสร้างข้อมูลลมจำลองเป็นกริดบนพื้นที่ที่กำหนด
export function generateMockWindData(
  bounds: {
    west: number;             // ขอบเขตด้านตะวันตก (longitude)
    south: number;            // ขอบเขตด้านใต้ (latitude)
    east: number;             // ขอบเขตด้านตะวันออก (longitude)
    north: number;            // ขอบเขตด้านเหนือ (latitude)
  },
  density: number = 15        // ความหนาแน่นของกริด (จำนวนจุดต่อแกน)
): WindPoint[] {
  const windData: WindPoint[] = [];
  
  // กำหนดขีดจำกัดจำนวนจุดเพื่อป้องกันการประมวลผลมากเกินไป
  const safetyLimit = 500;
  const effectiveDensity = Math.min(density, 30); // จำกัดความหนาแน่นไม่เกิน 30 จุดต่อแกน
  
  // คำนวณระยะห่างของแต่ละจุดในกริด
  const lonStep = (bounds.east - bounds.west) / effectiveDensity;
  const latStep = (bounds.north - bounds.south) / effectiveDensity;
  
  // นับจำนวนจุดเพื่อให้แน่ใจว่าไม่เกินขีดจำกัด
  let pointCount = 0;

  // สร้างกริดของจุดลม
  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lon = bounds.west; lon <= bounds.east; lon += lonStep) {
      // ตรวจสอบว่าเกินขีดจำกัดความปลอดภัยหรือไม่
      if (pointCount >= safetyLimit) {
        console.warn(`Wind data point limit (${safetyLimit}) reached. Some areas may not be covered.`);
        return windData;
      }
      
      // จำลองรูปแบบลมสำหรับประเทศไทย
      // แบ่งเป็นรูปแบบที่แตกต่างกันตามตำแหน่งเพื่อสร้างการไหลที่สมจริงมากขึ้น
      // ภาคเหนือของไทย: การไหลในแนวตะวันออก-ตะวันตกมากกว่า
      // ภาคใต้ของไทย (คาบสมุทร): การไหลที่ผันแปรมากกว่าเพราะอิทธิพลของมหาสมุทร
      
      let direction, speed;
      
      // ตรวจสอบว่าอยู่ในภาคเหนือหรือภาคใต้ของไทย
      const isNorth = lat > 14.0;
      
      if (isNorth) {
        // รูปแบบลมสำหรับภาคเหนือของไทย (มีการไหลในแนวตะวันออก-ตะวันตกตามฤดูมรสุม)
        direction = Math.PI * 0.5 + 
          Math.sin(lat * 0.3) * 0.5 + 
          Math.cos(lon * 0.2) * 0.3;
        
        speed = 0.3 + 0.3 * Math.abs(Math.sin(lat * 0.1 + lon * 0.2));
      } else {
        // รูปแบบลมสำหรับภาคใต้ของไทย (คาบสมุทร) - มีความผันแปรมากกว่าเนื่องจากอิทธิพลของมหาสมุทร
        direction = Math.PI * 0.25 + 
          Math.sin(lat * 0.4 + lon * 0.3) * Math.PI * 0.5 + 
          Math.cos(lat * 0.3) * 0.4;
        
        speed = 0.2 + 
          0.4 * Math.abs(Math.sin(lat * 0.2) + Math.sin(lon * 0.3));
      }

      // เพิ่มจุดลมเข้าในรายการ
      windData.push({
        position: [lon, lat],
        direction,
        speed
      });
      
      pointCount++;
    }
  }

  return windData;
}

// สร้างอนุภาคลมสำหรับการเคลื่อนไหว
export function generateWindParticles(
  windData: WindPoint[],       // ข้อมูลลมที่จะใช้
  width: number,               // ความกว้างของพื้นที่แสดงผล
  height: number,              // ความสูงของพื้นที่แสดงผล
  map: MapWithProjection,      // อ็อบเจกต์แผนที่
  count: number = 1000         // จำนวนอนุภาคที่ต้องการสร้าง
): WindParticle[] {
  const particles: WindParticle[] = [];
  
  // สร้างอนุภาคแบบสุ่มทั่วหน้าจอ
  for (let i = 0; i < count; i++) {
    // สุ่มตำแหน่งบนหน้าจอ
    const x = Math.random() * width;
    const y = Math.random() * height;
    
    // แปลงพิกัดหน้าจอเป็นพิกัดทางภูมิศาสตร์
    const lngLat = map.unproject([x, y]);
    
    // หาจุดลมที่ใกล้ที่สุดเพื่อรับทิศทางและความเร็ว
    let closestDistance = Infinity;
    let closestWindPoint: WindPoint | null = null;
    
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
    
    if (closestWindPoint) {
      // สร้างอนุภาคด้วยคุณสมบัติจากจุดลมที่ใกล้ที่สุด
      const maxAge = 50 + Math.random() * 50; // อายุสูงสุดแบบสุ่มระหว่าง 50-100 เฟรม
      
      particles.push({
        x,
        y,
        age: Math.random() * maxAge, // อายุเริ่มต้นแบบสุ่ม
        maxAge,
        direction: closestWindPoint.direction,
        speed: closestWindPoint.speed * 1.5 // ปรับความเร็วสำหรับเอฟเฟกต์ภาพ
      });
    }
  }
  
  return particles;
}

// อัพเดตอนุภาคลมสำหรับแต่ละเฟรมของแอนิเมชัน
export function updateWindParticles(
  particles: WindParticle[],    // อนุภาคลมทั้งหมดที่มีอยู่
  windData: WindPoint[],        // ข้อมูลลมสำหรับคำนวณทิศทางและความเร็ว
  width: number,                // ความกว้างของพื้นที่แสดงผล
  height: number,               // ความสูงของพื้นที่แสดงผล
  map: MapWithProjection        // อ็อบเจกต์แผนที่
): WindParticle[] {
  return particles.map(particle => {
    // เคลื่อนที่อนุภาคตามทิศทางและความเร็วของมัน
    particle.x += Math.cos(particle.direction) * particle.speed * 2;
    particle.y += Math.sin(particle.direction) * particle.speed * 2;
    particle.age += 1;
    
    // ถ้าอนุภาคเก่าเกินไปหรืออยู่นอกขอบเขต ให้รีเซ็ต
    if (particle.age >= particle.maxAge || 
        particle.x < 0 || particle.x > width ||
        particle.y < 0 || particle.y > height) {
      
      // รีเซ็ตเป็นตำแหน่งสุ่มใหม่
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      // รับทิศทางและความเร็วใหม่จากข้อมูลลม
      const lngLat = map.unproject([x, y]);
      
      // หาจุดลมที่ใกล้ที่สุด
      let closestDistance = Infinity;
      let closestWindPoint: WindPoint | null = null;
      
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
      
      if (closestWindPoint) {
        return {
          x,
          y,
          age: 0,
          maxAge: 50 + Math.random() * 50,
          direction: closestWindPoint.direction,
          speed: closestWindPoint.speed * 1.5
        };
      }
    }
    
    return particle;
  });
}

// ฟังก์ชันช่วยสำหรับการทำงานกับข้อมูลลมจำลอง

// รับสีสำหรับลมตามความเร็ว
export function getWindColor(speed: number): [number, number, number] {
  // สีที่มองเห็นได้ชัดเจนสำหรับการซ้อนทับบนแผนที่
  // ใช้สีที่มีความอิ่มตัวมากขึ้นเพื่อให้เด่นชัดเมื่อเทียบกับพื้นหลังแผนที่
  if (speed < 0.3) {
    // ลมอ่อน - สีฟ้าสว่าง
    return [30, 144, 255]; // DodgerBlue
  } else if (speed < 0.6) {
    // ลมปานกลาง - ไล่ระดับจากเขียวไปเหลือง
    const g = Math.round(200 + speed * 55);
    return [255, g, 0]; 
  } else {
    // ลมแรง - ส้มถึงแดง
    const g = Math.round(165 - speed * 165);
    return [255, g, 0];
  }
}

// รับสีอนุภาคพร้อมการจางหายตามอายุ
export function getParticleColor(speed: number, age: number, maxAge: number): string {
  const [r, g, b] = getWindColor(speed);
  const alpha = (1 - age / maxAge) * 0.85; // จางหายเมื่ออนุภาคอายุมากขึ้น
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
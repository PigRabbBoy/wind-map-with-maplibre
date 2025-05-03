// หน้าหลักของแอปพลิเคชัน - เรียกใช้คอมโพเนนต์ Map
import Map from './map';

// คอมโพเนนต์หน้าหลักแบบ Server Component (เป็นค่าเริ่มต้นใน Next.js app directory)
export default function Home() {
  return (
    <main>
      {/* เรียกใช้คอมโพเนนต์ Map ที่มีการแสดงแผนที่และอนุภาคลม */}
      <Map />
    </main>
  );
}

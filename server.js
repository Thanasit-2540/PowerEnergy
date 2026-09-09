import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';

// โหลดค่าจากไฟล์ .env
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// เตรียม Supabase Client (รับค่าจาก Render Environment)
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// API สำหรับบันทึกข้อมูลและอัปโหลดรูป
app.post('/api/save-data', upload.array('images', 3), async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({ error: 'Supabase URL หรือ Key ยังไม่ได้ตั้งค่า' });
        }

        const { recorderName, meterType, records } = req.body;
        const parsedRecords = JSON.parse(records); // [{slotId, code, value}]
        const files = req.files; // Array of up to 3 images

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
        }

        let savedData = [];

        // ลูปประมวลผลทีละรูป
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const record = parsedRecords[i]; // ข้อมูลที่คู่กับรูปนี้
            
            // 1. สร้างชื่อไฟล์สุ่มป้องกันซ้ำ
            const fileExt = file.mimetype.split('/')[1] || 'jpg';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${meterType}/${fileName}`;

            // 2. อัปโหลดรูปขึ้น Supabase Storage (Bucket: meter_images)
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('meter_images')
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype
                });

            if (uploadError) throw uploadError;

            // ดึง Public URL ของรูป
            const { data: publicUrlData } = supabase.storage.from('meter_images').getPublicUrl(filePath);
            const imageUrl = publicUrlData.publicUrl;

            // 3. เตรียมข้อมูลสำหรับบันทึกลง Database
            savedData.push({
                recorder_name: recorderName,
                meter_type: meterType,
                expected_code: record.expectedCode,
                read_code: record.code,
                reading_value: parseFloat(record.value),
                image_url: imageUrl,
                created_at: new Date().toISOString()
            });
        }

        // 4. บันทึกข้อมูลลงตาราง meter_readings ทีเดียว 3 แถว
        const { error: dbError } = await supabase
            .from('meter_readings')
            .insert(savedData);

        if (dbError) throw dbError;

        res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', count: savedData.length });

    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

app.post('/api/read-meter', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาอัปโหลดรูปภาพ' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        
        // 🔥 เปลี่ยนมาใช้รุ่น Lite เพื่อเน้นความเร็วสูงสุด (Low Latency)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

        const promptText = `
        อ่านค่าจากหน้าจอมิเตอร์ไฟฟ้านี้ แล้วตอบกลับมาเป็น JSON ตามรูปแบบนี้เท่านั้น:
        {
          "status": "success หรือ blurry (ถ้าภาพเบลอ ไม่ใช่มิเตอร์ หรือมองไม่เห็นตัวเลข ให้ตอบ blurry)",
          "code": "ตัวเลขมุมซ้ายบน (ถ้ามองไม่เห็นให้ใส่ null)",
          "value": "ตัวเลขตรงกลางจอ (ถ้ามองไม่เห็นให้ใส่ null)"
        }
        ห้ามอธิบายเพิ่ม ตอบแค่ JSON อย่างเดียว
        `;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: promptText },
                        {
                            inline_data: {
                                mime_type: req.file.mimetype,
                                data: req.file.buffer.toString("base64")
                            }
                        }
                    ]
                }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error:", errorText);
            return res.status(500).json({ error: 'Gemini API Error', details: errorText });
        }

        const data = await response.json();
        
        // ดึงข้อความจากโครงสร้างของ REST API
        let responseText = data.candidates[0].content.parts[0].text;
        
        // ลบ markdown (เผื่อ AI ห่อโค้ดกลับมา) เพื่อให้แปลงเป็น JSON ได้
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedJson = JSON.parse(responseText);

        res.json(parsedJson);

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประมวลผล' });
    }
});

app.listen(port, async () => {
    console.log(`🚀 Server เปิดแล้วที่ http://localhost:${port}`);
    console.log("⏳ กำลังตรวจสอบรายชื่อโมเดลที่ใช้งานได้จาก Google...");
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        
        if (data.models) {
            // กรองเอาเฉพาะชื่อโมเดลที่น่าจะใช้ประมวลผลได้
            const modelNames = data.models
                .map(m => m.name)
                .filter(name => name.includes("gemini"));
            console.log("✅ โมเดลที่คุณสามารถใช้งานได้มีดังนี้:");
            modelNames.forEach(m => console.log("   -", m));
            console.log("👉 รบกวนก๊อปปี้ชื่อโมเดลด้านบนมาให้ผมดูหน่อยครับ");
        } else {
            console.log("❌ ไม่สามารถดึงรายชื่อโมเดลได้:", data);
        }
    } catch (e) {
        console.error("Error fetching models:", e);
    }
});

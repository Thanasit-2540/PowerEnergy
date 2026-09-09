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

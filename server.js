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

        const { recorderName, meterId, meterType, records } = req.body;
        const parsedRecords = JSON.parse(records); // [{code, value}]
        const files = req.files; // Array of images

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพ' });
        }

        // เตรียมข้อมูลตั้งต้น 1 แถว สำหรับ Insert ลงฐานข้อมูล
        let insertData = {
            "recorder_name": recorderName,
            "House Number": meterId
        };

        // ลูปประมวลผลและอัปโหลดทีละรูป
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const record = parsedRecords[i]; // ข้อมูลที่คู่กับรูปนี้
            
            // 1. อัปโหลดรูปขึ้น Supabase Storage
            const fileExt = file.mimetype.split('/')[1] || 'jpg';
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${meterId}/${fileName}`;

            const { error: uploadError } = await supabase
                .storage
                .from('meter_images')
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype
                });

            if (uploadError) throw uploadError;

            // ดึง Public URL ของรูป
            const { data: publicUrlData } = supabase.storage.from('meter_images').getPublicUrl(filePath);
            const imageUrl = publicUrlData.publicUrl;

            // 2. จัดเรียงข้อมูลลงในแถวตามประเภท (รหัส)
            if (meterType === 'electric') {
                insertData[record.code] = record.value; // เช่น คอลัมน์ '010'
                insertData[`IMG${record.code}`] = imageUrl; // เช่น คอลัมน์ 'IMG010'
            } else if (meterType === 'water') {
                insertData['water_value'] = record.value; // คอลัมน์ 'water_value'
                insertData['water_img'] = imageUrl; // คอลัมน์ 'water_img'
            }
        }

        // 3. เลือกว่าจะบันทึกลงตารางไหน
        const tableName = meterType === 'electric' ? 'electric_readings' : 'water_readings';
        
        // เช็คว่าวันนี้มีการบันทึกของจุดนี้ไปแล้วหรือยัง (ใช้เวลาโซนไทย)
        const todayTH = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Bangkok'}); // ได้ 'YYYY-MM-DD'
        const startOfDay = new Date(`${todayTH}T00:00:00+07:00`).toISOString();
        const endOfDay = new Date(`${todayTH}T23:59:59.999+07:00`).toISOString();

        const { data: existingData, error: findErr } = await supabase
            .from(tableName)
            .select('id')
            .eq('House Number', meterId)
            .gte('created_at', startOfDay)
            .lt('created_at', endOfDay)
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingData && existingData.length > 0) {
            // มีข้อมูลของวันนี้แล้ว ให้อัปเดตทับ (อัปเดตเฉพาะช่องที่มีค่าส่งมา)
            const existingId = existingData[0].id;
            insertData.created_at = new Date().toISOString(); // รีเซ็ตเวลาเป็นเวลาล่าสุด

            const { error: dbError } = await supabase
                .from(tableName)
                .update(insertData)
                .eq('id', existingId);

            if (dbError) throw dbError;
            res.json({ success: true, message: `อัปเดตข้อมูลที่ถ่ายซ้ำสำเร็จ` });
        } else {
            // ยังไม่มีข้อมูลในวันนี้ ให้สร้างแถวใหม่
            const { error: dbError } = await supabase
                .from(tableName)
                .insert([insertData]);

            if (dbError) throw dbError;
            res.json({ success: true, message: `บันทึกข้อมูลใหม่ลงระบบสำเร็จ` });
        }

    } catch (error) {
        console.error("Save Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message });
    }
});

// API สำหรับดึงข้อมูลทั้งหมดมาแสดงบน Dashboard
app.get('/api/get-records', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase URL หรือ Key ยังไม่ได้ตั้งค่า' });
        
        // ดึงข้อมูลไฟฟ้า (ถ้าตารางไม่มี อาจจะ error เราจับแยกกัน)
        let elecData = [];
        const { data: eData, error: elecErr } = await supabase
            .from('electric_readings')
            .select('*')
            .order('created_at', { ascending: false });
        if (!elecErr && eData) elecData = eData;
            
        // ดึงข้อมูลประปา (ถ้ายังไม่สร้างตาราง ให้ข้ามไป ไม่ต้องแจ้ง Error จนพัง)
        let waterData = [];
        const { data: wData, error: waterErr } = await supabase
            .from('water_readings')
            .select('*')
            .order('created_at', { ascending: false });
        if (!waterErr && wData) waterData = wData;
        
        // รวมข้อมูลและเรียงลำดับตามเวลาล่าสุด
        let combined = [...elecData, ...waterData];
        combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({ success: true, data: combined });
    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// API สำหรับดึงข้อมูลแบบเฉพาะเจาะจง 1 รายการ (เพื่อนำมาแก้ไข)
app.get('/api/get-single-record', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase URL หรือ Key ยังไม่ได้ตั้งค่า' });
        const { date, meterId, type } = req.query;
        if (!date || !meterId || !type) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
        
        const table = type === 'electric' ? 'electric_readings' : 'water_readings';
        
        // ค้นหาช่วงเวลาของวันที่เลือก
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);

        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('House Number', meterId)
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString())
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        
        if (data && data.length > 0) {
            res.json({ success: true, data: data[0] });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (error) {
        console.error("Fetch Single Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// API สำหรับบันทึกการแก้ไขข้อมูล หรือเพิ่มข้อมูลย้อนหลัง
app.post('/api/update-record', async (req, res) => {
    try {
        const { id, type, updates, meterId } = req.body;
        if (!type || !updates) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
        
        const table = type === 'electric' ? 'electric_readings' : 'water_readings';
        
        if (id) {
            // กรณีมี ID แสดงว่าเป็นการแก้ไขของเดิม
            const { error } = await supabase.from(table).update(updates).eq('id', id);
            if (error) throw error;
        } else {
            // กรณีไม่มี ID แสดงว่าเป็นการเพิ่มข้อมูลย้อนหลัง (Manual Insert)
            updates['House Number'] = meterId;
            // ให้สร้างเวลาใหม่ หรือเอาตามวันที่เลือก (ในที่นี้ให้ insert เป็นปัจจุบันไปก่อน เพราะเป็นแค่การจดชดเชย)
            const { error } = await supabase.from(table).insert([updates]);
            if (error) throw error;
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// API สำหรับนับข้อมูลเก่า
app.get('/api/count-old-data', async (req, res) => {
    try {
        if (!supabase) return res.json({ success: true, count: 0 });
        const days = parseInt(req.query.days) || 15;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString();

        let count = 0;
        for (const table of ['electric_readings', 'water_readings']) {
            const { count: c, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
                .lt('created_at', cutoffStr);
            // Ignore error if table doesn't exist yet
            if (!error && c) count += c;
        }
        res.json({ success: true, count });
    } catch (error) {
        console.error("Count Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// API สำหรับลบข้อมูลเก่า (รูปและ Database)
app.post('/api/delete-old-data', async (req, res) => {
    try {
        const { days } = req.body;
        if (!days) return res.status(400).json({ error: 'ไม่พบพารามิเตอร์ days' });
        
        const result = await cleanupOldData(days);
        res.json({ success: true, message: `ลบข้อมูลเก่าเกิน ${days} วัน เรียบร้อยแล้ว`, deletedCount: result });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

// ฟังก์ชันลบข้อมูลเก่า (ลบทั้งไฟล์รูปใน Storage และข้อมูลใน DB)
async function cleanupOldData(days) {
    if (!supabase) return 0;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    let totalDeleted = 0;
    const tables = ['electric_readings', 'water_readings'];
    
    for (const table of tables) {
        // 1. ค้นหาข้อมูลเก่า
        const { data: oldRecords, error: selectErr } = await supabase
            .from(table)
            .select('*')
            .lt('created_at', cutoffStr);
            
        if (selectErr || !oldRecords || oldRecords.length === 0) continue;

        // 2. แยกลิงก์รูปภาพเพื่อไปลบใน Storage
        let pathsToDelete = [];
        for (const r of oldRecords) {
            if (r.IMG010) pathsToDelete.push(extractPathFromUrl(r.IMG010));
            if (r.IMG011) pathsToDelete.push(extractPathFromUrl(r.IMG011));
            if (r.IMG012) pathsToDelete.push(extractPathFromUrl(r.IMG012));
            if (r.water_img) pathsToDelete.push(extractPathFromUrl(r.water_img));
        }
        pathsToDelete = pathsToDelete.filter(p => p !== null);

        // 3. ลบรูปใน Storage
        if (pathsToDelete.length > 0) {
            await supabase.storage.from('meter_images').remove(pathsToDelete);
        }

        // 4. ลบข้อมูลใน Database
        const ids = oldRecords.map(r => r.id);
        const { error: deleteErr } = await supabase
            .from(table)
            .delete()
            .in('id', ids);
            
        if (!deleteErr) totalDeleted += oldRecords.length;
    }
    
    return totalDeleted;
}

function extractPathFromUrl(url) {
    if (!url) return null;
    const marker = 'meter_images/';
    const idx = url.indexOf(marker);
    return idx !== -1 ? url.substring(idx + marker.length) : null;
}

// ลบอัตโนมัติ 20 วัน (ทำงานทุกๆ 24 ชั่วโมง)
setInterval(() => {
    console.log("Running auto-cleanup for > 20 days...");
    cleanupOldData(20).catch(console.error);
}, 1000 * 60 * 60 * 24);

app.post('/api/read-meter', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาอัปโหลดรูปภาพ' });
        }

        // 🔥 อัปเดตใช้รุ่นใหม่ล่าสุดที่รองรับการอ่านภาพ (Vision)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${apiKey}`;

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

// API ตรวจสอบรหัสผ่าน Admin
app.post('/api/verify-admin', (req, res) => {
    const { password } = req.body;
    // ดึงรหัสผ่านจาก .env หรือ Environment Variable ถ้าไม่ได้ตั้งไว้ให้ใช้ '1234' เป็นค่าเริ่มต้น
    const adminPassword = process.env.ADMIN_PASSWORD || '1234';
    
    if (password === adminPassword) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});
// ==========================================
// API จัดการรายชื่อพนักงาน และ จุดมิเตอร์
// ==========================================

// ดึงข้อมูลการตั้งค่าทั้งหมด (Meters & Recorders)
app.get('/api/settings', async (req, res) => {
    try {
        if (!supabase) return res.json({ success: false, error: 'No Supabase' });
        
        let meters = [];
        let recorders = [];
        let debugErrors = [];
        
        // ดึงจุดมิเตอร์
        const { data: metersData, error: errM } = await supabase.from('meters').select('*').order('created_at', { ascending: true });
        if (errM) {
            console.error('❌ meters error:', errM);
            debugErrors.push('meters: ' + errM.message);
        } else {
            meters = (metersData || []).map(m => ({ id: m.id, name: m.name, type: m.type }));
        }
        
        // ดึงรายชื่อพนักงาน
        const { data: recordersData, error: errR } = await supabase.from('recorders').select('*').order('created_at', { ascending: true });
        if (errR) {
            console.error('❌ recorders error:', errR);
            debugErrors.push('recorders: ' + errR.message);
        } else {
            recorders = (recordersData || []).map(r => r.name);
        }
        
        console.log(`📊 /api/settings: meters=${meters.length}, recorders=${recorders.length}, errors=${debugErrors.length}`);
        
        res.json({ success: true, meters, recorders, debugErrors });
    } catch(e) {
        console.error('❌ /api/settings crash:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/settings/add-meter', async (req, res) => {
    const { id, name, type } = req.body;
    try {
        const { error } = await supabase.from('meters').insert([{ id, name, type }]);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/settings/delete-meter', async (req, res) => {
    const { id } = req.body;
    try {
        const { error } = await supabase.from('meters').delete().eq('id', id);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/settings/add-recorder', async (req, res) => {
    const { name } = req.body;
    try {
        const { error } = await supabase.from('recorders').insert([{ name }]);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/settings/delete-recorder', async (req, res) => {
    const { name } = req.body;
    try {
        const { error } = await supabase.from('recorders').delete().eq('name', name);
        if (error) throw error;
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, error: e.message });
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
